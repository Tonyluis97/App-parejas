// "Lo nuestro": cartas con fecha, cupones de amor, fechas importantes, saludos con racha y bloqueo con PIN.
'use strict';

function fmtDay(d) {
  const x = E.parseDay(d);
  return x === null ? '' : new Date(x).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function inDays(n) { return n === 0 ? 'hoy' : n === 1 ? 'mañana' : 'en ' + n + ' días'; }
function nameOf(uid) { return uid === S.uid ? 'Tú' : (((S.couple && S.couple.members) || {})[uid] || {}).name || 'Tu pareja'; }

// ---------- Saludos y racha en Inicio ----------
VIEWS.homeExtra = () => {
  const today = E.today(), pid = partnerId();
  const uids = (S.couple && S.couple.uids) || [];
  const st = E.streak(S.greets, uids, today);
  const mine = S.greets.filter(g => g.day === today && g.from === S.uid).map(g => g.kind);
  const theirs = pid ? S.greets.filter(g => g.day === today && g.from === pid).map(g => g.kind) : [];
  const hour = new Date().getHours();
  const kind = hour >= 18 || hour < 4 ? 'night' : 'morning';
  const label = kind === 'night' ? '🌙 Buenas noches' : '☀️ Buenos días';
  let h = '<div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Saludo del día</h2><span class="chip" title="Días seguidos en que los dos se saludaron">🔥 ' + st + ' día' + (st === 1 ? '' : 's') + '</span></div>' +
    '<p class="muted small" style="margin:6px 0 10px">' + (theirs.length ? esc(partnerName()) + ' ya te saludó hoy ' + (theirs.includes('night') ? '🌙' : '☀️') : esc(partnerName()) + ' aún no te saluda hoy.') + ' Salúdense los dos cada día para mantener la racha.</p>' +
    (mine.includes(kind) ? '<button class="btn block" disabled>Saludo enviado ✓</button>' : '<button class="btn primary block" data-act="greet" data-v="' + kind + '">' + label + '</button>') + '</div>';

  // Lo próximo: una fecha importante y lo que espera por abrir
  const up = upcomingDates()[0];
  const letters = S.letters.filter(l => l.to === S.uid && !l.opened && !l.del && letterOpenable(l)).length;
  const coupons = S.coupons.filter(c => c.to === S.uid && !c.used && !c.del).length;
  if (up || letters || coupons) {
    h += '<div class="card"><h2>Para ustedes</h2>' +
      (up ? '<button class="item" style="width:100%;text-align:left" data-act="tab" data-v="dates"><span style="font-size:24px">' + up.emoji + '</span><span class="tx"><b>' + esc(up.title) + '</b><div class="small muted">' + fmtDay(up.next) + '</div></span><span class="chip">' + inDays(up.days) + '</span></button>' : '') +
      (letters ? '<button class="item" style="width:100%;text-align:left" data-act="tab" data-v="letters"><span style="font-size:24px">💌</span><span class="tx"><b>' + letters + ' carta' + (letters > 1 ? 's' : '') + ' para abrir</b></span><span class="chip on">Abrir</span></button>' : '') +
      (coupons ? '<button class="item" style="width:100%;text-align:left" data-act="tab" data-v="coupons"><span style="font-size:24px">🎟️</span><span class="tx"><b>' + coupons + ' cupón' + (coupons > 1 ? 'es' : '') + ' por canjear</b></span><span class="chip">Ver</span></button>' : '') +
      '</div>';
  }
  return h;
};
ACTS.greet = async el => {
  if (!partnerId()) return toast('Primero tu pareja tiene que unirse');
  const day = E.today(), kind = el.dataset.v;
  await Sync.set(S.code, 'greets', day + '_' + S.uid + '_' + kind, { day, from: S.uid, kind, t: Date.now() });
  await Sync.add(S.code, 'pings', { from: S.uid, kind, t: Date.now() });
  toast(kind === 'night' ? 'Buenas noches enviadas 🌙' : 'Buenos días enviados ☀️');
};

// ---------- Lo nuestro (centro) ----------
VIEWS.us = () => {
  const pend = S.items.filter(i => !i.del && !i.done).length;
  const letters = S.letters.filter(l => l.to === S.uid && !l.opened && !l.del).length;
  const coupons = S.coupons.filter(c => c.to === S.uid && !c.used && !c.del).length;
  const up = upcomingDates()[0];
  const tile = (v, ic, t, sub) => '<button class="card" style="text-align:left;margin:0" data-act="tab" data-v="' + v + '"><div style="font-size:34px">' + ic + '</div><h2 style="margin:6px 0 2px">' + t + '</h2><div class="small muted">' + sub + '</div></button>';
  return '<div class="grid2">' +
    tile('letters', '💌', 'Cartas', letters ? letters + ' sin abrir' : 'Cartas que se abren en una fecha') +
    tile('coupons', '🎟️', 'Cupones', coupons ? coupons + ' por canjear' : 'Vales de amor para regalar') +
    tile('dates', '📅', 'Fechas', up ? esc(up.title) + ' ' + inDays(up.days) : 'Aniversarios y citas') +
    tile('lists', '📝', 'Listas', pend ? pend + (pend === 1 ? ' pendiente' : ' pendientes') : 'Películas, lugares y planes') +
    '</div>';
};

// ---------- Cartas ----------
function letterOpenable(l) { return !l.openAt || E.daysBetween(E.today(), l.openAt) <= 0; }
VIEWS.letters = () => {
  if (!partnerId()) return '<div class="card"><p style="margin:0">Cuando tu pareja se una podrán escribirse cartas.</p></div>';
  const got = S.letters.filter(l => l.to === S.uid && !l.del).reverse();
  const sent = S.letters.filter(l => l.from === S.uid && !l.del).reverse();
  const row = l => {
    const open = letterOpenable(l);
    const left = l.openAt ? E.daysBetween(E.today(), l.openAt) : 0;
    const status = l.from === S.uid ? (l.opened ? 'Abierta ✓' : open ? 'Sin abrir' : 'Se abre ' + inDays(left))
      : (l.opened ? 'Leída' : open ? 'Nueva' : '🔒 ' + inDays(left));
    const act = l.from !== S.uid && open ? ' data-act="openLetter" data-v="' + esc(l.id) + '"' : l.from === S.uid ? ' data-act="openLetter" data-v="' + esc(l.id) + '"' : ' data-act="lockedLetter" data-v="' + esc(l.id) + '"';
    return '<button class="item" style="width:100%;text-align:left"' + act + '><span style="font-size:26px">' + (open || l.from === S.uid ? '💌' : '🔒') + '</span><span class="tx"><b>' + esc(l.title || 'Carta') + '</b><div class="small muted">' + (l.openAt ? 'Para el ' + fmtDay(l.openAt) : 'Para abrir cuando quieras') + '</div></span><span class="chip' + (l.from !== S.uid && open && !l.opened ? ' on' : '') + '">' + status + '</span></button>';
  };
  return '<button class="btn primary block" data-act="newLetter" style="margin-bottom:14px">✍️ Escribir una carta</button>' +
    '<div class="card"><h2>Para ti</h2>' + (got.length ? got.map(row).join('') : '<p class="muted small" style="margin:0">Todavía no tienes cartas.</p>') + '</div>' +
    '<div class="card"><h2>Enviadas</h2>' + (sent.length ? sent.map(row).join('') : '<p class="muted small" style="margin:0">Escribe una carta que se abra hoy, en su cumpleaños o en su próximo encuentro.</p>') + '</div>';
};
ACTS.newLetter = () => openSheet('<h2>Nueva carta</h2><form data-act="sendLetter">' +
  '<label class="f" for="lTitle">Título</label><input id="lTitle" type="text" maxlength="60" placeholder="Para cuando me extrañes">' +
  '<label class="f" for="lText">Carta</label><textarea id="lText" rows="6" maxlength="4000" required placeholder="Escribe lo que sientes…"></textarea>' +
  '<label class="f" for="lDate">¿Desde cuándo se puede abrir? (opcional)</label><input id="lDate" type="date">' +
  '<p class="muted small" style="margin:6px 0 0">Si eliges una fecha, quedará con candado hasta ese día.</p>' +
  '<button class="btn primary block" style="margin-top:14px">Enviar carta</button></form>');
ACTS.sendLetter = async f => {
  const text = f.querySelector('#lText').value.trim(), title = f.querySelector('#lTitle').value.trim(), openAt = f.querySelector('#lDate').value || null;
  if (!text) return toast('Escribe la carta');
  await Sync.add(S.code, 'letters', { from: S.uid, to: partnerId(), title, text, openAt, opened: false, t: Date.now() });
  await Sync.add(S.code, 'pings', { from: S.uid, kind: 'letter', t: Date.now() });
  closeSheet(); toast('Carta enviada 💌');
};
ACTS.lockedLetter = el => {
  const l = S.letters.find(x => x.id === el.dataset.v);
  if (l) toast('Esta carta se abre el ' + fmtDay(l.openAt));
};
ACTS.openLetter = async el => {
  const l = S.letters.find(x => x.id === el.dataset.v);
  if (!l) return;
  openSheet('<div class="closeup">💌</div><h2>' + esc(l.title || 'Carta') + '</h2><p class="muted small" style="margin-top:0">De ' + esc(nameOf(l.from)) + ' · ' + new Date(l.t).toLocaleDateString('es', { day: 'numeric', month: 'long' }) + '</p>' +
    '<p style="white-space:pre-wrap;line-height:1.55">' + esc(l.text) + '</p><button class="btn block" data-act="closeSheet">Cerrar</button>');
  if (l.to === S.uid && !l.opened) await Sync.set(S.code, 'letters', l.id, { opened: true, openedAt: Date.now() }, true);
};

// ---------- Cupones de amor ----------
VIEWS.coupons = () => {
  if (!partnerId()) return '<div class="card"><p style="margin:0">Cuando tu pareja se una podrán regalarse cupones.</p></div>';
  const got = S.coupons.filter(c => c.to === S.uid && !c.del).reverse();
  const sent = S.coupons.filter(c => c.from === S.uid && !c.del).reverse();
  const card = (c, mine) => '<div class="item"><span style="font-size:26px">🎟️</span><span class="tx"><b>' + esc(c.text) + '</b><div class="small muted">' + (mine ? 'Para ' + esc(partnerName()) : 'De ' + esc(nameOf(c.from))) + (c.used ? ' · canjeado el ' + new Date(c.usedAt).toLocaleDateString('es', { day: 'numeric', month: 'short' }) : '') + '</div></span>' +
    (c.used ? '<span class="chip">Canjeado ✓</span>' : mine ? '<span class="chip">Sin usar</span>' : '<button class="btn primary sm" data-act="useCoupon" data-v="' + esc(c.id) + '">Canjear</button>') + '</div>';
  return '<button class="btn primary block" data-act="newCoupon" style="margin-bottom:14px">🎁 Regalar un cupón</button>' +
    '<div class="card"><h2>Tus cupones</h2>' + (got.length ? got.map(c => card(c, false)).join('') : '<p class="muted small" style="margin:0">Aún no te regalan cupones.</p>') + '</div>' +
    '<div class="card"><h2>Regalados</h2>' + (sent.length ? sent.map(c => card(c, true)).join('') : '<p class="muted small" style="margin:0">Regala un vale que tu pareja pueda canjear cuando quiera.</p>') + '</div>';
};
ACTS.newCoupon = () => openSheet('<h2>Regalar un cupón</h2><p class="muted" style="margin-top:0">Elige uno o escribe el tuyo.</p><div class="chips">' +
  E.COUPON_IDEAS.map(t => '<button class="chip" data-act="couponIdea" data-v="' + esc(t) + '">' + esc(t) + '</button>').join('') + '</div>' +
  '<form data-act="sendCoupon"><label class="f" for="cText">Cupón</label><input id="cText" type="text" maxlength="80" placeholder="Vale por…" required><button class="btn primary block" style="margin-top:12px">Regalar</button></form>');
ACTS.couponIdea = el => { const i = document.getElementById('cText'); if (i) i.value = el.dataset.v; };
ACTS.sendCoupon = async f => {
  const text = f.querySelector('#cText').value.trim();
  if (!text) return toast('Escribe el cupón');
  await Sync.add(S.code, 'coupons', { from: S.uid, to: partnerId(), text, used: false, t: Date.now() });
  await Sync.add(S.code, 'pings', { from: S.uid, kind: 'coupon', t: Date.now() });
  closeSheet(); toast('Cupón regalado 🎟️');
};
ACTS.useCoupon = el => {
  const c = S.coupons.find(x => x.id === el.dataset.v);
  if (!c) return;
  askConfirm('Vas a canjear «' + c.text + '». ' + partnerName() + ' lo verá como usado.', 'Canjear', async () => {
    await Sync.set(S.code, 'coupons', c.id, { used: true, usedAt: Date.now() }, true);
    await Sync.add(S.code, 'messages', { from: S.uid, text: '🎟️ Canjeé tu cupón: ' + c.text, t: Date.now() });
    toast('¡Cupón canjeado!');
  });
};

// ---------- Fechas importantes ----------
function upcomingDates() {
  const today = E.today(), out = [];
  const c = S.couple || {};
  if (c.start) {
    const next = E.nextOccurrence(c.start, today, true), yrs = E.yearsAt(c.start, next);
    if (yrs > 0) out.push({ title: 'Aniversario (' + yrs + ' año' + (yrs > 1 ? 's' : '') + ')', emoji: '💍', next, auto: true });
  }
  if (c.meet && E.daysBetween(today, c.meet) >= 0) out.push({ title: 'Nos volvemos a ver', emoji: '✈️', next: c.meet, auto: true });
  for (const d of S.dates) {
    if (d.del) continue;
    const next = E.nextOccurrence(d.date, today, d.yearly);
    if (next && E.daysBetween(today, next) >= 0) out.push({ id: d.id, title: d.title, emoji: d.emoji || '📌', next, yearly: d.yearly });
  }
  out.forEach(x => { x.days = E.daysBetween(today, x.next); });
  return out.sort((a, b) => a.days - b.days);
}
VIEWS.dates = () => {
  const list = upcomingDates();
  return '<button class="btn primary block" data-act="newDate" style="margin-bottom:14px">＋ Agregar fecha</button>' +
    '<div class="card">' + (list.length ? list.map(x => '<div class="item"><span style="font-size:26px">' + x.emoji + '</span><span class="tx"><b>' + esc(x.title) + '</b><div class="small muted">' + fmtDay(x.next) + (x.yearly ? ' · cada año' : '') + '</div></span><span class="chip' + (x.days <= 7 ? ' on' : '') + '">' + (x.days === 0 ? '¡Hoy! 🎉' : inDays(x.days)) + '</span>' +
      (x.id ? '<button class="iconbtn" style="box-shadow:none;width:34px;height:34px;font-size:16px" data-act="delDate" data-v="' + esc(x.id) + '" aria-label="Borrar">🗑️</button>' : '') + '</div>').join('')
      : '<p class="muted" style="margin:0">Agrega cumpleaños, aniversarios, viajes o citas por videollamada.</p>') + '</div>' +
    '<p class="muted small" style="text-align:center">El aniversario sale de la fecha en que empezaron, y "Nos volvemos a ver" de Inicio.</p>';
};
const DATE_EMOJIS = ['🎂', '💍', '✈️', '🎬', '🍽️', '📞', '🎉', '❤️'];
ACTS.newDate = () => openSheet('<h2>Nueva fecha</h2><form data-act="saveDate">' +
  '<label class="f" for="dTitle">¿Qué se celebra?</label><input id="dTitle" type="text" maxlength="60" required placeholder="Cumpleaños de Ella">' +
  '<label class="f" for="dDate">Fecha</label><input id="dDate" type="date" required>' +
  '<label class="f">Icono</label><div class="chips" id="dEmoji">' + DATE_EMOJIS.map((e, i) => '<button type="button" class="chip' + (i === 0 ? ' on' : '') + '" data-act="pickEmoji" data-v="' + e + '">' + e + '</button>').join('') + '</div>' +
  '<label class="row" style="margin-top:12px;font-weight:700"><input type="checkbox" id="dYearly" checked style="width:22px;height:22px"> Se repite cada año</label>' +
  '<button class="btn primary block" style="margin-top:14px">Guardar</button></form>');
ACTS.pickEmoji = el => { document.querySelectorAll('#dEmoji .chip').forEach(c => c.classList.toggle('on', c === el)); };
ACTS.saveDate = async f => {
  const title = f.querySelector('#dTitle').value.trim(), date = f.querySelector('#dDate').value;
  if (!title || !date) return toast('Completa el nombre y la fecha');
  const emoji = (f.querySelector('#dEmoji .chip.on') || {}).dataset ? f.querySelector('#dEmoji .chip.on').dataset.v : '📌';
  await Sync.add(S.code, 'dates', { title, date, emoji, yearly: f.querySelector('#dYearly').checked, by: S.uid, t: Date.now() });
  closeSheet(); toast('Fecha guardada');
};
ACTS.delDate = el => askConfirm('Se borrará esta fecha para los dos.', 'Borrar', () => Sync.set(S.code, 'dates', el.dataset.v, { del: true, u: Date.now() }, true));

// ---------- Bloqueo con PIN (solo en este móvil) ----------
const Lock = {
  key() { return 'nosotros_pin' + (Sync.mode === 'demo' ? ':' + S.uid : ''); },
  get() { try { return JSON.parse(localStorage.getItem(this.key())); } catch (e) { return null; } },
  enabled() { return !!this.get(); },
  async hash(pin, salt) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  },
  async set(pin) {
    const salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
    try { localStorage.setItem(this.key(), JSON.stringify({ salt, hash: await this.hash(pin, salt) })); } catch (e) { throw new Error('No se pudo guardar el PIN en este móvil'); }
  },
  async check(pin) { const p = this.get(); return !p || (await this.hash(pin, p.salt)) === p.hash; },
  clear() { try { localStorage.removeItem(this.key()); } catch (e) { } },
};
let PIN = '';
VIEWS.lock = () => '<div class="welcome"><div class="logo">🔒</div><h1>Nosotros</h1><p class="muted" style="text-align:center">Escribe tu PIN para entrar</p>' +
  '<div class="display" id="pinDisp">' + '●'.repeat(PIN.length) + '<span class="muted">' + '○'.repeat(4 - PIN.length) + '</span></div>' +
  '<div class="keypad">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => '<button data-act="pinKey" data-v="' + n + '">' + n + '</button>').join('') +
  '<button data-act="pinDel">⌫</button><button data-act="pinKey" data-v="0">0</button><span></span></div></div>';
ACTS.pinKey = async el => {
  if (PIN.length >= 4) return;
  PIN += el.dataset.v; render();
  if (PIN.length === 4) {
    if (await Lock.check(PIN)) { S.locked = false; PIN = ''; render(); }
    else { PIN = ''; vibrate([60, 40, 60]); render(); const d = $('#pinDisp'); if (d) d.classList.add('shake'); toast('PIN incorrecto'); }
  }
};
ACTS.pinDel = () => { PIN = PIN.slice(0, -1); render(); };
VIEWS.settingsExtra = () => '<div class="card"><h2>Bloqueo con PIN</h2><p class="muted small" style="margin:0 0 10px">Pide un PIN de 4 dígitos al abrir la app en este móvil.</p>' +
  (Lock.enabled() ? '<button class="btn block" data-act="pinOff">Quitar el PIN</button>'
    : '<form data-act="pinOn" class="row"><input type="tel" id="pinNew" inputmode="numeric" maxlength="4" placeholder="4 dígitos" autocomplete="off"><button class="btn primary sm">Activar</button></form>') + '</div>';
ACTS.pinOn = async f => {
  const v = f.querySelector('#pinNew').value.trim();
  if (!/^\d{4}$/.test(v)) return toast('El PIN tiene 4 dígitos');
  await Lock.set(v); toast('PIN activado'); render();
};
ACTS.pinOff = () => askConfirm('La app ya no pedirá PIN en este móvil.', 'Quitar', () => { Lock.clear(); toast('PIN quitado'); render(); });
