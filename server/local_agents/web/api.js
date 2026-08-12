/**
 * Companion API client for the browser console.
 *
 * Credential handling differs from Android on purpose:
 *  - the refresh token never reaches script. It lives in an HttpOnly, SameSite=Strict
 *    cookie scoped to /api/v1/web, so an injected script cannot read or exfiltrate it;
 *  - the access token is held in memory only and is gone on reload, at which point the
 *    console silently re-derives one from the cookie;
 *  - cookie-authenticated routes additionally require the CSRF value to be echoed in a
 *    header, which only same-origin script can do.
 */

const CSRF_COOKIE = 'la_csrf';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Raised when the browser session is gone and the operator must pair again. */
export class SessionExpiredError extends ApiError {
  constructor(message) {
    super(401, message);
    this.name = 'SessionExpiredError';
  }
}

function readCookie(name) {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length));
  }
  return '';
}

async function detail(response, fallback) {
  try {
    const data = await response.json();
    if (typeof data?.detail === 'string') return data.detail;
    if (Array.isArray(data?.detail) && data.detail[0]?.msg) return data.detail[0].msg;
  } catch {
    /* non-JSON error bodies fall through to the caller's fallback text */
  }
  return fallback;
}

export class Api {
  constructor() {
    this.accessToken = '';
    this.deviceId = '';
    this._refreshing = null;
    this.onSessionLost = () => {};
  }

  get authenticated() {
    return Boolean(this.accessToken);
  }

  get csrfToken() {
    return readCookie(CSRF_COOKIE);
  }

  async health() {
    const response = await fetch('/health', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new ApiError(response.status, 'health check failed');
    return response.json();
  }

  async capabilities() {
    return this.request('GET', '/api/v1/capabilities');
  }

  // ---- browser session lifecycle ----

  async startSession(code, deviceName) {
    const response = await fetch('/api/v1/web/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ code, device_name: deviceName }),
    });
    if (!response.ok) {
      throw new ApiError(response.status, await detail(response, 'pairing failed'));
    }
    const data = await response.json();
    this.accessToken = data.access_token;
    this.deviceId = data.device_id;
    return data;
  }

  /** Exchange the HttpOnly cookie for a fresh access token. Single-flight. */
  refreshSession() {
    if (!this._refreshing) {
      this._refreshing = this._doRefresh().finally(() => {
        this._refreshing = null;
      });
    }
    return this._refreshing;
  }

  async _doRefresh() {
    // Refresh tokens rotate, so two tabs waking together race: one wins and the
    // other's token is already spent. The loser retries once, by which point the
    // winner's rotated cookie is in the shared jar and works.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const csrf = this.csrfToken;
      if (!csrf) throw new SessionExpiredError('no web session');
      const response = await fetch('/api/v1/web/refresh', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrf },
        credentials: 'same-origin',
      });
      if (response.ok) {
        const data = await response.json();
        this.accessToken = data.access_token;
        this.deviceId = data.device_id;
        return data;
      }
      if (response.status !== 401 || attempt === 1) {
        this.accessToken = '';
        throw new SessionExpiredError(await detail(response, 'web session expired'));
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new SessionExpiredError('web session expired');
  }

  async logout() {
    const csrf = this.csrfToken;
    this.accessToken = '';
    this.deviceId = '';
    if (!csrf) return;
    await fetch('/api/v1/web/logout', {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrf },
      credentials: 'same-origin',
    }).catch(() => {});
  }

  // ---- authenticated calls ----

  async request(method, path, body) {
    const send = async () => {
      const headers = { Authorization: `Bearer ${this.accessToken}` };
      const init = { method, headers, credentials: 'omit' };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      return fetch(path, init);
    };

    if (!this.accessToken) await this.refreshSession();
    let response = await send();
    if (response.status === 401) {
      await this.refreshSession();
      response = await send();
    }
    if (response.status === 401) {
      this.accessToken = '';
      this.onSessionLost();
      throw new SessionExpiredError('session expired');
    }
    if (!response.ok) {
      throw new ApiError(response.status, await detail(response, `request failed (${response.status})`));
    }
    if (response.status === 204) return null;
    return response.json();
  }

  listModels() { return this.request('GET', '/api/v1/models'); }
  listSessions() { return this.request('GET', '/api/v1/sessions'); }
  createSession(title) { return this.request('POST', '/api/v1/sessions', { title }); }
  renameSession(id, title) { return this.request('PATCH', `/api/v1/sessions/${id}`, { title }); }
  deleteSession(id) { return this.request('DELETE', `/api/v1/sessions/${id}`); }
  listMessages(id) { return this.request('GET', `/api/v1/sessions/${id}/messages`); }
  sessionContext(id) { return this.request('GET', `/api/v1/sessions/${id}/context`); }

  compressContext(id, model) {
    const body = model ? { model: model.id, provider: model.provider } : {};
    return this.request('POST', `/api/v1/sessions/${id}/context/compress`, body);
  }

  listRuns(limit = 100) { return this.request('GET', `/api/v1/runs?limit=${limit}`); }

  createRun(sessionId, prompt, model) {
    return this.request('POST', `/api/v1/sessions/${sessionId}/runs`, {
      prompt,
      model: model.id,
      provider: model.provider,
    });
  }

  command(runId, command, instruction) {
    const body = { command };
    if (instruction) body.instruction = instruction;
    return this.request('POST', `/api/v1/runs/${runId}/commands`, body);
  }

  // ---- run event stream ----

  /**
   * Follow a run's SSE stream.
   *
   * `EventSource` cannot send an Authorization header, so the stream is read from a
   * plain fetch body. That also lets the caller resume with `Last-Event-ID` after a
   * dropped connection, which is what makes a phone or laptop losing the network a
   * non-event for the run itself.
   */
  async streamRun(runId, lastEventId, { onEvent, onOpen, signal }) {
    if (!this.accessToken) await this.refreshSession();

    const open = async () => {
      const headers = {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'text/event-stream',
      };
      if (lastEventId > 0) headers['Last-Event-ID'] = String(lastEventId);
      return fetch(`/api/v1/runs/${runId}/events`, { headers, credentials: 'omit', signal });
    };

    let response = await open();
    if (response.status === 401) {
      await this.refreshSession();
      response = await open();
    }
    if (!response.ok || !response.body) {
      throw new ApiError(response.status, `stream failed (${response.status})`);
    }
    onOpen?.();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let split = buffer.indexOf('\n\n');
        while (split !== -1) {
          const frame = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const event = parseFrame(frame);
          if (event) onEvent(event);
          split = buffer.indexOf('\n\n');
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
  }
}

/** Turn one raw SSE frame into a run event, ignoring comments and heartbeats. */
export function parseFrame(frame) {
  const dataLines = [];
  for (const rawLine of frame.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (!line || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'data') dataLines.push(value);
  }
  if (!dataLines.length) return null;
  try {
    return JSON.parse(dataLines.join('\n'));
  } catch {
    return null;
  }
}
