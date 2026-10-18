// Juegos: escape room en primera persona "La casa de los recuerdos" y "¿Qué prefieres?".
'use strict';

const SYMBOLS = [['luna', '🌙'], ['estrella', '⭐'], ['corazón', '❤️'], ['sol', '☀️'], ['llave', '🔑'], ['flor', '🌸']];
const COLORS = [['rojo', '#e53935'], ['verde', '#43a047'], ['azul', '#1e88e5'], ['amarillo', '#fdd835']];
const symE = n => (SYMBOLS.find(s => E.norm(s[0]) === E.norm(n)) || ['', '?'])[1];

function erState() { return (S.couple && S.couple.escape) || {}; }
function myRole() { return S.couple && (S.couple.uids || [])[0] === S.uid ? 'A' : 'B'; }

// Pistas que se guardan en las notas del jugador
function addNote(id, text) {
  if (!S.er.notes.find(n => n.id === id)) { S.er.notes.push({ id, text }); saveLocal(); }
}

// Cada objeto devuelve el contenido de su hoja (título, emoji grande, texto y, si aplica, un acertijo)
const ROOMS = {
  A: {
    name: 'Estudio', intro: 'Despiertas en un estudio con olor a libros viejos. La puerta está cerrada.',
    walls: [
      { label: 'Puerta', objs: [
        { id: 'doorA', e: '🚪', x: 50, y: 48, s: 2.4, fn: st => st.doorA ? info('Puerta del estudio', '🚪', '¡La puerta está abierta! Ahora espera a que tu pareja salga del ático.')
          : puzzle('Puerta del estudio', '🚪', 'La cerradura tiene tres ranuras con dibujos. Hay que poner tres símbolos en el orden correcto.', 'doorA') },
        { id: 'paintA', e: '🖼️', x: 20, y: 26, fn: () => clue('paintA', 'Un cuadro de una pareja', '🖼️', 'Detrás del cuadro hay un papel doblado: «El cofre del ático: 2 _ _ 4».') },
        { id: 'plantA', e: '🪴', x: 84, y: 76, fn: () => info('Una planta', '🪴', 'Alguien la riega con cariño. No esconde nada… o eso parece.') },
      ] },
      { label: 'Escritorio', objs: [
        { id: 'panelA', e: '🎛️', x: 72, y: 40, fn: st => st.panel ? info('Panel de colores', '🎛️', 'El panel ya está encendido. El cajón del escritorio se abrió.')
          : puzzle('Panel de colores', '🎛️', st.chest ? 'Cuatro botones de colores. Algo te dice que el orden está escrito en otro lugar de la casa.' : 'Cuatro botones de colores, pero el panel parece bloqueado. Quizás falta abrir algo en otra habitación primero.', 'panel') },
        { id: 'drawerA', e: '🗄️', x: 34, y: 62, s: 1.6, fn: st => st.panel ? clue('drawerA', 'El cajón del escritorio', '🗄️', 'Dentro hay una tarjeta con tres dibujos: ☀️ sol, ❤️ corazón, 🔑 llave. Al reverso dice: «para la puerta de arriba».')
          : info('El cajón del escritorio', '🗄️', 'Está cerrado. Tiene un cable que va hacia el panel de colores.') },
        { id: 'lampA', e: '💡', x: 18, y: 30, fn: st => info('Una lámpara', '💡', st.panel ? 'Ahora la lámpara brilla fuerte. Su luz se ve desde el ático por la ventana.' : 'La lámpara está apagada. Parece conectada al panel de colores.') },
      ] },
      { label: 'Librero', objs: [
        { id: 'booksA', e: '📚', x: 40, y: 42, s: 1.6, fn: () => info('Un librero', '📚', 'Un libro se llama «Nuestra historia». En la primera página: «Ninguno de los dos puede salir solo. Cuéntale todo lo que veas».') },
        { id: 'clockA', e: '🕰️', x: 74, y: 30, fn: () => info('Un reloj antiguo', '🕰️', 'El tic tac suena como un corazón. Las agujas están quietas.') },
        { id: 'boxA', e: '🎁', x: 66, y: 78, fn: () => info('Una caja de regalo', '🎁', 'Está vacía. Una etiqueta dice: «Para cuando estemos juntos».') },
      ] },
      { label: 'Ventana', objs: [
        { id: 'windowA', e: '🪟', x: 50, y: 36, s: 2, fn: () => info('La ventana', '🪟', 'Ves el ático de la casa. Hay alguien allí arriba: ¡es tu pareja! Llámala para coordinarse.') },
        { id: 'rugA', e: '🧶', x: 30, y: 80, fn: () => info('Un ovillo de lana', '🧶', 'Sirve para tejer una bufanda… para dos.') },
      ] },
    ],
  },
  B: {
    name: 'Ático', intro: 'Despiertas en un ático lleno de baúles y recuerdos. La trampilla está cerrada.',
    walls: [
      { label: 'Trampilla', objs: [
        { id: 'doorB', e: '🚪', x: 50, y: 48, s: 2.4, fn: st => st.doorB ? info('Puerta del ático', '🚪', '¡La puerta está abierta! Ahora espera a que tu pareja salga del estudio.')
          : puzzle('Puerta del ático', '🚪', 'Una cerradura con tres ranuras de dibujos. Necesitas tres símbolos en el orden correcto.', 'doorB') },
        { id: 'mirrorB', e: '🪞', x: 82, y: 32, fn: () => clue('mirrorB', 'Un espejo empañado', '🪞', 'Con el vaho alguien escribió: «_ 7 1 _». Parece la mitad de un código.') },
      ] },
      { label: 'Baúles', objs: [
        { id: 'chestB', e: '🧰', x: 50, y: 66, s: 1.6, fn: st => st.chest ? clue('chestB', 'El cofre abierto', '🧰', 'Dentro hay una hoja con colores en orden: 🔴 rojo, 🟢 verde, 🔵 azul, 🟡 amarillo. Dice: «para el panel del estudio».')
          : puzzle('Un cofre con candado', '🧰', 'El candado tiene cuatro números.', 'chest') },
        { id: 'trunkB', e: '📦', x: 18, y: 74, fn: () => info('Una caja de fotos', '📦', 'Fotos de viajes que todavía no han hecho. Alguien dibujó un corazón en cada una.') },
      ] },
      { label: 'Telescopio', objs: [
        { id: 'scopeB', e: '🔭', x: 54, y: 52, s: 1.8, fn: st => st.panel ? clue('scopeB', 'El telescopio', '🔭', 'Ahora que el estudio tiene luz, ves su puerta. Sobre ella hay tres símbolos: 🌙 luna, ⭐ estrella, ❤️ corazón.')
          : info('El telescopio', '🔭', 'Apunta al estudio, pero allí está demasiado oscuro para ver algo. Quizás tu pareja pueda encender una luz.') },
        { id: 'starB', e: '✨', x: 24, y: 24, fn: () => info('Estrellas pintadas', '✨', 'Alguien pintó constelaciones en el techo. Una forma sus iniciales.') },
      ] },
      { label: 'Rincón', objs: [
        { id: 'bearB', e: '🧸', x: 36, y: 70, fn: () => info('Un osito', '🧸', 'Tiene una nota: «Hablen mucho. Lo que ves tú, tu pareja no lo ve».') },
        { id: 'radioB', e: '📻', x: 70, y: 46, fn: () => info('Una radio vieja', '📻', 'Suena una canción lenta. ¿Será la de ustedes?') },
      ] },
    ],
  },
};

function info(title, e, text) { return { title, e, text }; }
function clue(id, title, e, text) { addNote(id, text); return { title, e, text, note: true }; }
function puzzle(title, e, text, kind) { return { title, e, text, kind }; }

// ---------- Vista ----------
VIEWS.escape = () => {
  const st = erState(), role = myRole(), room = ROOMS[role];
  const p = partner();
  // Las notas son de cada móvil: si empezó una partida nueva, se limpian
  if (st.startedAt && S.er.game !== st.startedAt) { S.er = { wall: 0, notes: [], game: st.startedAt }; saveLocal(); }
  if (!st.startedAt) {
    return '<div class="card" style="text-align:center"><div style="font-size:64px">🗝️</div><h2 style="font-size:22px">La casa de los recuerdos</h2>' +
      '<p class="muted" style="margin-top:0">Cada uno despierta en una habitación distinta. Lo que tú ves, tu pareja no lo ve. Solo hablando podrán abrir las dos puertas.</p>' +
      '<div class="grid2" style="text-align:left;margin:12px 0"><div class="clock"><div class="small muted">' + esc(me().name || 'Tú') + '</div><b>' + (role === 'A' ? '📖 Estudio' : '🧸 Ático') + '</b></div>' +
      '<div class="clock"><div class="small muted">' + esc(p ? p.name : 'Tu pareja') + '</div><b>' + (role === 'A' ? '🧸 Ático' : '📖 Estudio') + '</b></div></div>' +
      (p ? '' : '<p class="small" style="color:var(--warn);font-weight:700">Tu pareja aún no se une. Pueden empezar cuando esté.</p>') +
      '<button class="btn primary block" data-act="erStart">Empezar</button>' +
      '<p class="muted small" style="margin-bottom:0">Consejo: toca 📞 arriba para hablar mientras juegan. Desliza el dedo o usa las flechas para girar.</p></div>';
  }
  if (E.escapeWon(st)) {
    return '<div class="card hero" style="padding:30px 16px"><div style="font-size:64px">🎉</div><div class="big" style="font-size:30px">¡Escaparon juntos!</div><div class="sub">Tiempo: ' + E.mmss(st.wonAt - st.startedAt) + '</div></div>' +
      '<button class="btn primary block" data-act="erReset">Jugar otra vez</button>';
  }
  const w = S.er.wall % room.walls.length, wall = room.walls[w];
  const locks = [['chest', '🧰'], ['panel', '🎛️'], ['doorB', '🚪'], ['doorA', '🚪']];
  const lit = role === 'A' && st.panel;
  let h = '<div class="er-top"><span class="timer" id="erTimer">' + E.mmss(Date.now() - st.startedAt) + '</span>' +
    '<span class="locks" title="Cerraduras">' + locks.map(l => '<span style="opacity:' + (st[l[0]] ? 1 : .3) + '">' + (st[l[0]] ? '🔓' : '🔒') + '</span>').join('') + '</span>' +
    '<span style="flex:1"></span><span class="chip">' + (role === 'A' ? '📖 ' : '🧸 ') + room.name + '</span></div>';
  h += '<div class="scene' + (lit ? ' lit' : '') + '" id="scene"><div class="wall"></div><div class="floor"></div><div class="base"></div><div class="label">' + esc(wall.label) + ' · ' + (w + 1) + '/' + room.walls.length + '</div>' +
    wall.objs.map(o => '<button class="obj' + (S.er.notes.find(n => n.id === o.id) ? ' found' : '') + '" style="left:' + o.x + '%;top:' + o.y + '%' + (o.s ? ';--s:' + o.s : '') + '" data-act="erObj" data-v="' + o.id + '" aria-label="Mirar">' + o.e + '</button>').join('') +
    '<button class="turn l" data-act="erTurn" data-v="-1" aria-label="Girar a la izquierda">‹</button><button class="turn r" data-act="erTurn" data-v="1" aria-label="Girar a la derecha">›</button></div>';
  h += '<p class="muted small" style="text-align:center;margin:8px 0 12px">' + esc(room.intro) + ' Toca los objetos para examinarlos.</p>';
  h += '<div class="card notes"><h2>📓 Tus notas</h2>' + (S.er.notes.length ? S.er.notes.map(n => '<div class="n">' + esc(n.text) + '</div>').join('') : '<p class="muted small" style="margin:0">Aquí se guardan las pistas que encuentres. Cuéntaselas a tu pareja.</p>') + '</div>' +
    '<button class="btn block sm" data-act="erReset" style="color:var(--muted)">Reiniciar partida</button>';
  return h;
};

ACTS.erStart = () => Sync.patchCouple(S.code, { escape: { startedAt: Date.now() } });
ACTS.erReset = () => askConfirm('La partida se reiniciará para los dos.', 'Reiniciar', () => { S.er = { wall: 0, notes: [] }; saveLocal(); return Sync.patchCouple(S.code, { escape: { startedAt: Date.now() } }); });
ACTS.erTurn = el => { const n = ROOMS[myRole()].walls.length; S.er.wall = (S.er.wall + Number(el.dataset.v) + n) % n; saveLocal(); render(); };
ACTS.erObj = el => {
  const room = ROOMS[myRole()];
  const o = room.walls.flatMap(w => w.objs).find(x => x.id === el.dataset.v);
  if (!o) return;
  const r = o.fn(erState());
  if (r.note) render();
  openPuzzle(r);
};

// ---------- Acertijos ----------
let PZ = null;
function openPuzzle(r) {
  PZ = { r, seq: [] };
  openSheet('<div id="pz"></div>', () => drawPuzzle());
}
function drawPuzzle(bad) {
  const el = document.getElementById('pz');
  if (!el || !PZ) return;
  const r = PZ.r;
  let h = '<div class="closeup">' + r.e + '</div><h2>' + esc(r.title) + '</h2><p style="margin-top:0">' + esc(r.text) + '</p>';
  if (r.note) h += '<p class="small" style="color:var(--ok);font-weight:700">📓 Pista guardada en tus notas</p>';
  if (r.kind === 'chest') {
    h += '<div class="display' + (bad ? ' shake' : '') + '">' + (PZ.seq.join('') + '____').slice(0, 4) + '</div><div class="keypad">' +
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => '<button data-act="pzKey" data-v="' + n + '">' + n + '</button>').join('') +
      '<button data-act="pzDel">⌫</button><button data-act="pzKey" data-v="0">0</button><button data-act="pzTry" style="background:var(--accent);color:var(--accent-ink)">✓</button></div>';
  } else if (r.kind === 'panel') {
    h += '<div class="display' + (bad ? ' shake' : '') + '" style="letter-spacing:4px">' + (PZ.seq.length ? PZ.seq.map(c => '<span style="display:inline-block;width:28px;height:28px;border-radius:50%;background:' + COLORS.find(x => x[0] === c)[1] + ';margin:0 3px;vertical-align:middle"></span>').join('') : '<span class="muted small" style="letter-spacing:0">Toca 4 colores</span>') + '</div>' +
      '<div class="swatches">' + COLORS.map(c => '<button data-act="pzKey" data-v="' + c[0] + '" style="background:' + c[1] + '" aria-label="' + c[0] + '"></button>').join('') + '</div>' +
      '<div class="grid2" style="margin-top:10px"><button class="btn" data-act="pzClear">Borrar</button><button class="btn primary" data-act="pzTry">Probar</button></div>';
  } else if (r.kind === 'doorA' || r.kind === 'doorB') {
    h += '<div class="display' + (bad ? ' shake' : '') + '">' + (PZ.seq.length ? PZ.seq.map(symE).join(' ') : '<span class="muted small" style="letter-spacing:0">Elige 3 símbolos</span>') + '</div>' +
      '<div class="symbols">' + SYMBOLS.map(s => '<button data-act="pzKey" data-v="' + s[0] + '">' + s[1] + '<small>' + s[0] + '</small></button>').join('') + '</div>' +
      '<div class="grid2" style="margin-top:10px"><button class="btn" data-act="pzClear">Borrar</button><button class="btn primary" data-act="pzTry">Probar</button></div>';
  } else {
    h += '<button class="btn block" data-act="closeSheet">Seguir explorando</button>';
  }
  el.innerHTML = h;
}
const PZ_MAX = { chest: 4, panel: 4, doorA: 3, doorB: 3 };
ACTS.pzKey = el => { if (!PZ) return; if (PZ.seq.length < PZ_MAX[PZ.r.kind]) PZ.seq.push(el.dataset.v); drawPuzzle(); };
ACTS.pzDel = () => { if (PZ) { PZ.seq.pop(); drawPuzzle(); } };
ACTS.pzClear = () => { if (PZ) { PZ.seq = []; drawPuzzle(); } };
ACTS.pzTry = async () => {
  if (!PZ) return;
  const kind = PZ.r.kind;
  const value = kind === 'chest' ? PZ.seq.join('') : PZ.seq;
  const res = E.escapeTry(erState(), kind, value);
  if (!res.ok) { PZ.seq = []; vibrate([60, 40, 60]); chime(false); drawPuzzle(true); return; }
  vibrate(120); chime(true);
  const patch = { ['escape.' + kind]: true };
  if (E.escapeWon(res.state)) patch['escape.wonAt'] = Date.now();
  await Sync.patchCouple(S.code, patch);
  const msgs = { chest: '¡El cofre se abrió!', panel: '¡El panel se encendió y el cajón se abrió!', doorA: '¡Abriste la puerta del estudio!', doorB: '¡Abriste la puerta del ático!' };
  closeSheet(); toast(msgs[kind]);
};

// Sonido corto de acierto o error
function chime(ok) {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    const ctx = chime.ctx || (chime.ctx = new C());
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = ok ? 880 : 180; o.type = ok ? 'sine' : 'square';
    g.gain.setValueAtTime(0.12, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.36);
  } catch (e) { }
}

// Deslizar para girar y reloj del juego
(function () {
  let x0 = null;
  document.addEventListener('touchstart', e => { if (e.target.closest('#scene')) x0 = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) ACTS.erTurn({ dataset: { v: dx < 0 ? '1' : '-1' } });
  }, { passive: true });
  setInterval(() => {
    const t = document.getElementById('erTimer'), st = erState();
    if (t && st.startedAt) t.textContent = E.mmss(Date.now() - st.startedAt);
  }, 1000);
})();

// ---------- ¿Qué prefieres? ----------
VIEWS.would = () => {
  const w = (S.couple && S.couple.would) || { i: 0, picks: {}, score: 0, rounds: 0 };
  const pair = E.WOULD[(w.i || 0) % E.WOULD.length];
  const pid = partnerId(), picks = w.picks || {};
  const mine = picks[S.uid], theirs = pid ? picks[pid] : undefined;
  const both = mine !== undefined && theirs !== undefined;
  let h = '<div class="card" style="text-align:center"><p class="muted" style="margin:0">Coincidencias: <b>' + (w.score || 0) + '</b> de ' + (w.rounds || 0) + '</p><h2 style="font-size:20px;margin:10px 0">¿Qué prefieres?</h2>';
  h += '<div class="grid2">' + pair.map((opt, k) => {
    const on = mine === k;
    const tag = both ? '<div class="small" style="margin-top:6px">' + (mine === k ? '👈 Tú ' : '') + (theirs === k ? '❤️ ' + esc(partnerName()) : '') + '</div>' : '';
    return '<button class="btn" style="padding:22px 10px;flex-direction:column;' + (on ? 'background:var(--accent);color:var(--accent-ink)' : '') + '" data-act="wouldPick" data-v="' + k + '"' + (both ? ' disabled' : '') + '>' + esc(opt) + tag + '</button>';
  }).join('') + '</div>';
  if (both) h += '<p style="font-weight:800;font-size:18px">' + (mine === theirs ? '¡Coinciden! 💞' : 'Esta vez no coinciden 😅') + '</p><button class="btn primary block" data-act="wouldNext">Siguiente</button>';
  else if (mine !== undefined) h += '<p class="muted">Esperando a que ' + esc(partnerName()) + ' elija…</p>';
  else h += '<p class="muted">Elige una opción. Verás la de tu pareja cuando los dos hayan elegido.</p>';
  return h + '</div>';
};
ACTS.wouldPick = el => {
  const w = (S.couple && S.couple.would) || null;
  if (!w) return Sync.patchCouple(S.code, { would: { i: 0, picks: { [S.uid]: Number(el.dataset.v) }, score: 0, rounds: 0 } });
  return Sync.patchCouple(S.code, { ['would.picks.' + S.uid]: Number(el.dataset.v) });
};
ACTS.wouldNext = () => {
  const w = S.couple.would || {}, picks = w.picks || {}, pid = partnerId();
  const match = picks[S.uid] !== undefined && picks[S.uid] === picks[pid];
  return Sync.patchCouple(S.code, { would: { i: (w.i || 0) + 1, picks: {}, score: (w.score || 0) + (match ? 1 : 0), rounds: (w.rounds || 0) + 1 } });
};
