/**
 * Local_Agents web console.
 *
 * Feature parity with the Android controller: pairing, sessions, live run streaming
 * with tool/source timelines, run controls, context compression, model selection and
 * settings. The companion API is identical for both clients — only credential storage
 * and presentation differ.
 *
 * Rendering is deliberately plain DOM. Every value that comes from the server or the
 * operator is written with textContent or as an element property, never as markup, so
 * agent output cannot become executable content in the page.
 */

import { Api, SessionExpiredError } from './api.js';
import { LANGUAGES, detectLanguage, setLanguage, storeLanguage, t } from './i18n.js';

const ACTIVE_STATUSES = new Set(['queued', 'running', 'paused']);
const MAX_RECONNECT = 5;
const THEME_KEY = 'local-agents.theme';
const THEMES = [
  { id: 'emerald', label: 'Emerald', canvas: '#090b0f', surface: '#11151b', border: '#2a3540', text: '#edf2f7', accent: '#38d6a3' },
  { id: 'cyan', label: 'Cyan', canvas: '#06070b', surface: '#0b0d14', border: '#1c2533', text: '#e9edf6', accent: '#38e1d6' },
  { id: 'ink', label: 'Ink', canvas: '#1a1714', surface: '#221e1a', border: '#2e2a24', text: '#f2ede4', accent: '#e78a5c' },
  { id: 'terminal', label: 'Terminal', canvas: '#080c08', surface: '#0c120c', border: '#1a3a22', text: '#bff5c4', accent: '#3df57e' },
  { id: 'clay', label: 'Clay', canvas: '#f5f1e8', surface: '#fcfaf4', border: '#e4dbca', text: '#221e1a', accent: '#c9402a' },
  { id: 'terracotta', label: 'Terracotta', canvas: '#f6efe4', surface: '#fdf8ee', border: '#e8dcc8', text: '#2a211a', accent: '#d2691e' },
  { id: 'olive', label: 'Olive', canvas: '#f2f1e6', surface: '#fafaf1', border: '#dedfc9', text: '#22241a', accent: '#5c6b3f' },
  { id: 'plum', label: 'Plum', canvas: '#f4efec', surface: '#fcf7f4', border: '#e6d8de', text: '#241a20', accent: '#7a3b52' },
];

const ICONS = {
  add: 'M11 13H5v-2h6V5h2v6h6v2h-6v6h-2z',
  refresh: 'M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z',
  pause: 'M6 19h4V5H6zm8-14v14h4V5z',
  play: 'M8 5v14l11-7z',
  stop: 'M6 6h12v12H6z',
  send: 'M2.01 21 23 12 2.01 3 2 10l15 2-15 2z',
  trash: 'M6 19c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z',
  edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z',
  chat: 'M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z',
  history: 'M13 3a9 9 0 0 0-9 9H1l3.96 3.96L9 12H6a7 7 0 1 1 7 7c-1.93 0-3.68-.79-4.94-2.06L6.64 18.36A9 9 0 1 0 13 3zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8z',
  tune: 'M3 17v2h6v-2zM3 5v2h10V5zm10 16v-2h8v-2h-8v-2h-2v6zM7 9v2H3v2h4v2h2V9zm14 4v-2H11v2zm-6-4h2V7h4V5h-4V3h-2z',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.94 3a8.9 8.9 0 0 0-.6-2.2l1.9-1.5-2-3.46-2.28.92a9 9 0 0 0-1.9-1.1L15.7 1h-4l-.36 2.66c-.68.27-1.32.64-1.9 1.1L7.16 3.84l-2 3.46 1.9 1.5A8.9 8.9 0 0 0 6.46 11H4v2h2.46c.12.77.33 1.5.6 2.2l-1.9 1.5 2 3.46 2.28-.92c.58.46 1.22.83 1.9 1.1L11.7 23h4l.36-2.66c.68-.27 1.32-.64 1.9-1.1l2.28.92 2-3.46-1.9-1.5c.27-.7.48-1.43.6-2.2H24v-2z',
  steer: 'M12 2 4.5 20.3l.7.7L12 18l6.8 3 .7-.7z',
  logout: 'M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.59L17 17l5-5zM4 5h8V3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8v-2H4z',
  close: 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  install: 'M19 9h-4V3H9v6H5l7 7zM5 18v2h14v-2z',
};

// ---------------------------------------------------------------- DOM helpers

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') throw new Error('raw markup is not allowed');
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key in node && key !== 'title' && key !== 'role') node[key] = value;
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name] || '');
  svg.append(path);
  return svg;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

// ---------------------------------------------------------------- formatting

function statusLabel(status) {
  const key = `status${status.charAt(0).toUpperCase()}${status.slice(1)}`;
  return t(key);
}

function statusTone(status) {
  switch (status) {
    case 'running': return 'run';
    case 'queued': case 'paused': return 'warn';
    case 'completed': return 'ok';
    case 'failed': case 'cancelled': return 'bad';
    default: return '';
  }
}

function relativeTime(iso) {
  const value = Date.parse(iso);
  if (Number.isNaN(value)) return '—';
  const seconds = Math.round((value - Date.now()) / 1000);
  const units = [
    ['second', 60], ['minute', 60], ['hour', 24], ['day', 7], ['week', 4.35], ['month', 12], ['year', Infinity],
  ];
  let amount = seconds;
  for (const [unit, span] of units) {
    if (Math.abs(amount) < span) {
      return new Intl.RelativeTimeFormat(document.documentElement.lang, { numeric: 'auto' })
        .format(Math.round(amount), unit);
    }
    amount /= span;
  }
  return '—';
}

function compactNumber(value) {
  return new Intl.NumberFormat(document.documentElement.lang, { notation: 'compact' }).format(value || 0);
}

function durationLabel(ms) {
  if (ms === null || ms === undefined) return '';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

function prettyJson(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Render text with fenced and inline code, building nodes rather than markup.
 * Everything else stays literal, which is the right call for agent output.
 */
function renderRichText(target, text) {
  const segments = String(text ?? '').split(/```/);
  segments.forEach((segment, index) => {
    if (index % 2 === 1) {
      const body = segment.replace(/^[a-zA-Z0-9+#.-]*\n/, '');
      target.append(el('pre', {}, el('code', { text: body })));
      return;
    }
    const parts = segment.split(/`([^`]+)`/);
    parts.forEach((part, partIndex) => {
      if (!part) return;
      target.append(partIndex % 2 === 1 ? el('code', { text: part }) : document.createTextNode(part));
    });
  });
}

// ---------------------------------------------------------------- state

const api = new Api();

const state = {
  ready: false,
  authed: false,
  view: 'sessions',
  health: null,
  hostStatus: 'unknown',
  online: false,
  loading: false,
  pairing: false,
  sessions: [],
  runs: [],
  models: [],
  messages: [],
  tools: [],
  sources: [],
  selectedSessionId: null,
  selectedModelKey: null,
  activeRun: null,
  context: null,
  compressing: false,
  reconnectAttempt: 0,
  steering: false,
  draft: '',
  theme: 'emerald',
  lang: 'tr',
  notified: new Set(),
  installPrompt: null,
};

let stream = { controller: null, runId: null, lastEventId: 0, generation: 0 };
const root = document.getElementById('root');
const toasts = document.getElementById('toasts');
let dom = null;
let pairDom = null;
let renderQueued = false;

function selectedSession() {
  return state.sessions.find((item) => item.id === state.selectedSessionId) || null;
}

function selectedModel() {
  return state.models.find((item) => `${item.provider}:${item.id}` === state.selectedModelKey) || null;
}

function runIsActive(run) {
  return Boolean(run && ACTIVE_STATUSES.has(run.status));
}

function usableModel(models, currentKey) {
  const current = models.find((item) => `${item.provider}:${item.id}` === currentKey);
  if (current && !current.capabilities?.includes('unavailable')) return current;
  return models.find((item) => !item.capabilities?.includes('unavailable')) || models[0] || null;
}

// ---------------------------------------------------------------- theme & toasts

function applyTheme(id) {
  const theme = THEMES.find((item) => item.id === id) || THEMES[0];
  state.theme = theme.id;
  document.documentElement.dataset.theme = theme.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.canvas);
  try {
    localStorage.setItem(THEME_KEY, theme.id);
  } catch {
    /* storage may be denied; the theme then lasts for this page only */
  }
}

function toast(message, tone = '') {
  const node = el('div', { class: `toast ${tone}`.trim() },
    el('span', { class: 'grow', text: message }),
    el('button', { type: 'button', 'aria-label': t('dismiss'), onClick: () => node.remove() }, icon('close')),
  );
  toasts.append(node);
  setTimeout(() => node.remove(), tone === 'bad' ? 9000 : 5000);
}

function reportError(error) {
  if (error instanceof SessionExpiredError) {
    toast(t('sessionExpired'), 'bad');
    handleSessionLost();
    return;
  }
  toast(error?.message || t('genericError'), 'bad');
}

function handleSessionLost() {
  stopStream();
  state.authed = false;
  state.sessions = [];
  state.runs = [];
  state.models = [];
  state.messages = [];
  state.tools = [];
  state.sources = [];
  state.selectedSessionId = null;
  state.activeRun = null;
  state.context = null;
  state.online = false;
  dom = null;
  mount();
}

// ---------------------------------------------------------------- data loading

async function loadAll() {
  state.loading = true;
  scheduleRender();
  try {
    const [models, sessions, runs] = await Promise.all([
      api.listModels(),
      api.listSessions(),
      api.listRuns(),
    ]);
    state.models = models;
    state.sessions = sessions;
    state.runs = runs;
    const model = usableModel(models, state.selectedModelKey);
    state.selectedModelKey = model ? `${model.provider}:${model.id}` : null;
    state.online = true;

    const next = sessions.find((item) => item.id === state.selectedSessionId) || sessions[0] || null;
    if (next) {
      await selectSession(next.id, { silent: true });
    } else {
      state.selectedSessionId = null;
      state.messages = [];
      state.context = null;
      state.activeRun = null;
    }
  } catch (error) {
    state.online = false;
    reportError(error);
  } finally {
    state.loading = false;
    scheduleRender();
  }
}

async function selectSession(sessionId, { silent = false } = {}) {
  if (state.selectedSessionId !== sessionId) {
    stopStream();
    state.tools = [];
    state.sources = [];
    state.messages = [];
  }
  state.selectedSessionId = sessionId;
  const active = state.runs.find((run) => run.session_id === sessionId && runIsActive(run));
  state.activeRun = active || state.runs.find((run) => run.session_id === sessionId) || null;
  scheduleRender();
  try {
    const [messages, context] = await Promise.all([
      api.listMessages(sessionId),
      api.sessionContext(sessionId),
    ]);
    if (state.selectedSessionId !== sessionId) return;
    state.messages = messages.map((item) => ({ ...item, streaming: false }));
    state.context = context;
    if (active) startStream(active.id, 0);
  } catch (error) {
    if (!silent) reportError(error);
  } finally {
    scheduleRender();
  }
}

async function refreshRuns() {
  try {
    state.runs = await api.listRuns();
    state.sessions = await api.listSessions();
    state.online = true;
  } catch (error) {
    state.online = false;
    reportError(error);
  }
  scheduleRender();
}

// ---------------------------------------------------------------- actions

async function createSession() {
  try {
    const session = await api.createSession(t('newChat'));
    state.sessions.unshift(session);
    state.selectedSessionId = session.id;
    state.messages = [];
    state.tools = [];
    state.sources = [];
    state.activeRun = null;
    state.context = null;
    state.view = 'chat';
    scheduleRender();
    dom?.textarea?.focus();
  } catch (error) {
    reportError(error);
  }
}

async function renameSession(session) {
  const title = await promptDialog(t('renameTitle'), session.title);
  if (title === null) return;
  const trimmed = title.trim();
  if (!trimmed || trimmed === session.title) return;
  try {
    const updated = await api.renameSession(session.id, trimmed.slice(0, 120));
    const index = state.sessions.findIndex((item) => item.id === session.id);
    if (index >= 0) state.sessions[index] = updated;
    scheduleRender();
  } catch (error) {
    reportError(error);
  }
}

async function deleteSession(session) {
  const confirmed = await confirmDialog(t('deleteTitle'), t('deleteBody', session.title));
  if (!confirmed) return;
  try {
    await api.deleteSession(session.id);
    if (state.selectedSessionId === session.id) stopStream();
    state.sessions = state.sessions.filter((item) => item.id !== session.id);
    state.runs = state.runs.filter((run) => run.session_id !== session.id);
    if (state.selectedSessionId === session.id) {
      state.selectedSessionId = null;
      state.messages = [];
      state.tools = [];
      state.sources = [];
      state.activeRun = null;
      state.context = null;
      const next = state.sessions[0];
      if (next) await selectSession(next.id, { silent: true });
    }
    scheduleRender();
  } catch (error) {
    reportError(error);
  }
}

async function sendPrompt() {
  const prompt = state.draft.trim();
  const session = selectedSession();
  const model = selectedModel();
  if (!prompt || !session || !model || runIsActive(state.activeRun)) return;

  state.draft = '';
  if (dom?.textarea) {
    dom.textarea.value = '';
    autoGrow(dom.textarea);
  }
  state.messages.push({
    id: `local-${Date.now()}`,
    session_id: session.id,
    role: 'user',
    content: prompt,
    created_at: new Date().toISOString(),
    streaming: false,
  });
  state.tools = [];
  state.sources = [];
  scheduleRender();

  try {
    const run = await api.createRun(session.id, prompt, model);
    state.activeRun = run;
    state.runs.unshift(run);
    startStream(run.id, 0);
    api.sessionContext(session.id).then((context) => {
      if (state.selectedSessionId === session.id) {
        state.context = context;
        scheduleRender();
      }
    }).catch(() => {});
    api.listSessions().then((sessions) => {
      state.sessions = sessions;
      scheduleRender();
    }).catch(() => {});
  } catch (error) {
    reportError(error);
  }
  scheduleRender();
}

async function runCommand(command, instruction) {
  const run = state.activeRun;
  if (!run) return;
  try {
    state.activeRun = await api.command(run.id, command, instruction);
    if (command === 'cancel') stopStream();
    scheduleRender();
  } catch (error) {
    reportError(error);
  }
}

async function compressContext() {
  const session = selectedSession();
  if (!session || state.compressing || runIsActive(state.activeRun)) return;
  state.compressing = true;
  scheduleRender();
  try {
    state.context = await api.compressContext(session.id, selectedModel());
  } catch (error) {
    reportError(error);
  } finally {
    state.compressing = false;
    scheduleRender();
  }
}

// ---------------------------------------------------------------- run stream

function stopStream() {
  stream.generation += 1;
  stream.controller?.abort();
  stream.controller = null;
  stream.runId = null;
  stream.lastEventId = 0;
  state.reconnectAttempt = 0;
}

function startStream(runId, lastEventId) {
  stopStream();
  stream.lastEventId = lastEventId;
  connectStream(runId, ++stream.generation);
}

async function connectStream(runId, generation) {
  if (generation !== stream.generation) return;
  const controller = new AbortController();
  stream.controller = controller;
  stream.runId = runId;
  try {
    await api.streamRun(runId, stream.lastEventId, {
      signal: controller.signal,
      onOpen: () => {
        if (generation !== stream.generation) return;
        state.online = true;
        state.reconnectAttempt = 0;
        scheduleRender();
      },
      onEvent: (event) => {
        if (generation !== stream.generation) return;
        stream.lastEventId = Math.max(stream.lastEventId, event.seq || 0);
        handleEvent(event);
      },
    });
    // A clean end means the run reached a terminal state and the server closed.
    if (generation === stream.generation) {
      stream.controller = null;
      state.reconnectAttempt = 0;
      scheduleRender();
    }
  } catch (error) {
    if (controller.signal.aborted || generation !== stream.generation) return;
    if (error instanceof SessionExpiredError) {
      reportError(error);
      return;
    }
    state.online = false;
    if (runIsActive(state.activeRun) && state.reconnectAttempt < MAX_RECONNECT) {
      state.reconnectAttempt += 1;
      const delay = 1500 * state.reconnectAttempt;
      scheduleRender();
      setTimeout(() => connectStream(runId, generation), delay);
    } else {
      scheduleRender();
    }
  }
}

function handleEvent(event) {
  const payload = event.payload || {};
  switch (event.type) {
    case 'run.started':
      state.activeRun = state.activeRun ? { ...state.activeRun, status: 'running' } : state.activeRun;
      break;
    case 'run.thinking':
      if (payload.active === false) removeEmptyStreamingMessage();
      else beginStreamingMessage();
      break;
    case 'assistant.delta':
      appendAssistant(String(payload.content ?? ''));
      break;
    case 'assistant.final':
      finalizeAssistant(String(payload.content ?? ''));
      break;
    case 'tool.started':
      state.tools.push({
        seq: event.seq,
        name: String(payload.name ?? 'tool'),
        status: 'running',
        args: prettyJson(payload.arguments),
        result: '',
        startedAt: event.created_at,
        durationMs: null,
      });
      break;
    case 'tool.finished':
    case 'tool.failed': {
      const name = String(payload.name ?? 'tool');
      const index = state.tools.map((item) => item.name === name && item.status === 'running')
        .lastIndexOf(true);
      const started = index >= 0 ? state.tools[index] : null;
      const entry = {
        seq: started?.seq ?? event.seq,
        name,
        status: event.type === 'tool.finished' ? 'done' : 'failed',
        args: started?.args ?? '—',
        result: prettyJson(payload.result ?? payload.error),
        startedAt: started?.startedAt ?? event.created_at,
        durationMs: elapsedMs(started?.startedAt, event.created_at),
      };
      if (index >= 0) state.tools[index] = entry;
      else state.tools.push(entry);
      break;
    }
    case 'source.found':
    case 'source.fetched': {
      const url = String(payload.url ?? '');
      if (!url) break;
      const entry = {
        title: String(payload.title || url),
        url,
        snippet: String(payload.snippet ?? ''),
        status: event.type === 'source.found' ? 'found' : 'fetched',
      };
      const index = state.sources.findIndex((item) => item.url === url);
      if (index >= 0) state.sources[index] = entry;
      else state.sources.push(entry);
      break;
    }
    case 'context.status':
      if (payload.session_id === state.selectedSessionId) state.context = payload;
      break;
    case 'run.paused':
      state.activeRun = state.activeRun ? { ...state.activeRun, status: 'paused' } : null;
      break;
    case 'run.resumed':
      state.activeRun = state.activeRun ? { ...state.activeRun, status: 'running' } : null;
      break;
    case 'run.completed':
      state.activeRun = state.activeRun ? { ...state.activeRun, status: 'completed' } : null;
      removeEmptyStreamingMessage();
      notifyRunFinished(event.run_id, false);
      refreshRuns();
      break;
    case 'run.cancelled':
      state.activeRun = state.activeRun ? { ...state.activeRun, status: 'cancelled' } : null;
      removeEmptyStreamingMessage();
      refreshRuns();
      break;
    case 'run.failed':
      state.activeRun = state.activeRun ? { ...state.activeRun, status: 'failed' } : null;
      removeEmptyStreamingMessage();
      notifyRunFinished(event.run_id, true);
      if (payload.error) toast(String(payload.error), 'bad');
      refreshRuns();
      break;
    default:
      break;
  }
  scheduleRender();
}

function elapsedMs(start, end) {
  if (!start || !end) return null;
  const value = Date.parse(end) - Date.parse(start);
  return Number.isFinite(value) ? Math.max(0, value) : null;
}

function beginStreamingMessage() {
  if (state.messages.some((item) => item.role === 'assistant' && item.streaming)) return;
  state.messages.push({
    id: `stream-${state.activeRun?.id ?? Date.now()}`,
    session_id: state.selectedSessionId,
    role: 'assistant',
    content: '',
    created_at: new Date().toISOString(),
    streaming: true,
  });
}

function removeEmptyStreamingMessage() {
  for (let index = state.messages.length - 1; index >= 0; index -= 1) {
    const message = state.messages[index];
    if (message.role === 'assistant' && message.streaming && !message.content) {
      state.messages.splice(index, 1);
      return;
    }
  }
}

function appendAssistant(delta) {
  for (let index = state.messages.length - 1; index >= 0; index -= 1) {
    const message = state.messages[index];
    if (message.role === 'assistant' && message.streaming) {
      message.content += delta;
      return;
    }
  }
  state.messages.push({
    id: `stream-${state.activeRun?.id ?? Date.now()}`,
    session_id: state.selectedSessionId,
    role: 'assistant',
    content: delta,
    created_at: new Date().toISOString(),
    streaming: true,
  });
}

function finalizeAssistant(content) {
  for (let index = state.messages.length - 1; index >= 0; index -= 1) {
    const message = state.messages[index];
    if (message.role === 'assistant' && message.streaming) {
      message.content = content;
      message.streaming = false;
      return;
    }
  }
  state.messages.push({
    id: `final-${Date.now()}`,
    session_id: state.selectedSessionId,
    role: 'assistant',
    content,
    created_at: new Date().toISOString(),
    streaming: false,
  });
}

function notifyRunFinished(runId, failed) {
  const key = `${runId}:${failed ? 'failed' : 'completed'}`;
  if (state.notified.has(key)) return;
  state.notified.add(key);
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (!document.hidden) return;
  try {
    new Notification(failed ? t('notifyFailed') : t('notifyCompleted'), {
      body: failed ? t('notifyFailedBody') : t('notifyCompletedBody'),
      icon: '/assets/icon-192.png',
      tag: key,
    });
  } catch {
    /* notification construction can fail on some platforms; ignore */
  }
}

// ---------------------------------------------------------------- dialogs

function openDialog(title, buildBody, { confirmLabel, danger = false }) {
  return new Promise((resolve) => {
    const body = el('div', { class: 'stack' });
    const getValue = buildBody(body);
    const dialog = el('dialog', {},
      el('h2', { text: title }),
      el('div', { style: 'margin-top:12px' }, body),
      el('div', { class: 'dialog-actions' },
        el('button', { class: 'btn ghost', type: 'button', text: t('cancel'), onClick: () => dialog.close('cancel') }),
        el('button', {
          class: `btn ${danger ? 'danger' : ''}`.trim(),
          type: 'button',
          text: confirmLabel,
          onClick: () => dialog.close('confirm'),
        }),
      ),
    );
    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'confirm';
      dialog.remove();
      resolve(confirmed ? (getValue ? getValue() : true) : (getValue ? null : false));
    });
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector('input')?.focus();
  });
}

function promptDialog(title, initial) {
  return openDialog(title, (body) => {
    const input = el('input', { type: 'text', value: initial, maxLength: 120 });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') input.closest('dialog').close('confirm');
    });
    body.append(input);
    return () => input.value;
  }, { confirmLabel: t('save') });
}

function confirmDialog(title, message) {
  return openDialog(title, (body) => {
    body.append(el('p', { text: message }));
    return null;
  }, { confirmLabel: t('delete'), danger: true });
}

// ---------------------------------------------------------------- pairing view

async function probeHealth() {
  state.hostStatus = 'checking';
  updateHostPreview();
  try {
    state.health = await api.health();
    state.hostStatus = state.health?.ok ? 'online' : 'offline';
  } catch {
    state.health = null;
    state.hostStatus = 'offline';
  }
  updateHostPreview();
}

/**
 * Refresh the pairing screen's host panel in place.
 *
 * The pairing screen is not driven by `scheduleRender`, which only runs once a
 * session exists. Re-mounting it here would also discard a half-typed code.
 */
function updateHostPreview() {
  if (!pairDom?.host?.isConnected) return;
  const fresh = hostPreview();
  pairDom.host.replaceWith(fresh);
  pairDom.host = fresh;
}

function formatPairingCode(value) {
  const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.match(/.{1,4}/g)?.join(' · ') ?? '';
}

function normalizePairingCode(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function defaultDeviceName() {
  const platform = navigator.userAgentData?.platform || navigator.platform || 'Web';
  return `${platform} · ${t('tagline')}`.slice(0, 80);
}

function renderPairing() {
  const codeInput = el('input', {
    type: 'text',
    class: 'code-input',
    id: 'pair-code',
    autocomplete: 'one-time-code',
    spellcheck: false,
    placeholder: 'XXXX · XXXX · XXXX',
  });
  codeInput.addEventListener('input', () => {
    const caretAtEnd = codeInput.selectionStart === codeInput.value.length;
    codeInput.value = formatPairingCode(codeInput.value);
    if (caretAtEnd) codeInput.setSelectionRange(codeInput.value.length, codeInput.value.length);
  });

  const nameInput = el('input', { type: 'text', id: 'pair-name', value: defaultDeviceName(), maxLength: 80 });
  const submit = el('button', {
    class: 'btn block',
    type: 'submit',
    text: state.pairing ? t('pairing') : t('pairAction'),
    disabled: state.pairing,
  });

  const form = el('form', { class: 'stack', novalidate: true },
    el('div', {},
      el('label', { class: 'field-label', for: 'pair-code', text: t('pairCodeLabel') }),
      codeInput,
    ),
    el('div', {},
      el('label', { class: 'field-label', for: 'pair-name', text: t('pairNameLabel') }),
      nameInput,
    ),
    submit,
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = normalizePairingCode(codeInput.value);
    if (!code) {
      toast(t('pairCodeRequired'), 'bad');
      codeInput.focus();
      return;
    }
    state.pairing = true;
    submit.disabled = true;
    submit.textContent = t('pairing');
    try {
      await api.startSession(code, nameInput.value.trim() || 'Web console');
      state.authed = true;
      state.view = 'sessions';
      dom = null;
      mount();
      await loadAll();
    } catch (error) {
      state.pairing = false;
      submit.disabled = false;
      submit.textContent = t('pairAction');
      toast(error?.message || t('genericError'), 'bad');
    }
  });

  const steps = el('div', { class: 'steps' },
    [1, 2, 3].map((number) => el('div', { class: 'step' },
      el('span', { class: 'num', text: String(number) }),
      el('div', {},
        el('div', { class: 't', text: t(`pairStep${number}Title`) }),
        el('div', { class: 'd', text: t(`pairStep${number}Detail`) }),
      ),
    )),
  );

  const host = hostPreview();
  pairDom = { host };

  return el('div', { class: 'pair-shell' },
    el('main', { class: 'panel stack' },
      el('div', { class: 'row spread' },
        el('div', { class: 'brand' },
          el('span', { class: 'brand-mark' }),
          el('div', {},
            el('div', { class: 'brand-name', text: t('appName') }),
            el('div', { class: 'brand-sub', text: t('tagline') }),
          ),
        ),
        languageSelect(),
      ),
      el('div', {},
        el('h1', { text: t('pairTitle') }),
        el('p', { text: t('pairBody') }),
      ),
      host,
      steps,
      form,
      el('a', { class: 'tiny muted', href: '/admin', text: t('adminLink') }),
    ),
  );
}

function hostPreview() {
  const health = state.health;
  const ollama = health?.providers?.ollama || {};
  const tone = state.hostStatus === 'online' ? 'ok' : state.hostStatus === 'checking' ? 'warn' : 'bad';
  const statusText = state.hostStatus === 'checking'
    ? t('hostChecking')
    : state.hostStatus === 'online' ? t('hostOnline') : t('hostOffline');

  const details = [];
  if (health) {
    const model = health.default_model || ollama.default_model;
    if (model) {
      details.push(ollama.default_model_ready ? t('hostModelReady', model) : t('hostModelMissing', model));
    }
    if (typeof ollama.model_count === 'number') details.push(t('hostModelCount', ollama.model_count));
    details.push(health.web ? t('hostWebOn') : t('hostWebOff'));
  }

  return el('div', { class: 'host-preview' },
    el('div', { class: 'row' },
      el('span', { class: `dot ${tone}` }),
      el('span', { class: 'tiny', text: `${t('hostCompanion')} · ${statusText}` }),
      el('button', {
        class: 'icon-btn',
        type: 'button',
        style: 'margin-left:auto',
        'aria-label': t('navRuns'),
        onClick: () => probeHealth(),
      }, icon('refresh')),
    ),
    details.length ? el('div', { class: 'tiny muted mono', text: details.join(' · ') }) : null,
  );
}

function languageSelect() {
  const select = el('select', { 'aria-label': t('settingsLanguage'), style: 'width:auto' },
    LANGUAGES.map((item) => el('option', { value: item.id, text: item.label, selected: item.id === state.lang })),
  );
  select.addEventListener('change', () => {
    state.lang = setLanguage(select.value);
    storeLanguage(state.lang);
    dom = null;
    mount();
  });
  return select;
}

// ---------------------------------------------------------------- app shell

function buildShell() {
  const railList = el('div', { class: 'rail-list' });
  const rail = el('aside', { class: 'rail' },
    el('div', { class: 'rail-head' },
      el('div', { class: 'row spread' },
        el('div', { class: 'brand' },
          el('span', { class: 'brand-mark' }),
          el('div', {},
            el('div', { class: 'brand-name', text: t('appName') }),
            el('div', { class: 'brand-sub', text: t('tagline') }),
          ),
        ),
      ),
      el('button', { class: 'btn block', type: 'button', onClick: createSession },
        icon('add'), el('span', { text: t('newChat') })),
    ),
    railList,
    el('div', { class: 'rail-foot' },
      navButton('runs', 'history', t('navRuns'), true),
      navButton('models', 'tune', t('navModels'), true),
      navButton('settings', 'settings', t('navSettings'), true),
    ),
  );

  const title = el('h2', { class: 'truncate grow' });
  const statusChip = el('span', { class: 'chip' });
  const topbar = el('header', { class: 'topbar' }, title, statusChip,
    el('button', { class: 'icon-btn', type: 'button', 'aria-label': t('navRuns'), onClick: () => refreshRuns() }, icon('refresh')));

  const banner = el('div', {});
  const view = el('div', { class: 'view' });

  // The composer is built once and never re-parented. Rebuilding it on every render
  // would move a focused textarea in the DOM, which drops the caret mid-sentence
  // every time a streaming delta arrives.
  const textarea = el('textarea', {
    rows: 1,
    class: 'grow',
    placeholder: t('composerPlaceholder'),
    'aria-label': t('composerPlaceholder'),
  });
  textarea.addEventListener('input', () => {
    state.draft = textarea.value;
    autoGrow(textarea);
    updateSendState();
  });
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendPrompt();
    }
  });
  const sendButton = el('button', {
    class: 'btn send',
    type: 'button',
    'aria-label': t('send'),
    onClick: sendPrompt,
  }, icon('send'));

  const contextBar = el('div', {});
  const controls = el('div', {});
  const steerRow = el('div', {});
  const modelHint = el('span', { class: 'tiny muted mono truncate' });
  const composer = el('div', { class: 'composer' },
    contextBar,
    controls,
    steerRow,
    el('div', { class: 'composer-row' }, textarea, sendButton),
    modelHint,
  );

  const tabbar = el('nav', { class: 'tabbar' },
    navButton('sessions', 'chat', t('navSessions')),
    navButton('chat', 'send', t('navChat')),
    navButton('runs', 'history', t('navRuns')),
    navButton('models', 'tune', t('navModels')),
    navButton('settings', 'settings', t('navSettings')),
  );

  const main = el('div', { class: 'main' }, topbar, banner, view, composer, tabbar);
  const shell = el('div', { class: 'app' }, rail, main);

  return {
    shell, rail, railList, topbar, title, statusChip, banner, view, tabbar,
    composer, contextBar, controls, steerRow, textarea, sendButton, modelHint,
    steeringRendered: false,
  };
}

function navButton(viewId, iconName, label, compact = false) {
  const button = el('button', {
    type: 'button',
    class: compact ? 'btn ghost' : '',
    onClick: () => {
      state.view = viewId;
      scheduleRender();
    },
  }, icon(iconName), el('span', { text: label }));
  button.dataset.view = viewId;
  return button;
}

function autoGrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, 168)}px`;
}

// ---------------------------------------------------------------- views

function renderRail() {
  const list = clear(dom.railList);
  if (!state.sessions.length) {
    list.append(el('div', { class: 'empty tiny' }, el('span', { text: t('sessionsEmpty') })));
    return;
  }
  for (const session of state.sessions) {
    const run = state.runs.find((item) => item.session_id === session.id);
    const open = el('button', {
      class: 'list-row grow',
      type: 'button',
      'aria-current': String(session.id === state.selectedSessionId),
      onClick: () => {
        state.view = 'chat';
        selectSession(session.id);
      },
    },
      el('span', { class: 'title truncate', text: session.title }),
      el('span', { class: 'meta truncate', text: sessionMeta(session, run) }),
    );
    list.append(el('div', { class: 'rail-row' }, open, el('div', { class: 'row' },
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': t('rename'), onClick: () => renameSession(session) }, icon('edit')),
      el('button', { class: 'icon-btn danger', type: 'button', 'aria-label': t('delete'), onClick: () => deleteSession(session) }, icon('trash')),
    )));
  }
}

function sessionMeta(session, run) {
  const parts = [relativeTime(session.updated_at)];
  if (session.tool_count) parts.push(t('toolCount', session.tool_count));
  if (run) parts.push(statusLabel(run.status));
  return parts.join(' · ');
}

function renderTopbar() {
  const session = selectedSession();
  const titles = {
    sessions: t('sessionsTitle'),
    chat: session?.title || t('navChat'),
    runs: t('runsTitle'),
    models: t('modelsTitle'),
    settings: t('settingsTitle'),
  };
  dom.title.textContent = titles[state.view] || t('appName');

  const chip = clear(dom.statusChip);
  const tone = state.online ? 'ok' : 'bad';
  chip.className = `chip ${tone}`;
  chip.append(el('span', { class: 'dot' }), el('span', { text: state.online ? t('statusOnline') : t('statusOffline') }));

  for (const button of dom.tabbar.querySelectorAll('button')) {
    if (button.dataset.view === state.view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
}

function renderBanner() {
  const banner = clear(dom.banner);
  if (state.reconnectAttempt > 0) {
    banner.append(el('div', { class: 'banner warn' },
      el('span', { class: 'dot warn pulse' }),
      el('span', { text: t('reconnectBanner', state.reconnectAttempt, MAX_RECONNECT) }),
    ));
    return;
  }
  if (!state.online && state.ready) {
    banner.append(el('div', { class: 'banner bad' },
      el('span', { class: 'dot bad' }),
      el('span', { class: 'grow', text: t('offlineBanner') }),
      el('button', { type: 'button', text: t('navRuns'), onClick: () => refreshRuns() }),
    ));
  }
}

function renderView() {
  const view = clear(dom.view);
  view.className = 'view';
  if (state.view !== 'chat') chatScrollNode = null;
  switch (state.view) {
    case 'chat':
      view.append(chatView());
      break;
    case 'runs': view.append(runsView()); break;
    case 'models': view.append(modelsView()); break;
    case 'settings': view.append(settingsView()); break;
    default: view.append(sessionsView());
  }
}

function sessionsView() {
  const inner = el('div', { class: 'view-inner' });
  inner.append(el('div', { class: 'row spread' },
    el('h2', { text: t('sessionsTitle') }),
    el('button', { class: 'btn small', type: 'button', onClick: createSession }, icon('add'), el('span', { text: t('newChat') })),
  ));

  if (state.loading && !state.sessions.length) {
    inner.append(el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }));
    return inner;
  }
  if (!state.sessions.length) {
    inner.append(el('div', { class: 'empty' },
      el('strong', { text: t('sessionsEmpty') }),
      el('span', { class: 'tiny', text: t('sessionsEmptyHint') }),
    ));
    return inner;
  }

  for (const session of state.sessions) {
    const run = state.runs.find((item) => item.session_id === session.id);
    inner.append(el('div', { class: 'rail-row' },
      el('button', {
        class: 'list-row grow',
        type: 'button',
        onClick: () => {
          state.view = 'chat';
          selectSession(session.id);
        },
      },
        el('span', { class: 'row' },
          run ? el('span', { class: `dot ${statusTone(run.status)}` }) : null,
          el('span', { class: 'title truncate grow', text: session.title }),
        ),
        el('span', { class: 'meta truncate', text: sessionMeta(session, run) }),
      ),
      el('div', { class: 'row' },
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': t('rename'), onClick: () => renameSession(session) }, icon('edit')),
        el('button', { class: 'icon-btn danger', type: 'button', 'aria-label': t('delete'), onClick: () => deleteSession(session) }, icon('trash')),
      ),
    ));
  }
  return inner;
}

function chatView() {
  const container = el('div', { class: 'chat' });
  if (!state.selectedSessionId) {
    container.append(el('div', { class: 'empty' },
      el('strong', { text: t('chatNoSession') }),
      el('button', { class: 'btn small', type: 'button', onClick: createSession }, icon('add'), el('span', { text: t('newChat') })),
    ));
    return container;
  }

  const scroll = el('div', { class: 'chat-scroll' });
  const inner = el('div', { class: 'chat-inner' });

  if (!state.messages.length && !state.tools.length) {
    inner.append(el('div', { class: 'empty' },
      el('strong', { text: t('chatEmpty') }),
      el('span', { class: 'tiny', text: t('chatEmptyHint') }),
    ));
  }

  const model = selectedModel();
  for (const message of state.messages) {
    const bubble = el('div', { class: 'bubble' });
    renderRichText(bubble, message.content);
    if (message.streaming) bubble.classList.add('caret');
    inner.append(el('div', { class: `msg ${message.role === 'user' ? 'user' : 'agent'}` },
      el('span', { class: 'who', text: message.role === 'user' ? t('you') : (model?.name || t('assistant')) }),
      bubble,
    ));
  }

  if (runIsActive(state.activeRun) && !state.messages.some((item) => item.streaming)) {
    inner.append(el('div', { class: 'row tiny dim' },
      el('span', { class: 'dot run pulse' }),
      el('span', { text: state.activeRun.status === 'paused' ? statusLabel('paused') : t('thinking') }),
    ));
  }

  if (state.tools.length) {
    inner.append(el('div', { class: 'stack' },
      el('span', { class: 'field-label', text: t('toolsTitle') }),
      toolTimeline(),
    ));
  }
  if (state.sources.length) {
    inner.append(el('div', { class: 'stack' },
      el('span', { class: 'field-label', text: t('sourcesTitle') }),
      sourceList(),
    ));
  }

  scroll.append(inner);
  container.append(scroll);
  trackChatScroll(scroll);
  return container;
}

function toolTimeline() {
  const list = el('div', { class: 'timeline' });
  for (const tool of state.tools) {
    const tone = tool.status === 'failed' ? 'bad' : tool.status === 'running' ? 'run' : 'ok';
    const statusText = tool.status === 'running' ? t('toolRunning') : tool.status === 'done' ? t('toolDone') : t('toolFailed');
    const details = el('details', { class: 'tool', open: tool.status === 'running' },
      el('summary', {},
        el('span', { class: `dot ${tone}${tool.status === 'running' ? ' pulse' : ''}` }),
        el('span', { text: tool.name }),
        el('span', { class: 'muted', text: statusText }),
        el('span', { class: 'dur', text: durationLabel(tool.durationMs) }),
      ),
      el('div', { class: 'tool-body' },
        toolBlock(t('toolArguments'), tool.args, false),
        tool.status === 'running' ? null : toolBlock(
          tool.status === 'failed' ? t('toolError') : t('toolResult'),
          tool.result,
          tool.status === 'failed',
        ),
      ),
    );
    list.append(details);
  }
  return list;
}

function toolBlock(label, value, isError) {
  return el('div', { class: `tool-block ${isError ? 'error' : ''}`.trim() },
    el('span', { class: 'k', text: label }),
    el('pre', { text: value || '—' }),
  );
}

/**
 * Only http(s) may become a live link.
 *
 * Source URLs originate from whatever the agent fetched, so a `javascript:` or
 * `data:` value can reach here. CSP would stop it executing, but a link should not
 * depend on a second line of defence to be safe.
 */
function safeHttpUrl(value) {
  try {
    const parsed = new URL(String(value), location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function sourceList() {
  const list = el('div', { class: 'sources' });
  for (const source of state.sources) {
    const href = safeHttpUrl(source.url);
    // rel/target keep an agent-supplied link from reaching back into this page.
    list.append(el('div', { class: 'source' },
      href
        ? el('a', { href, target: '_blank', rel: 'noopener noreferrer nofollow', text: source.title })
        : el('span', { class: 'title', text: source.title }),
      el('span', { class: 'url truncate', text: source.url }),
      source.snippet ? el('span', { class: 'tiny dim', text: source.snippet }) : null,
    ));
  }
  return list;
}

function updateSendState() {
  if (!dom) return;
  const busy = runIsActive(state.activeRun);
  const model = selectedModel();
  dom.textarea.disabled = busy || !model;
  dom.sendButton.disabled = busy || !model || !dom.textarea.value.trim();
}

function renderComposer() {
  const visible = state.view === 'chat' && Boolean(state.selectedSessionId);
  dom.composer.classList.toggle('hidden', !visible);
  if (!visible) return;

  // Only assign when the value actually diverged (a send clears it); assigning the
  // identical string on every frame is wasted work and can disturb IME composition.
  if (dom.textarea.value !== state.draft) {
    dom.textarea.value = state.draft;
    autoGrow(dom.textarea);
  }

  const model = selectedModel();
  dom.modelHint.textContent = model ? `${model.provider} · ${model.id}` : '';
  updateSendState();

  const context = state.context;
  const contextBar = clear(dom.contextBar);
  if (context && context.message_count > 0) {
    const percent = Math.min(100, context.usage_percent || 0);
    const tone = percent >= 90 ? 'bad' : percent >= 70 ? 'warn' : '';
    contextBar.append(el('div', { class: 'context-bar' },
      el('div', { class: 'row tiny dim' },
        el('span', { class: 'grow', text: t('contextUsage', compactNumber(context.token_estimate), compactNumber(context.max_tokens), percent) }),
        el('span', { class: 'muted', text: context.has_summary ? t('contextMemory', context.summarized_message_count) : t('contextNoMemory') }),
        context.can_compress ? el('button', {
          class: 'btn small ghost',
          type: 'button',
          disabled: state.compressing || runIsActive(state.activeRun),
          text: state.compressing ? t('compressing') : t('compress'),
          onClick: compressContext,
        }) : null,
      ),
      el('div', { class: 'context-track' }, el('span', { class: `context-fill ${tone}`.trim(), style: `width:${percent}%` })),
    ));
  }

  const controls = clear(dom.controls);
  if (runIsActive(state.activeRun)) controls.append(activeControls());
  else state.steering = false;

  renderSteerRow();
}

function activeControls() {
  const run = state.activeRun;
  const paused = run.status === 'paused';
  return el('div', { class: 'controls' },
    el('span', { class: `chip ${statusTone(run.status)}` }, el('span', { class: 'dot' }), el('span', { text: statusLabel(run.status) })),
    el('button', {
      class: 'btn small ghost',
      type: 'button',
      onClick: () => runCommand(paused ? 'resume' : 'pause'),
    }, icon(paused ? 'play' : 'pause'), el('span', { text: paused ? t('resume') : t('pause') })),
    el('button', {
      class: 'btn small ghost',
      type: 'button',
      onClick: () => {
        state.steering = !state.steering;
        renderSteerRow();
      },
    }, icon('steer'), el('span', { text: t('steer') })),
    el('button', { class: 'btn small danger', type: 'button', onClick: () => runCommand('cancel') },
      icon('stop'), el('span', { text: t('stop') })),
  );
}

/** Built only when the steering panel opens or closes, so typing is never interrupted. */
function renderSteerRow() {
  const wanted = state.steering && runIsActive(state.activeRun);
  if (wanted === dom.steeringRendered) return;
  dom.steeringRendered = wanted;
  const row = clear(dom.steerRow);
  if (!wanted) return;

  const input = el('input', { type: 'text', placeholder: t('steerPlaceholder'), maxLength: 20000 });
  const submit = () => {
    const value = input.value.trim();
    if (!value) return;
    runCommand('steer', value);
    state.steering = false;
    renderSteerRow();
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submit();
  });
  row.append(el('div', { class: 'composer-row' }, input,
    el('button', { class: 'btn small', type: 'button', text: t('steerSend'), onClick: submit })));
  input.focus();
}

function runsView() {
  const inner = el('div', { class: 'view-inner' });
  inner.append(el('div', { class: 'row spread' },
    el('h2', { text: t('runsTitle') }),
    el('button', { class: 'btn small ghost', type: 'button', onClick: () => refreshRuns() }, icon('refresh')),
  ));
  if (!state.runs.length) {
    inner.append(el('div', { class: 'empty' }, el('strong', { text: t('runsEmpty') })));
    return inner;
  }
  for (const run of state.runs) {
    inner.append(el('button', {
      class: 'list-row',
      type: 'button',
      onClick: () => {
        state.view = 'chat';
        selectSession(run.session_id);
      },
    },
      el('span', { class: 'row' },
        el('span', { class: `dot ${statusTone(run.status)}` }),
        el('span', { class: 'title truncate grow', text: run.prompt }),
      ),
      el('span', { class: 'meta truncate', text: `${statusLabel(run.status)} · ${run.model} · ${relativeTime(run.created_at)}` }),
    ));
  }
  return inner;
}

function modelsView() {
  const inner = el('div', { class: 'view-inner' });
  const providers = new Set(state.models.map((item) => item.provider));
  inner.append(el('div', { class: 'row spread' },
    el('h2', { text: t('modelsTitle') }),
    el('span', { class: 'tiny muted', text: t('modelsProviderCount', providers.size) }),
  ));
  if (!state.models.length) {
    inner.append(el('div', { class: 'empty' }, el('strong', { text: t('modelsEmpty') })));
    return inner;
  }
  const list = el('div', { class: 'models' });
  for (const model of state.models) {
    const key = `${model.provider}:${model.id}`;
    const unavailable = model.capabilities?.includes('unavailable');
    const selected = key === state.selectedModelKey;
    list.append(el('button', {
      class: 'list-row model-card',
      type: 'button',
      'aria-current': String(selected),
      disabled: unavailable,
      onClick: () => {
        state.selectedModelKey = key;
        scheduleRender();
      },
    },
      el('span', { class: 'row' },
        el('span', { class: 'title truncate grow', text: model.name }),
        selected ? el('span', { class: 'chip ok' }, el('span', { class: 'dot' }), el('span', { text: t('modelSelected') })) : null,
      ),
      el('span', { class: 'meta truncate', text: model.provider }),
      el('span', { class: 'caps' }, (model.capabilities || []).map((cap) => el('span', {
        class: `cap ${cap === 'unavailable' ? 'off' : 'on'}`,
        text: cap === 'unavailable' ? t('modelUnavailable') : cap,
      }))),
    ));
  }
  inner.append(list);
  return inner;
}

function settingsView() {
  const inner = el('div', { class: 'view-inner' });
  inner.append(el('h2', { text: t('settingsTitle') }));

  inner.append(settingGroup(t('settingsConnection'), [
    [t('settingsCompanion'), location.host],
    [t('settingsStatus'), state.online ? t('statusOnline') : t('statusOffline')],
  ]));

  inner.append(settingGroup(t('settingsDevice'), [
    [t('settingsDeviceId'), api.deviceId ? api.deviceId.slice(0, 12) : '—'],
  ]));

  inner.append(settingGroup(t('settingsSession'), [
    [t('settingsRefreshToken'), t('settingsRefreshTokenValue')],
    [t('settingsAccessToken'), t('settingsAccessTokenValue')],
  ]));

  // Notifications
  const permission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  const notifyValue = permission === 'granted' ? t('settingsNotificationsOn')
    : permission === 'denied' ? t('settingsNotificationsBlocked')
      : t('settingsNotificationsOff');
  const notifyGroup = el('div', { class: 'setting-group' },
    el('div', { class: 'setting-line' },
      el('span', { class: 'k', text: t('settingsNotifications') }),
      el('span', { class: 'v truncate', text: notifyValue }),
    ),
  );
  if (permission === 'default') {
    notifyGroup.append(el('div', { class: 'setting-line' },
      el('button', {
        class: 'btn small ghost',
        type: 'button',
        text: t('settingsNotificationsEnable'),
        onClick: async () => {
          await Notification.requestPermission();
          scheduleRender();
        },
      }),
    ));
  }
  inner.append(el('div', { class: 'stack' }, el('span', { class: 'field-label', text: t('settingsNotifications') }), notifyGroup));

  // Language
  inner.append(el('div', { class: 'stack' },
    el('span', { class: 'field-label', text: t('settingsLanguage') }),
    languageSelect(),
  ));

  // Themes
  const swatches = el('div', { class: 'themes' });
  for (const theme of THEMES) {
    swatches.append(el('button', {
      class: 'swatch',
      type: 'button',
      'aria-pressed': String(theme.id === state.theme),
      style: `--sw-canvas:${theme.canvas};--sw-surface:${theme.surface};--sw-border:${theme.border};--sw-text:${theme.text};--sw-accent:${theme.accent}`,
      onClick: () => {
        applyTheme(theme.id);
        scheduleRender();
      },
    },
      el('span', { class: 'bar' }, el('span', { class: 'blob' }), el('span', { class: 'line' })),
      el('span', { class: 'name', text: theme.label }),
    ));
  }
  inner.append(el('div', { class: 'stack' },
    el('span', { class: 'field-label', text: t('settingsTheme') }),
    swatches,
    el('span', { class: 'tiny muted', text: t('themeHint') }),
  ));

  if (state.installPrompt) {
    inner.append(el('button', {
      class: 'btn ghost block',
      type: 'button',
      onClick: async () => {
        const prompt = state.installPrompt;
        state.installPrompt = null;
        await prompt.prompt();
        scheduleRender();
      },
    }, icon('install'), el('span', { text: t('install') })));
  }

  inner.append(el('div', { class: 'stack' },
    el('button', {
      class: 'btn danger block',
      type: 'button',
      onClick: async () => {
        await api.logout();
        handleSessionLost();
      },
    }, icon('logout'), el('span', { text: t('logout') })),
    el('span', { class: 'tiny muted', style: 'text-align:center', text: t('logoutHint') }),
  ));

  return inner;
}

function settingGroup(title, lines) {
  return el('div', { class: 'stack' },
    el('span', { class: 'field-label', text: title }),
    el('div', { class: 'setting-group' }, lines.map(([key, value]) => el('div', { class: 'setting-line' },
      el('span', { class: 'k', text: key }),
      el('span', { class: 'v truncate', text: value }),
    ))),
  );
}

// ---------------------------------------------------------------- render loop

let pinScroll = true;
let chatScrollNode = null;
let autoScrollTop = -1;

/**
 * Track a freshly built chat scroller.
 *
 * The listener is attached unconditionally: attaching it only while pinned meant
 * that once the operator scrolled up, nothing was left to notice them scrolling back
 * down, so auto-follow could never resume for the rest of the session.
 *
 * The scroll itself cannot happen here — the element is not in the document yet, so
 * its scrollHeight is 0. `renderView` scrolls it once it is attached.
 */
function trackChatScroll(scroll) {
  scroll.addEventListener('scroll', () => {
    // Scroll events are delivered asynchronously. When the next streaming delta has
    // already grown the transcript, an event from *our own* scroll-to-bottom reports
    // a large gap and would unpin auto-follow mid-run, with nothing to turn it back
    // on. Events at the position we last set are therefore not user intent.
    if (scroll.scrollTop === autoScrollTop) return;
    pinScroll = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 80;
  }, { passive: true });
  chatScrollNode = scroll;
  autoScrollTop = -1;
}

/** Follow the transcript, unless the operator has deliberately scrolled away. */
function scrollChatToBottom() {
  if (!pinScroll || !chatScrollNode?.isConnected) return;
  chatScrollNode.scrollTop = chatScrollNode.scrollHeight;
  autoScrollTop = chatScrollNode.scrollTop;
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    if (!state.authed || !dom) return;
    renderRail();
    renderTopbar();
    renderBanner();
    renderView();
    renderComposer();
    // Last: the node must be attached, and the composer above it must have settled
    // on its final height, or the transcript is scrolled against a stale viewport.
    scrollChatToBottom();
  });
}

function mount() {
  clear(root);
  root.className = '';
  if (!state.authed) {
    root.append(renderPairing());
    if (state.hostStatus === 'unknown') probeHealth();
    return;
  }
  dom = buildShell();
  root.append(dom.shell);
  renderRail();
  renderTopbar();
  renderBanner();
  renderView();
  renderComposer();
  scrollChatToBottom();
}

// ---------------------------------------------------------------- boot

function restoreTheme() {
  let stored = 'emerald';
  try {
    stored = localStorage.getItem(THEME_KEY) || 'emerald';
  } catch {
    /* storage denied */
  }
  applyTheme(stored);
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  state.installPrompt = event;
  scheduleRender();
});

document.addEventListener('visibilitychange', () => {
  // Coming back to a backgrounded tab: re-sync in case events were missed while the
  // stream was suspended by the browser.
  if (!document.hidden && state.authed) refreshRuns();
});

async function boot() {
  state.lang = setLanguage(detectLanguage());
  restoreTheme();
  api.onSessionLost = handleSessionLost;

  const note = document.getElementById('boot-note');
  if (note) note.textContent = t('loading');

  try {
    await api.refreshSession();
    state.authed = true;
  } catch {
    state.authed = false;
  }
  state.ready = true;
  mount();
  if (state.authed) await loadAll();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

boot();
