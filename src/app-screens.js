// Pantallas: bienvenida, inicio, chat, listas, juegos y ajustes.
'use strict';

const MOODS = [['feliz', '😊', 'Feliz'], ['extrano', '🥺', 'Te extraño'], ['enamorado', '🥰', 'Enamorado/a'], ['cansado', '😴', 'Cansado/a'], ['estresado', '😤', 'Estresado/a'], ['triste', '😔', 'Triste'], ['ocupado', '💼', 'Ocupado/a']];
const moodOf = k => MOODS.find(m => m[0] === k);

// ---------- Bienvenida y vinculación ----------
VIEWS.welcome = () => {
  if (S._created) {
    return '<div class="welcome"><div class="logo">💌</div><h1>Tu código de pareja</h1>' +
      '<p class="muted" style="text-align:center">Pásale este código a tu pareja. Ella o él abre la app, elige "Tengo un código" y lo escribe.</p>' +
      '<div class="codebig">' + esc(S.code) + '</div>' +
      '<button class="btn primary block" data-act="shareCode">Compartir código</button>' +
      '<p class="muted small" style="text-align:center;margin-top:16px">Puedes entrar ya; verás a tu pareja en cuanto se una.</p>' +
      '<button class="btn block" data-act="enter">Entrar</button></div>';
  }
  const mode = S._wmode || 'new';
  return '<div class="welcome"><div class="logo">💞</div><h1>Nosotros</h1>' +
    '<p class="muted" style="text-align:center;margin-top:0">Un espacio solo para los dos, aunque estén lejos.</p>' +
    '<div class="seg"><button class="' + (mode === 'new' ? 'on' : '') + '" data-act="wmode" data-v="new">Crear pareja</button><button class="' + (mode === 'join' ? 'on' : '') + '" data-act="wmode" data-v="join">Tengo un código</button></div>' +
    '<form data-act="' + (mode === 'new' ? 'create' : 'join') + '">' +
    '<label class="f" for="wName">Tu nombre</label><input id="wName" type="text" data-keep="wName" maxlength="30" placeholder="Ej. Antonny" required value="' + esc(S.name) + '">' +
    (mode === 'new'
      ? '<label class="f" for="wStart">¿Desde cuándo están juntos?</label><input id="wStart" type="date" data-keep="wStart" required>'
      : '<label class="f" for="wCode">Código de 6 dígitos</label><input id="wCode" type="tel" inputmode="numeric" data-keep="wCode" maxlength="6" placeholder="123456" required>') +
    '<button class="btn primary block" style="margin-top:18px" type="submit">' + (mode === 'new' ? 'Crear y obtener código' : 'Unirme') + '</button></form></div>';
};
ACTS.wmode = el => { S._wmode = el.dataset.v; render(); };
ACTS.create = async f => {
  const name = f.querySelector('#wName').value.trim(), start = f.querySelector('#wStart').value;
  if (!name || !start) return toast('Completa tu nombre y la fecha');
  if (E.daysBetween(start, E.today()) < 0) return toast('La fecha no puede ser futura');
  let code, tries = 0;
  while (true) {
    code = E.newCode();
    try {
      await Sync.createCouple(code, { start, meet: null, created: Date.now(), t: Date.now(), members: { [S.uid]: { name, tz: myTz(), u: Date.now() } } });
      break;
    } catch (e) { if (++tries > 4) throw e; }
  }
  S.name = name; S.code = code; S._created = true; saveLocal(); subscribe();
};
ACTS.join = async f => {
  const name = f.querySelector('#wName').value.trim(), code = f.querySelector('#wCode').value.trim();
  if (!name) return toast('Escribe tu nombre');
  if (!E.validCode(code)) return toast('El código tiene 6 dígitos');
  await Sync.joinCouple(code, { name, tz: myTz(), u: Date.now() });
  S.name = name; S.code = code; saveLocal(); subscribe();
  toast('¡Ya están conectados! 💞');
};
ACTS.enter = () => { S._created = false; render(); };
ACTS.shareCode = async () => {
  const text = 'Únete a mí en Nosotros 💞 Mi código de pareja es ' + S.code;
  if (navigator.share) { try { await navigator.share({ text }); } catch (e) { } }
  else { try { await navigator.clipboard.writeText(text); toast('Código copiado'); } catch (e) { toast('Tu código: ' + S.code); } }
};

// ---------- Inicio ----------
VIEWS.home = () => {
  const c = S.couple, p = partner(), m = me();
  const todayStr = E.today();
  const days = E.daysTogether(c.start, todayStr);
  const names = esc(m.name || S.name) + (p ? ' y ' + esc(p.name) : '');
  const meetIn = c.meet ? E.daysBetween(todayStr, c.meet) : null;
  const meetTxt = meetIn === null ? '<button class="btn sm" style="background:rgba(255,255,255,.25);color:#fff;margin-top:8px" data-act="setMeet">¿Cuándo se vuelven a ver?</button>'
    : meetIn > 0 ? '<div class="sub">Faltan ' + meetIn + ' día' + (meetIn === 1 ? '' : 's') + ' para vernos ✈️</div>'
      : meetIn === 0 ? '<div class="sub">¡Hoy se ven! 🥳</div>' : '<button class="btn sm" style="background:rgba(255,255,255,.25);color:#fff;margin-top:8px" data-act="setMeet">Poner la próxima fecha</button>';

  let h = '<div class="card hero"><div class="names">' + names + '</div>' +
    '<div class="big">' + (days || '—') + '</div><div class="sub">día' + (days === 1 ? '' : 's') + ' juntos</div>' + meetTxt + '</div>';

  if (!p) {
    h += '<div class="card"><h2>Falta tu pareja</h2><p class="muted" style="margin-top:0">Pásale este código para que se una:</p><div class="codebig">' + esc(S.code) + '</div><button class="btn primary block" data-act="shareCode">Compartir código</button></div>';
  }

  h += '<button class="think" data-act="ping" data-v="think">❤️ Pienso en ti</button>' +
    '<div class="row" style="margin:10px 0 14px"><button class="btn block" data-act="ping" data-v="hug">🤗 Mandar un abrazo</button></div>' +
    (VIEWS.homeExtra ? VIEWS.homeExtra() : '');

  // Relojes y distancia
  const km = p ? E.distanceKm(m.loc, p.loc) : null;
  h += '<div class="card"><h2>Dónde está cada uno</h2><div class="grid2">' +
    '<div class="clock"><div class="small muted">' + esc(m.name || 'Tú') + ' · ' + esc(cityOf(m.tz || myTz())) + '</div><div class="t">' + E.clock(m.tz || myTz()) + '</div></div>' +
    '<div class="clock"><div class="small muted">' + (p ? esc(p.name) + ' · ' + esc(cityOf(p.tz)) : 'Tu pareja') + '</div><div class="t">' + (p && p.tz ? E.clock(p.tz) : '—') + '</div></div></div>' +
    '<p style="margin:12px 0 8px;font-weight:800;font-size:18px;text-align:center">' + (km !== null ? '📍 Están a ' + E.formatKm(km) : '📍 Distancia: comparte tu ubicación' + (p && !p.loc ? ' (falta la de ' + esc(p.name) + ')' : '')) + '</p>' +
    '<button class="btn block sm" data-act="locate">Actualizar mi ubicación</button>' +
    (m.loc ? '<p class="muted small" style="margin:6px 0 0;text-align:center">Solo se guarda tu punto aproximado, no se sigue en tiempo real.</p>' : '') + '</div>';

  // Estado de ánimo
  const pm = p && moodOf(p.mood);
  h += '<div class="card"><h2>¿Cómo te sientes?</h2><div class="chips">' +
    MOODS.map(x => '<button class="chip ' + (m.mood === x[0] ? 'on' : '') + '" data-act="mood" data-v="' + x[0] + '">' + x[1] + ' ' + x[2] + '</button>').join('') + '</div>' +
    (p ? '<p style="margin:12px 0 0">' + (pm ? esc(p.name) + ' se siente: <b>' + pm[1] + ' ' + pm[2] + '</b>' : '<span class="muted">' + esc(p.name) + ' aún no ha elegido.</span>') + '</p>' : '') + '</div>';

  // Pregunta del día
  const q = E.questionFor(todayStr);
  const mine = S.answers.find(a => a.day === todayStr && a.from === S.uid);
  const theirs = p ? S.answers.find(a => a.day === todayStr && a.from === partnerId()) : null;
  h += '<div class="card"><h2>Pregunta del día</h2><p style="margin:0 0 10px;font-weight:700">' + esc(q) + '</p>';
  if (!mine) {
    h += (theirs ? '<p class="small" style="color:var(--accent);font-weight:700;margin:0 0 8px">' + esc(p.name) + ' ya respondió. Responde para ver su respuesta.</p>' : '') +
      '<form data-act="answer"><textarea rows="2" data-keep="ans" maxlength="400" placeholder="Tu respuesta…"></textarea><button class="btn primary block" style="margin-top:8px">Responder</button></form>';
  } else {
    h += '<div class="answer"><b>Tú</b>' + esc(mine.text) + '</div>' +
      (theirs ? '<div class="answer"><b>' + esc(p.name) + '</b>' + esc(theirs.text) + '</div>' : '<p class="muted small" style="margin:8px 0 0">Esperando la respuesta de ' + esc(partnerName()) + '…</p>');
  }
  h += '</div>';
  return h;
};
ACTS.ping = async el => {
  if (!partnerId()) return toast('Primero tu pareja tiene que unirse');
  await Sync.add(S.code, 'pings', { from: S.uid, kind: el.dataset.v, t: Date.now() });
  vibrate(40);
  toast(el.dataset.v === 'hug' ? 'Abrazo enviado 🤗' : 'Le avisaste que piensas en ' + (partner().name || 'tu pareja') + ' ❤️');
};
ACTS.mood = el => Sync.patchCouple(S.code, { ['members.' + S.uid + '.mood']: el.dataset.v, ['members.' + S.uid + '.u']: Date.now() });
ACTS.locate = () => new Promise((resolve, reject) => {
  if (!navigator.geolocation) return reject(new Error('Este móvil no permite ubicación'));
  toast('Buscando tu ubicación…');
  navigator.geolocation.getCurrentPosition(pos => {
    // Se redondea a 2 decimales (~1 km) para no guardar la ubicación exacta
    const loc = { lat: Math.round(pos.coords.latitude * 100) / 100, lng: Math.round(pos.coords.longitude * 100) / 100, t: Date.now() };
    Sync.patchCouple(S.code, { ['members.' + S.uid + '.loc']: loc, ['members.' + S.uid + '.tz']: myTz() }).then(() => { toast('Ubicación actualizada'); resolve(); }, reject);
  }, err => reject(new Error(err.code === 1 ? 'Permiso de ubicación denegado' : 'No se pudo obtener la ubicación')), { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
});
ACTS.answer = async f => {
  const text = f.querySelector('textarea').value.trim();
  if (!text) return toast('Escribe tu respuesta');
  const day = E.today();
  await Sync.set(S.code, 'answers', day + '_' + S.uid, { day, from: S.uid, text, t: Date.now() });
  f.querySelector('textarea').value = '';
};
ACTS.setMeet = () => openSheet('<h2>Próximo encuentro</h2><p class="muted" style="margin-top:0">¿Qué día se vuelven a ver?</p>' +
  '<form data-act="saveMeet"><input type="date" id="meetIn" value="' + esc(S.couple.meet || '') + '" required><button class="btn primary block" style="margin-top:12px">Guardar</button></form>');
ACTS.saveMeet = async f => {
  const v = f.querySelector('#meetIn').value;
  if (!v) return;
  await Sync.patchCouple(S.code, { meet: v });
  closeSheet();
};

// ---------- Chat ----------
VIEWS.chat = () => {
  const p = partner();
  if (!p) return '<div class="card"><p style="margin:0">Cuando tu pareja se una con el código <b>' + esc(S.code) + '</b>, podrán chatear aquí.</p></div>';
  const readT = p.readT || 0;
  let h = '<div class="chat">', lastDay = '';
  if (!S.msgs.length) h += '<p class="muted" style="text-align:center">Escríbele el primer mensaje 💌</p>';
  const lastMine = [...S.msgs].reverse().find(m => m.from === S.uid);
  for (const m of S.msgs) {
    const d = new Date(m.t);
    const day = d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
    if (day !== lastDay) { h += '<div class="daysep">' + esc(day) + '</div>'; lastDay = day; }
    const mine = m.from === S.uid;
    const time = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    const seen = mine && m === lastMine && readT >= m.t ? ' · Visto' : '';
    h += '<div class="msg ' + (mine ? 'me' : 'you') + '">' + esc(m.text) + '<div class="meta">' + time + seen + '</div></div>';
  }
  h += '</div><form class="composer" data-act="send"><div class="in"><input type="text" data-keep="chatIn" maxlength="1000" placeholder="Escribe un mensaje…" autocomplete="off"><button class="btn primary" aria-label="Enviar">➤</button></div></form>';
  return h;
};
ACTS.send = async f => {
  const inp = f.querySelector('input');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  S._scrollChat = true;
  await Sync.add(S.code, 'messages', { from: S.uid, text, t: Date.now() });
};

// ---------- Listas ----------
const LISTS = [['peliculas', '🎬 Películas'], ['lugares', '🌍 Lugares'], ['planes', '✨ Planes']];
VIEWS.lists = () => {
  const items = S.items.filter(i => i.list === S.listTab && !i.del);
  const pend = items.filter(i => !i.done), done = items.filter(i => i.done);
  const row = i => '<div class="item ' + (i.done ? 'done' : '') + '"><button class="check" data-act="toggleItem" data-v="' + esc(i.id) + '" aria-label="Marcar">' + (i.done ? '✓' : '') + '</button>' +
    '<div class="tx">' + esc(i.text) + '<div class="small muted">' + esc(((S.couple.members || {})[i.by] || {}).name || '') + '</div></div>' +
    '<button class="iconbtn" style="box-shadow:none;width:34px;height:34px;font-size:16px" data-act="delItem" data-v="' + esc(i.id) + '" aria-label="Borrar">🗑️</button></div>';
  return '<div class="seg">' + LISTS.map(l => '<button class="' + (S.listTab === l[0] ? 'on' : '') + '" data-act="listTab" data-v="' + l[0] + '">' + l[1] + '</button>').join('') + '</div>' +
    '<form class="card row" data-act="addItem" style="padding:10px"><input type="text" data-keep="itemIn" maxlength="120" placeholder="Agregar a la lista…"><button class="btn primary">＋</button></form>' +
    '<div class="card">' + (pend.length ? pend.map(row).join('') : '<p class="muted" style="margin:0">Nada pendiente todavía.</p>') + '</div>' +
    (done.length ? '<h2 style="font-size:15px;margin:4px 4px 8px" class="muted">Hechas (' + done.length + ')</h2><div class="card">' + done.map(row).join('') + '</div>' : '');
};
ACTS.listTab = el => { S.listTab = el.dataset.v; render(); };
ACTS.addItem = async f => {
  const inp = f.querySelector('input'), text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  await Sync.add(S.code, 'items', { list: S.listTab, text, done: false, by: S.uid, t: Date.now(), u: Date.now() });
};
ACTS.toggleItem = el => { const i = S.items.find(x => x.id === el.dataset.v); if (i) return Sync.set(S.code, 'items', i.id, { done: !i.done, u: Date.now() }, true); };
ACTS.delItem = el => Sync.set(S.code, 'items', el.dataset.v, { del: true, u: Date.now() }, true);

// ---------- Ajustes ----------
VIEWS.settings = () => {
  const m = me();
  const notif = 'Notification' in window ? Notification.permission : 'unsupported';
  return '<div class="card"><h2>Tu perfil</h2><form data-act="saveName" class="row"><input type="text" id="nameIn" maxlength="30" value="' + esc(m.name || S.name) + '"><button class="btn primary sm">Guardar</button></form></div>' +
    '<div class="card"><h2>Nuestra pareja</h2><p class="muted" style="margin:0 0 6px">Código para unirse</p><div class="codebig" style="font-size:30px">' + esc(S.code) + '</div>' +
    '<label class="f">Fecha en que empezaron</label><form data-act="saveStart" class="row"><input type="date" id="startIn" value="' + esc(S.couple.start || '') + '"><button class="btn sm">Guardar</button></form>' +
    '<button class="btn block sm" style="margin-top:12px" data-act="setMeet">Cambiar próximo encuentro</button></div>' +
    '<div class="card"><h2>Avisos</h2>' + (notif === 'granted' ? '<p class="muted" style="margin:0">Avisos activados mientras la app está abierta o en segundo plano.</p>'
      : notif === 'unsupported' ? '<p class="muted" style="margin:0">Este navegador no permite avisos. En iPhone, primero añade la app a la pantalla de inicio desde Safari (Compartir › Añadir a pantalla de inicio).</p>'
        : '<button class="btn block" data-act="askNotif">Activar avisos</button>') +
    '<p class="muted small" style="margin:8px 0 0">Esta versión avisa mientras la app sigue abierta. Los avisos con la app cerrada llegarán cuando se conecte el servicio de notificaciones.</p></div>' +
    (VIEWS.settingsExtra ? VIEWS.settingsExtra() : '') +
    '<div class="card"><h2>Conexión</h2><p class="muted" style="margin:0">' + (Sync.mode === 'demo' ? 'Modo demo (solo este navegador).' : 'Conectado a la nube: sus datos se sincronizan entre los dos móviles.') + '</p>' +
    (Sync.mode === 'demo' ? '<button class="btn block sm" style="margin-top:10px" data-act="resetDemo">Borrar datos de la demo</button>' : '') + '</div>' +
    '<button class="btn block" data-act="leave" style="color:var(--bad)">Salir de esta pareja en este móvil</button>' +
    '<p class="muted small" style="text-align:center">Nosotros · versión ' + esc(typeof APP_BUILD !== 'undefined' ? APP_BUILD : 'dev') + '</p>';
};
ACTS.saveName = async f => { const v = f.querySelector('#nameIn').value.trim(); if (!v) return; S.name = v; saveLocal(); await Sync.patchCouple(S.code, { ['members.' + S.uid + '.name']: v }); toast('Guardado'); };
ACTS.saveStart = async f => { const v = f.querySelector('#startIn').value; if (!v) return; await Sync.patchCouple(S.code, { start: v }); toast('Guardado'); };
ACTS.askNotif = async () => { const r = await Notification.requestPermission(); toast(r === 'granted' ? 'Avisos activados' : 'No se activaron los avisos'); render(); };
ACTS.resetDemo = () => askConfirm('Se borrarán todos los datos de la demo en este navegador.', 'Borrar', () => { Sync.reset(); S.code = null; S.couple = null; saveLocal(); render(); });
ACTS.leave = () => askConfirm('Saldrás de la pareja solo en este móvil. Podrás volver a entrar con el código ' + S.code + '.', 'Salir', () => {
  S.offs.forEach(f => f && f()); S.offs = []; Call.stop();
  S.code = null; S.couple = null; S.tab = 'home'; S._wmode = 'join'; saveLocal(); render();
});
