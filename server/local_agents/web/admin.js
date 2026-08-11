/**
 * Admin page: mint one-time pairing codes and manage paired devices.
 *
 * The admin token is read from the form on each request and never persisted — not in
 * localStorage, not in a cookie — so closing the tab ends the privileged session.
 */

const form = document.getElementById('admin-form');
const tokenInput = document.getElementById('admin-token');
const output = document.getElementById('output');
const toasts = document.getElementById('toasts');

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

function toast(message, tone = '') {
  const node = el('div', { class: `toast ${tone}`.trim() }, el('span', { class: 'grow', text: message }));
  toasts.append(node);
  setTimeout(() => node.remove(), 6000);
}

function adminToken() {
  const token = tokenInput.value.trim();
  if (!token) {
    toast('Yönetim anahtarını gir.', 'bad');
    tokenInput.focus();
    throw new Error('missing admin token');
  }
  return token;
}

async function call(path, method = 'GET') {
  const response = await fetch(path, {
    method,
    headers: { 'X-Admin-Token': adminToken() },
    credentials: 'omit',
  });
  if (response.status === 401) throw new Error('Yetkilendirme başarısız · authorization failed');
  if (response.status === 429) throw new Error('Çok fazla deneme · rate limited');
  if (!response.ok) throw new Error(`İstek başarısız (${response.status})`);
  return response.status === 204 ? null : response.json();
}

function groupCode(code) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '').match(/.{1,4}/g)?.join(' · ') ?? code;
}

function renderPairing(data) {
  const expires = new Date(data.expires_at);
  clear(output).append(
    el('div', { class: 'card stack' },
      el('img', {
        src: data.qr_data_url,
        alt: 'Eşleştirme QR kodu',
        width: '220',
        height: '220',
        style: 'display:block;margin:0 auto;background:#fff;padding:8px;border-radius:8px;width:220px;height:220px',
      }),
      el('div', { class: 'code-input mono', text: groupCode(data.code) }),
      el('div', {
        class: 'tiny muted',
        style: 'text-align:center',
        text: `Tek kullanımlık · geçerlilik: ${expires.toLocaleString()}`,
      }),
    ),
  );
}

function renderDevices(devices) {
  const container = clear(output);
  if (!devices.length) {
    container.append(el('div', { class: 'empty tiny' }, el('span', { text: 'Eşleşmiş cihaz yok.' })));
    return;
  }
  const list = el('div', { class: 'stack' });
  for (const device of devices) {
    const revoked = Boolean(device.revoked_at);
    list.append(el('div', { class: 'card tight row' },
      el('span', { class: `dot ${revoked ? 'bad' : 'ok'}` }),
      el('div', { class: 'grow' },
        el('div', { class: 'truncate', text: device.name }),
        el('div', {
          class: 'tiny muted mono truncate',
          text: `${device.id.slice(0, 12)} · ${new Date(device.last_seen_at).toLocaleString()}`,
        }),
      ),
      revoked
        ? el('span', { class: 'chip bad' }, el('span', { class: 'dot' }), el('span', { text: 'iptal' }))
        : el('button', {
          class: 'btn small danger',
          type: 'button',
          text: 'İptal et',
          onClick: async (event) => {
            event.currentTarget.disabled = true;
            try {
              await call(`/api/v1/admin/devices/${device.id}/revoke`, 'POST');
              toast('Cihaz iptal edildi.');
              await loadDevices();
            } catch (error) {
              toast(error.message, 'bad');
              event.currentTarget.disabled = false;
            }
          },
        }),
    ));
  }
  container.append(list);
}

async function loadDevices() {
  renderDevices(await call('/api/v1/admin/devices'));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clear(output).append(el('div', { class: 'skeleton' }));
  try {
    renderPairing(await call('/api/v1/admin/pairing', 'POST'));
  } catch (error) {
    clear(output);
    toast(error.message, 'bad');
  }
});

document.getElementById('list').addEventListener('click', async () => {
  clear(output).append(el('div', { class: 'skeleton' }));
  try {
    await loadDevices();
  } catch (error) {
    clear(output);
    toast(error.message, 'bad');
  }
});
