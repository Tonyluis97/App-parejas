// Núcleo de la interfaz: estado S, almacenamiento local, render y acciones delegadas data-act.
'use strict';

const E = window.Engine;
const S = {
  uid: null, code: null, name: '', tab: 'home', couple: null,
  msgs: [], items: [], answers: [], pings: [], letters: [], coupons: [], dates: [], greets: [],
  listTab: 'peliculas', game: null, er: { wall: 0, notes: [] },
  unread: 0, ready: false, offs: [],
};

// ---------- Almacenamiento local (claves estables: no renombrar) ----------
const LS_KEY = () => 'nosotros_perfil' + (Sync.mode === 'demo' ? ':' + S.uid : '');
function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY())) || {}; } catch (e) { return {}; }
}
function saveLocal() {
  const d = { name: S.name, code: S.code, er: S.er, lastRead: S.lastRead || 0, u: Date.now() };
  try { localStorage.setItem(LS_KEY(), JSON.stringify(d)); } catch (e) { }
}

// ---------- Utilidades ----------
const $ = sel => document.querySelector(sel);
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function myTz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return 'UTC'; } }
function cityOf(tz) { return String(tz || '').split('/').pop().replace(/_/g, ' '); }
function me() { return (S.couple && S.couple.members && S.couple.members[S.uid]) || {}; }
function partnerId() { return S.couple ? (S.couple.uids || []).find(u => u !== S.uid) : null; }
function partner() { const p = partnerId(); return p ? (S.couple.members || {})[p] || {} : null; }
function partnerName() { const p = partner(); return (p && p.name) || 'tu pareja'; }
function toast(t) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = t;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } }
function notify(title, body) {
  try {
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification(title, { body });
  } catch (e) { }
}

// ---------- Hojas inferiores ----------
function openSheet(html, onOpen) {
  closeSheet();
  const bg = document.createElement('div');
  bg.className = 'sheet-bg'; bg.id = 'sheet';
  bg.innerHTML = '<div class="sheet" role="dialog">' + html + '</div>';
  const t0 = Date.now(); // un toque que llega pegado al que abrió la hoja no la cierra
  bg.addEventListener('click', e => { if (e.target === bg && Date.now() - t0 > 400) closeSheet(); });
  document.body.appendChild(bg);
  onOpen && onOpen(bg.firstChild);
}
// Confirmación dentro de la página (algunos visores bloquean confirm())
function askConfirm(text, yesLabel, onYes) {
  ACTS._confirmYes = () => { closeSheet(); return onYes(); };
  openSheet('<h2>¿Seguro?</h2><p style="margin-top:0">' + esc(text) + '</p><div class="grid2"><button class="btn" data-act="closeSheet">Cancelar</button><button class="btn primary" data-act="_confirmYes">' + esc(yesLabel) + '</button></div>');
}
function closeSheet() { const s = $('#sheet'); if (s) s.remove(); }

// ---------- Render conservando lo que se está escribiendo ----------
const VIEWS = {};
const GAME_VIEWS = ['escape3d', 'escape', 'would', 'tod', 'never', 'ttt', 'cards', 'roulette', 'quiz'];
const US_VIEWS = ['lists', 'letters', 'coupons', 'dates'];
function render() {
  const app = $('#app');
  // No redibujar mientras se elige una fecha: cerraría el calendario del móvil
  const ae = document.activeElement;
  if (ae && ae.type === 'date' && app.contains(ae)) { if (!ae._wait) { ae._wait = true; ae.addEventListener('blur', () => setTimeout(render, 0), { once: true }); } return; }
  const keep = {};
  app.querySelectorAll('[data-keep]').forEach(el => { keep[el.dataset.keep] = el.value; });
  const act = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.keep : null;
  const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 40;

  let html;
  if (!S.ready) html = '<div class="welcome"><div class="logo">💞</div><p class="muted" style="text-align:center">Cargando…</p></div>';
  else if (S.locked) html = VIEWS.lock();
  else if (!S.code || !S.couple || S._created) html = VIEWS.welcome();
  else html = shell(VIEWS[S.tab] ? VIEWS[S.tab]() : '');
  app.innerHTML = html;

  app.querySelectorAll('[data-keep]').forEach(el => { if (keep[el.dataset.keep] != null) el.value = keep[el.dataset.keep]; });
  if (act) { const el = app.querySelector('[data-keep="' + act + '"]'); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { } } }
  if (S.tab === 'chat' && (atBottom || S._scrollChat)) { S._scrollChat = false; window.scrollTo(0, document.body.scrollHeight); }
  renderCallbar();
}

function shell(body) {
  const titles = { home: 'Nosotros', chat: partnerName(), games: 'Juegos', us: 'Lo nuestro', lists: 'Nuestras listas', letters: 'Cartas', coupons: 'Cupones de amor', dates: 'Fechas importantes', settings: 'Ajustes',
    escape3d: 'Sin salida', escape: 'La casa de los recuerdos', would: '¿Qué prefieres?', tod: 'Verdad o reto', never: 'Yo nunca he…', ttt: 'Tres en raya', cards: 'Cartas de conversación', roulette: 'Ruleta de citas', quiz: '¿Qué tanto me conoces?' };
  const tabs = [['home', '🏠', 'Inicio'], ['chat', '💬', 'Chat'], ['games', '🎲', 'Juegos'], ['us', '💞', 'Lo nuestro']];
  const parent = GAME_VIEWS.includes(S.tab) ? 'games' : US_VIEWS.includes(S.tab) ? 'us' : null;
  const back = parent ? '<button class="iconbtn" data-act="tab" data-v="' + parent + '" aria-label="Volver">‹</button>' : '';
  const callBtn = partnerId() ? '<button class="iconbtn" data-act="call" aria-label="Llamar">📞</button>' : '';
  return '<header class="top">' + back + '<h1>' + esc(titles[S.tab] || 'Nosotros') + '</h1>' + callBtn +
    '<button class="iconbtn" data-act="tab" data-v="settings" aria-label="Ajustes">⚙️</button></header>' +
    '<main>' + (Sync.mode === 'demo' && S.tab === 'home' ? '<div class="banner">Modo demo: los datos se quedan en este navegador. Abre la app en otra pestaña para simular el móvil de tu pareja.</div>' : '') + body + '</main>' +
    '<nav class="tabs"><div class="in">' + tabs.map(t => {
      const on = S.tab === t[0] || parent === t[0];
      const dot = t[0] === 'chat' && S.unread ? '<span class="dot">' + S.unread + '</span>' : '';
      return '<button class="' + (on ? 'on' : '') + '" data-act="tab" data-v="' + t[0] + '"><span class="i">' + t[1] + '</span>' + t[2] + dot + '</button>';
    }).join('') + '</div></nav>';
}

// ---------- Barra de llamada ----------
function renderCallbar() {
  let bar = $('#callbar');
  const st = Call.state;
  document.body.classList.toggle('incall', st !== 'idle');
  if (st === 'idle') { if (bar) bar.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'callbar'; document.body.appendChild(bar); }
  bar.className = 'callbar' + (st === 'ringing' || st === 'calling' ? ' ringing' : '');
  const n = esc(partnerName());
  if (st === 'ringing') bar.innerHTML = '📞 ' + n + ' te llama <button data-act="callAccept">Contestar</button><button class="end" data-act="callHang">✕</button>';
  else if (st === 'calling') bar.innerHTML = '📞 Llamando a ' + n + '… <button class="end" data-act="callHang">Colgar</button>';
  else bar.innerHTML = '🎙️ En llamada <button data-act="callMute">' + (Call.muted ? 'Activar mic' : 'Silenciar') + '</button><button class="end" data-act="callHang">Colgar</button>';
}

// ---------- Acciones ----------
const ACTS = {};
// Si Firestore queda en un estado interno roto (pasa tras suspender el móvil o con varias pestañas),
// ya no se recupera solo: se recarga la app una vez para reconectar.
function fatalSync(err) {
  if (!/INTERNAL ASSERTION FAILED/i.test(String((err && err.message) || err))) return false;
  let last = 0;
  try { last = +sessionStorage.getItem('nosotros_reload') || 0; } catch (e) { }
  if (Date.now() - last > 30000) {
    try { sessionStorage.setItem('nosotros_reload', Date.now()); } catch (e) { }
    toast('Reconectando…');
    setTimeout(() => location.reload(), 600);
  } else toast('Se perdió la conexión. Cierra y vuelve a abrir la app.');
  return true;
}
window.addEventListener('unhandledrejection', e => { if (fatalSync(e.reason)) e.preventDefault(); });
window.addEventListener('error', e => { fatalSync(e.error || e.message); });
function actErr(err) { console.error(err); if (!fatalSync(err)) toast(err.message || 'Algo salió mal'); }

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]:not(form)');
  if (!el) return;
  const fn = ACTS[el.dataset.act];
  if (fn) { e.preventDefault(); Promise.resolve(fn(el, e)).catch(actErr); }
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-act]');
  if (!f) return;
  e.preventDefault();
  const fn = ACTS[f.dataset.act];
  if (fn) Promise.resolve(fn(f, e)).catch(actErr);
});

ACTS.tab = el => { S.tab = el.dataset.v; closeSheet(); if (S.tab === 'chat') { markRead(); S._scrollChat = true; } render(); window.scrollTo(0, S.tab === 'chat' ? document.body.scrollHeight : 0); };
ACTS.call = async () => { if (Call.state !== 'idle') return; await Call.call(); toast('Llamando a ' + partnerName() + '…'); };
ACTS.callAccept = () => Call.accept();
ACTS.callHang = () => Call.hangup();
ACTS.callMute = () => Call.toggleMute();
ACTS.closeSheet = () => closeSheet();

// ---------- Conexión con la pareja ----------
function subscribe() {
  S.offs.forEach(f => f && f()); S.offs = [];
  if (!S.code) return;
  let firstPing = true, firstMsgs = true;
  S.offs.push(Sync.watchCouple(S.code, doc => {
    S.couple = doc;
    if (!doc) { S.code = null; saveLocal(); }
    if (typeof Esc3D !== 'undefined') Esc3D.onCouple(doc);
    render();
  }));
  S.offs.push(Sync.watch(S.code, 'messages', list => {
    const prev = S.msgs.length;
    S.msgs = list;
    const incoming = list.filter(m => m.from !== S.uid && m.t > (S.lastRead || 0));
    if (S.tab === 'chat' && !document.hidden) markRead(); else S.unread = incoming.length;
    if (!firstMsgs && list.length > prev) {
      const last = list[list.length - 1];
      if (last && last.from !== S.uid) { notify(partnerName(), last.text); if (S.tab !== 'chat') toast('💬 ' + partnerName() + ': ' + last.text.slice(0, 60)); }
    }
    firstMsgs = false;
    render();
  }));
  S.offs.push(Sync.watch(S.code, 'items', list => { S.items = list; render(); }));
  S.offs.push(Sync.watch(S.code, 'answers', list => { S.answers = list; render(); }));
  for (const col of ['letters', 'coupons', 'dates', 'greets']) S.offs.push(Sync.watch(S.code, col, list => { S[col] = list; render(); }));
  S.offs.push(Sync.watch(S.code, 'pings', list => {
    const last = list[list.length - 1];
    if (!firstPing && last && last.from !== S.uid && Date.now() - last.t < 30000 && last.id !== S._lastPing) showLove(last);
    if (last) S._lastPing = last.id;
    firstPing = false;
  }));
  Call.start(S.code, S.uid);
  Call.onchange = () => renderCallbar();
}

function markRead() {
  const last = S.msgs.filter(m => m.from !== S.uid).pop();
  S.unread = 0;
  if (last && last.t > (S.lastRead || 0)) {
    S.lastRead = last.t; saveLocal();
    Sync.patchCouple(S.code, { ['members.' + S.uid + '.readT']: last.t }).catch(() => { });
  }
}

function showLove(p) {
  const kind = p.kind || 'think';
  const TXT = { hug: ' te manda un abrazo 🤗', morning: ' te dice buenos días ☀️', night: ' te dice buenas noches 🌙', coupon: ' te regaló un cupón de amor 🎟️', letter: ' te dejó una carta 💌' };
  const txt = partnerName() + (TXT[kind] || ' está pensando en ti ❤️');
  vibrate(kind === 'hug' ? [600] : [80, 60, 80, 60, 200]);
  notify('Nosotros', txt);
  const wrap = document.createElement('div');
  wrap.className = 'love';
  wrap.innerHTML = '<div class="msgl">' + esc(txt) + '</div>';
  for (let i = 0; i < 14; i++) {
    const h = document.createElement('span');
    const IC = { hug: '🤗', morning: '☀️', night: '🌙', coupon: '🎟️', letter: '💌' };
    h.className = 'heart'; h.textContent = IC[kind] || ['❤️', '💕', '💖', '💗'][i % 4];
    h.style.left = (5 + Math.random() * 90) + 'vw'; h.style.animationDelay = (Math.random() * 0.8) + 's';
    wrap.appendChild(h);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 3800);
}

// ---------- Arranque ----------
async function boot() {
  try {
    S.uid = await Sync.init();
  } catch (e) {
    console.error(e);
    $('#app').innerHTML = '<div class="welcome"><div class="logo">😕</div><h1>Sin conexión</h1><p class="muted" style="text-align:center">No se pudo conectar con el servidor. Revisa tu internet y vuelve a abrir la app.</p></div>';
    return;
  }
  const L = loadLocal();
  S.name = L.name || ''; S.code = L.code || null; S.lastRead = L.lastRead || 0;
  if (L.er) S.er = Object.assign(S.er, L.er);
  S.locked = Lock.enabled();
  if (!S.code) readInvite();
  S.ready = true;
  render();
  subscribe();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { S._hiddenAt = Date.now(); return; }
    if (Lock.enabled() && S._hiddenAt && Date.now() - S._hiddenAt > 60000) { S.locked = true; closeSheet(); render(); return; }
    if (S.tab === 'chat') { markRead(); render(); }
  });
  setInterval(() => { const ae = document.activeElement; if (S.code && S.couple && ['home', 'escape'].includes(S.tab) && !$('#sheet') && !(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))) render(); }, 30000);
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.Capacitor) navigator.serviceWorker.register('sw.js').catch(() => { });
}
