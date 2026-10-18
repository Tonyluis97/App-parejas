// Escape rooms para dos (ER01–ER10): pantallas que se tocan sobre el motor Rooms y los datos de rooms-data.js.
// Estado compartido en couple.rooms10; lo que ya vio cada móvil (diálogos, avisos) se guarda en localStorage.
'use strict';

const RM_KEY = () => 'nosotros_rooms' + (Sync.mode === 'demo' ? ':' + S.uid : '');
const RM = (() => { try { return JSON.parse(localStorage.getItem(RM_KEY())) || {}; } catch (e) { return {}; } })();
function rmSave() { try { localStorage.setItem(RM_KEY(), JSON.stringify(RM)); } catch (e) { } }
const RM_CACHE = {};

function rmState() { return (S.couple && S.couple.rooms10) || {}; }
function rmScenario(st) {
  const k = st.id + '/' + (st.variant || '');
  if (!RM_CACHE[k]) RM_CACHE[k] = Rooms.scenario(window.ROOMS_DATA[st.id], st.variant || null);
  return RM_CACHE[k];
}
// Aplica el cambio al momento en este móvil y lo manda a la pareja
function rmPatch(patch) {
  if (S.couple && S.couple.rooms10) Rooms.applyPatch(S.couple.rooms10, patch);
  const out = {};
  for (const k in patch) out['rooms10.' + k] = patch[k];
  return Sync.patchCouple(S.code, out);
}
function rmIdle(st) {
  if (!st.startedAt || st.paused) return 0;
  return Math.floor((Date.now() - Math.max(st.last || 0, st.startedAt)) / 1000);
}
function rmCompute(st) { return Rooms.compute(rmScenario(st), st, rmIdle(st)); }
const rmLabel = (s, v) => (s.ui.labels || {})[Rooms.norm(v)] || String(v).charAt(0) + String(v).slice(1).toLowerCase();
const rmEmoji = (s, o) => (s.ui.objects || {})[o.object_id] || ({ decorative: '🪴', examine: '🔎', collect: '🎒', use: '🔧', combine: '🧩', activate: '🎛️', locked: '🔒', coop: '🤝', narrative: '📜', exit: '🚪' })[o.category] || '❔';
const RM_DIFF = { easy: 'Fácil', medium: 'Media', hard: 'Difícil' };

// Lo que cada móvil ya mostró; se limpia al empezar otra partida
function rmLocal(st) {
  if (RM.game !== st.startedAt) { RM.game = st.startedAt; RM.seen = {}; RM.room = null; RM.solved = Object.keys(st.solved || {}); rmSave(); }
  return RM;
}

// ---------- Lista de escenarios ----------
VIEWS.rooms = () => {
  const st = rmState(), cur = st.startedAt && !st.wonAt && window.ROOMS_DATA[st.id];
  let h = '<p class="muted small" style="margin:0 0 12px">Cada uno ve cosas distintas: solo hablando (mejor con 📞) salen juntos. Se puede pausar o dejar cuando quieran.</p>';
  if (cur) h += '<div class="card hero" data-act="rmOpen" data-v="' + st.id + '" role="button" style="cursor:pointer"><div class="sub">Partida en curso</div><div class="big" style="font-size:22px">' + esc(window.ROOMS_DATA[st.id].title) + '</div><div class="sub">Toca para continuar</div></div>';
  return h + window.ROOMS_INDEX.map(r => '<div class="card game' + (r.ready ? '' : ' off') + '"' + (r.ready ? ' data-act="rmOpen" data-v="' + r.id + '" role="button"' : '') + '>' +
    '<div class="ic">' + (r.ready ? '🧩' : '🔒') + '</div><div><h3>' + esc(r.title) + '</h3><div class="muted small">' + esc(r.synopsis) + '</div>' +
    '<div class="small" style="margin-top:4px;font-weight:700;color:var(--accent)">' + (r.ready ? RM_DIFF[r.difficulty] + ' · ' + r.minutes + ' min' : 'Próximamente') + '</div></div></div>').join('');
};
ACTS.rmOpen = el => { S.roomSel = el.dataset.v; S.tab = 'room'; render(); window.scrollTo(0, 0); };

// ---------- Partida ----------
VIEWS.room = () => {
  const st = rmState(), id = S.roomSel || st.id;
  const data = window.ROOMS_DATA[id];
  if (!data) return '<p class="muted">Este escape room aún no está disponible.</p>';
  if (st.id !== id || !st.startedAt) return rmIntro(data, st);
  const s = rmScenario(st), role = myRole(), c = rmCompute(st), L = rmLocal(st);
  rmAnnounce(s, st, c, role, L);
  if (Rooms.won(s, c)) return rmWon(s, st, c);
  const left = s.fail_condition.minutes * 60000 - Rooms.elapsed(st);
  let h = '<div class="er-top"><span class="timer" id="rmTimer">' + (st.noTimer ? E.mmss(Rooms.elapsed(st)) : E.mmss(Math.max(0, left))) + '</span>' +
    '<span class="small muted">' + s.objectives.filter(o => o.required && Rooms.objectiveDone(s, c, o.objective_id)).length + ' de ' + s.objectives.filter(o => o.required).length + ' objetivos</span>' +
    '<span style="flex:1"></span><button class="chip" data-act="rmPause" aria-label="Pausar">⏸ Pausa</button></div>';
  if (st.paused) return h + '<div class="card" style="text-align:center"><div style="font-size:56px">⏸</div><h2>Partida en pausa</h2><p class="muted">El reloj está parado para los dos.</p><button class="btn primary block" data-act="rmResume">Seguir jugando</button></div>' + rmFooter();
  if (!st.noTimer && left <= 0) {
    h += '<div class="card" style="border:2px solid var(--warn)"><h2>⏰ Se acabó el tiempo</h2><p style="margin-top:0">' + esc(s.fail_condition.consequence) + '</p><div class="grid2"><button class="btn" data-act="rmReset">Reiniciar</button><button class="btn primary" data-act="rmNoTimer">Seguir sin reloj</button></div></div>';
  }
  const rooms = Rooms.myRooms(s, c, role);
  if (!rooms.find(r => r.room_id === L.room)) { L.room = (rooms.find(r => r.room_id === s.players_data[role === 'A' ? 'player_a' : 'player_b'].initial_location) || rooms[0] || {}).room_id; }
  const room = rooms.find(r => r.room_id === L.room);
  if (rooms.length > 1) h += '<div class="chips" style="margin-bottom:10px">' + rooms.map(r => '<button class="chip' + (r.room_id === L.room ? ' on' : '') + '" data-act="rmRoom" data-v="' + r.room_id + '">' + ((s.ui.rooms || {})[r.room_id] || '🚪') + ' ' + esc(r.name) + '</button>').join('') + '</div>';
  if (room) {
    h += '<div class="card"><h2 style="margin:0 0 4px">' + ((s.ui.rooms || {})[room.room_id] || '🚪') + ' ' + esc(room.name) + '</h2><p class="muted small" style="margin:0 0 10px">' + esc(room.view[role] || room.description) + '</p><div class="rgrid">' +
      Rooms.objectsIn(s, c, room.room_id).map(o => {
        const mark = Rooms.nextAction(s, c, o, role) >= 0 || Rooms.cluesAt(s, c, st, o, role).length ? ' new' : '';
        return '<button class="rtile' + mark + (o.category === 'decorative' ? ' deco' : '') + '" data-act="rmObj" data-v="' + o.object_id + '"><span class="e">' + rmEmoji(s, o) + '</span><span class="n">' + esc(o.name) + '</span></button>';
      }).join('') + '</div></div>';
  }
  // Votaciones abiertas (las ven los dos)
  for (const p of s.puzzles.filter(p => p.answer.type === 'decision' && p.validation.input_by.includes(role) && Rooms.puzzleStatus(s, c, st, p).status === 'ready')) h += rmVoteCard(s, st, p, role);
  const inv = Rooms.inventory(s, c, role);
  if (inv.length) h += '<div class="card"><h2>🎒 Tu inventario</h2><div class="chips">' + inv.map(o => '<span class="chip">' + rmEmoji(s, o) + ' ' + esc(o.name) + '</span>').join('') + '</div></div>';
  const help = Rooms.helpClues(s, c, role);
  if (help.length) h += '<div class="card" style="border:2px dashed var(--accent)"><h2>💡 Ayuda</h2>' + help.map(k => '<div class="n">' + esc(k.content) + '</div>').join('') + '</div>';
  const mine = Rooms.myClues(s, st, role);
  h += '<div class="card notes"><h2>📓 Tus pistas</h2>' + (mine.length ? mine.map(k => '<div class="n">' + esc(k.content) + ' <button class="iconbtn sm" data-act="rmSpeak" data-v="' + k.clue_id + '" aria-label="Escuchar la pista">🔊</button></div>').join('')
    : '<p class="muted small" style="margin:0">Toca los objetos para examinarlos. Lo que encuentres aparece aquí; cuéntaselo a ' + esc(partnerName()) + ', que no lo ve.</p>') + '</div>';
  h += '<div class="card"><h2>🎯 Objetivos</h2>' + s.objectives.map(o => '<div class="small" style="padding:4px 0">' + (Rooms.objectiveDone(s, c, o.objective_id) ? '✅' : '⬜') + ' ' + esc(o.text) + (o.required ? '' : ' <span class="muted">(opcional)</span>') + '</div>').join('') + '</div>';
  return h + rmFooter();
};
function rmFooter() { return '<div class="grid2"><button class="btn sm" data-act="rmReset" style="color:var(--muted)">Reiniciar</button><button class="btn sm" data-act="rmQuit" style="color:var(--muted)">Dejar la partida</button></div>'; }

function rmIntro(data, st) {
  const p = partner(), role = myRole();
  const pa = data.players_data.player_a, pb = data.players_data.player_b;
  const mineP = role === 'A' ? pa : pb, theirs = role === 'A' ? pb : pa;
  return '<div class="card" style="text-align:center"><div style="font-size:56px">🧩</div><h2 style="font-size:22px">' + esc(data.title) + '</h2>' +
    '<p class="muted" style="margin-top:0">' + esc(data.narrative.intro) + '</p>' +
    '<div class="grid2" style="text-align:left;margin:12px 0"><div class="clock"><div class="small muted">' + esc(me().name || 'Tú') + '</div><b>' + esc(mineP.role) + '</b></div>' +
    '<div class="clock"><div class="small muted">' + esc(p ? p.name : 'Tu pareja') + '</div><b>' + esc(theirs.role) + '</b></div></div>' +
    '<p class="small" style="text-align:left"><b>Objetivo:</b> ' + esc(data.narrative.goal) + '</p>' +
    '<p class="small muted" style="text-align:left">' + RM_DIFF[data.difficulty] + ' · unos ' + data.estimated_duration_minutes + ' minutos. Todo es simulado: se puede pausar, reiniciar o dejar en cualquier momento.</p>' +
    (p ? '' : '<p class="small" style="color:var(--warn);font-weight:700">Tu pareja aún no se une. Pueden empezar cuando esté.</p>') +
    (st.startedAt && !st.wonAt && st.id !== data.scenario_id ? '<p class="small" style="color:var(--warn)">Hay otra partida en curso; empezar esta la cierra.</p>' : '') +
    '<button class="btn primary block" data-act="rmStart" data-v="' + data.scenario_id + '">Empezar los dos</button>' +
    '<p class="muted small" style="margin-bottom:0">Consejo: toca 📞 arriba para hablar mientras juegan.</p></div>';
}

function rmWon(s, st, c) {
  const ends = Rooms.endings(s, c);
  return '<div class="card hero" style="padding:26px 16px"><div style="font-size:60px">🎉</div><div class="big" style="font-size:28px">¡Lo lograron juntos!</div><div class="sub">Tiempo: ' + E.mmss(Rooms.elapsed(st)) + '</div></div>' +
    '<div class="card"><p style="margin-top:0">' + esc(s.narrative.escape_scene) + '</p>' + ends.map(e => '<p><b>' + esc(e.name) + '.</b> ' + esc(e.text) + '</p>').join('') + '<p class="muted" style="margin-bottom:0">' + esc(s.narrative.epilogue) + '</p></div>' +
    '<button class="btn primary block" data-act="rmStart" data-v="' + s.scenario_id + '">Jugar otra vez (con otras pistas)</button><button class="btn block" data-act="tab" data-v="rooms" style="margin-top:8px">Ver otros escape rooms</button>';
}

// Avisos para los dos: acertijos recién resueltos y diálogos que ya tocan
function rmAnnounce(s, st, c, role, L) {
  const queue = [];
  for (const pid of Object.keys(st.solved || {})) if (!L.solved.includes(pid)) {
    L.solved.push(pid);
    const p = s.puzzles.find(x => x.puzzle_id === pid);
    if (p) { queue.push({ speaker: '✅ ' + p.name, text: p.on_solve.message }); chime(true); vibrate(120); }
  }
  const decisions = s.puzzles.filter(p => p.answer.type === 'decision').map(p => p.puzzle_id);
  for (const d of Rooms.dialoguesFor(s, c, role)) if (!L.seen[d.dialogue_id] && !decisions.includes(String(d.trigger))) { L.seen[d.dialogue_id] = 1; queue.push(d); }
  if (queue.length) { rmSave(); RM_SUBS.push(...queue); setTimeout(rmShowSub, 0); }
}
const RM_SUBS = [];
function rmShowSub() {
  let bar = $('#rmsub');
  if (!RM_SUBS.length) { if (bar) bar.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'rmsub'; bar.className = 'subbar'; bar.setAttribute('role', 'status'); bar.setAttribute('aria-live', 'polite'); bar.dataset.act = 'rmSubNext'; document.body.appendChild(bar); }
  const d = RM_SUBS[0];
  // Avanza solo después de dar tiempo a leerlo; también se puede tocar
  clearTimeout(rmShowSub.t);
  rmShowSub.t = setTimeout(ACTS.rmSubNext, Math.max(7000, d.text.length * 70));
  bar.innerHTML = '<b>' + esc(d.speaker) + '</b>' + esc(d.text) + '<span class="small muted">' + (RM_SUBS.length > 1 ? 'Toca para seguir (' + RM_SUBS.length + ')' : 'Toca para cerrar') + '</span>';
}
ACTS.rmSubNext = () => { RM_SUBS.shift(); rmShowSub(); };

ACTS.rmStart = el => {
  const id = el.dataset.v, data = window.ROOMS_DATA[id];
  const go = () => {
    // Variante al azar (o la base) para que cada partida tenga otras pistas y respuestas
    const opts = [null].concat(data.variants.map(v => v.variant_id)).filter(v => v !== (rmState().id === id ? rmState().variant || null : undefined));
    const variant = opts[Math.floor(Math.random() * opts.length)];
    RM_SUBS.length = 0; rmShowSub();
    return Sync.patchCouple(S.code, { rooms10: { id, variant, startedAt: Date.now() } });
  };
  const st = rmState();
  if (st.startedAt && !st.wonAt && st.id !== id) return askConfirm('Se cerrará la partida en curso para los dos.', 'Empezar', go);
  return go();
};
ACTS.rmRoom = el => { RM.room = el.dataset.v; rmSave(); render(); };
ACTS.rmPause = () => rmPatch({ paused: Date.now() });
ACTS.rmResume = () => { const st = rmState(); return rmPatch({ paused: null, pausedMs: (st.pausedMs || 0) + (Date.now() - st.paused), last: Date.now() }); };
ACTS.rmNoTimer = () => rmPatch({ noTimer: true });
ACTS.rmReset = () => askConfirm('La partida vuelve a empezar para los dos, con otras pistas.', 'Reiniciar', () => ACTS.rmStart({ dataset: { v: rmState().id } }));
ACTS.rmQuit = () => askConfirm('La partida se cierra para los dos.', 'Dejarla', () => { S.tab = 'rooms'; return Sync.patchCouple(S.code, { rooms10: {} }); });
ACTS.rmSpeak = el => {
  const st = rmState(), k = rmScenario(st).clues.find(x => x.clue_id === el.dataset.v);
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(k.alt_text || k.content); u.lang = 'es-ES'; speechSynthesis.speak(u); } catch (e) { toast('Tu móvil no puede leer en voz alta'); }
};

// ---------- Objetos ----------
let RZ = null;
ACTS.rmObj = async el => {
  const st = rmState(), s = rmScenario(st), role = myRole();
  const o = s.objects.find(x => x.object_id === el.dataset.v);
  if (!o) return;
  RZ = { oid: o.object_id, seq: [], pos: {}, code: '', found: [] };
  let c = rmCompute(st);
  // Examinar es automático; las demás acciones se hacen con su botón
  const i = Rooms.nextAction(s, c, o, role);
  if (i >= 0 && o.category === 'examine') await rmDo(o, i);
  else await rmFind(o);
  openSheet('<div id="rz"></div>', () => rmDraw());
};
async function rmFind(o) {
  const st = rmState(), s = rmScenario(st), role = myRole();
  const found = Rooms.cluesAt(s, rmCompute(st), st, o, role);
  if (!found.length) return;
  RZ.found.push(...found.map(k => k.clue_id));
  await rmPatch(Rooms.actFind(found, role));
}
async function rmDo(o, i) {
  RZ.did = true;
  await rmPatch(Rooms.actTransition(o, i, myRole()));
  await rmFind(o);
}
ACTS.rmAct = async () => {
  if (!RZ) return;
  const st = rmState(), s = rmScenario(st), o = s.objects.find(x => x.object_id === RZ.oid);
  const i = Rooms.nextAction(s, rmCompute(st), o, myRole());
  if (i >= 0) await rmDo(o, i);
  rmDraw(); render();
};

function rmDraw(bad) {
  const el = document.getElementById('rz');
  if (!el || !RZ) return;
  const st = rmState(), s = rmScenario(st), role = myRole(), c = rmCompute(st);
  const o = s.objects.find(x => x.object_id === RZ.oid);
  let h = '<div class="closeup">' + rmEmoji(s, o) + '</div><h2>' + esc(o.name) + '</h2><p style="margin-top:0">' + esc(o.visual) + '</p>';
  if (RZ.did && o.result) h += '<p class="small" style="font-weight:700">' + esc(o.result) + '</p>';
  const k = s.clues.filter(x => RZ.found.includes(x.clue_id));
  if (k.length) h += k.map(x => '<div class="answer" style="text-align:left"><b>📓 Pista nueva</b>' + esc(x.content) + '</div>').join('') + '<p class="small" style="color:var(--ok);font-weight:700">Guardada en tus pistas. Cuéntasela a ' + esc(partnerName()) + '.</p>';
  const i = Rooms.nextAction(s, c, o, role);
  if (i >= 0) h += '<button class="btn primary block" data-act="rmAct">' + esc(o.action) + '</button>';
  const p = o.puzzle && s.puzzles.find(x => x.puzzle_id === o.puzzle);
  if (p && p.answer.type !== 'decision' && p.validation.input_by.includes(role) && !['examine', 'narrative', 'decorative', 'collect'].includes(o.category)) h += rmPuzzle(s, st, c, p, o, bad);
  else if (p && !p.validation.input_by.includes(role) && !(st.solved || {})[p.puzzle_id] && o.category !== 'decorative' && Rooms.puzzleStatus(s, c, st, p).status !== 'locked') h += '<p class="small muted">Esto lo resuelve ' + esc(partnerName()) + ' desde su lado. Cuéntale lo que ves.</p>';
  h += '<button class="btn block" data-act="closeSheet" style="margin-top:10px">Seguir explorando</button>';
  el.innerHTML = h;
}

// ---------- Acertijos ----------
function rmPuzzle(s, st, c, p, o, bad) {
  const ps = Rooms.puzzleStatus(s, c, st, p);
  const ui = (s.ui.inputs || {})[p.puzzle_id] || {};
  let h = '<div class="card" style="background:var(--surface-2);box-shadow:none;margin-top:10px"><h3 style="margin:0 0 4px">🧩 ' + esc(p.name) + '</h3>';
  if (ps.status === 'solved') return h + '<p style="margin:0;color:var(--ok);font-weight:700">✅ Resuelto</p></div>';
  if (ps.status === 'locked' || ps.status === 'hidden') return h + '<p class="small muted" style="margin:0">Todavía no funciona. Sigan avanzando en otras partes.</p></div>';
  h += '<p class="small" style="margin:0 0 8px">' + esc(ui.prompt || p.situation) + '</p>';
  if (ps.status === 'clues') return h + '<p class="small" style="margin:0;color:var(--warn);font-weight:700">Les falta información: hay ' + ps.missing.length + (ps.missing.length > 1 ? ' pistas' : ' pista') + ' por encontrar (tuyas o de ' + esc(partnerName()) + ').</p></div>';
  if (ps.status === 'cooldown') return h + '<p class="small" style="margin:0;color:var(--warn)">Demasiados intentos seguidos. Hablen un momento y prueben de nuevo en ' + Math.ceil((ps.until - Date.now()) / 1000) + ' s.</p><button class="btn sm block" data-act="rmRedraw" style="margin-top:8px">Volver a mirar</button></div>';
  const t = p.answer.type, btn = esc(ui.button || 'Probar');
  const sh = bad ? ' shake' : '';
  if (t === 'code') {
    const len = String(p.answer.value).length, digits = /^\d+$/.test(String(p.answer.value));
    if (digits) h += '<div class="display' + sh + '">' + (RZ.code + '_'.repeat(len)).slice(0, len) + '</div><div class="keypad">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => '<button data-act="rmKey" data-v="' + n + '">' + n + '</button>').join('') +
      '<button data-act="rmDel" aria-label="Borrar">⌫</button><button data-act="rmKey" data-v="0">0</button><button data-act="rmTry" aria-label="' + btn + '" style="background:var(--accent);color:var(--accent-ink)">✓</button></div>';
    else h += '<form data-act="rmTryText"><input name="v" autocomplete="off" placeholder="Escribe la respuesta" class="' + sh + '"><button class="btn primary block" style="margin-top:8px">' + btn + '</button></form>';
  } else if (t === 'sequence' || t === 'set') {
    const opts = Rooms.choices(p), len = p.answer.value.length;
    h += '<div class="display' + sh + '" style="font-size:16px;letter-spacing:0">' + (RZ.seq.length ? RZ.seq.map(v => esc(rmLabel(s, v))).join(t === 'set' ? ' · ' : ' → ') : '<span class="muted small">' + (t === 'set' ? 'Elige ' + len : 'Toca ' + len + ' en orden') + '</span>') + '</div>' +
      '<div class="symbols">' + opts.map(v => '<button data-act="rmPick" data-v="' + esc(v) + '"' + (RZ.seq.includes(v) ? ' style="outline:3px solid var(--accent)"' : '') + '>' + esc(rmLabel(s, v)) + '</button>').join('') + '</div>' +
      '<div class="grid2" style="margin-top:10px"><button class="btn" data-act="rmClear">Borrar</button><button class="btn primary" data-act="rmTry">' + btn + '</button></div>';
  } else if (t === 'position') {
    const opts = Rooms.choices(p), keys = (s.ui.keys || {})[p.puzzle_id] || {};
    for (const k in opts) if (RZ.pos[k] === undefined) RZ.pos[k] = opts[k][0];
    h += '<div class="' + sh + '">' + Object.keys(opts).map(k => '<div class="row" style="display:flex;align-items:center;gap:8px;margin:6px 0"><b style="flex:1">' + esc(keys[k] || rmLabel(s, k)) + '</b>' +
      opts[k].map(v => '<button class="chip' + (RZ.pos[k] === v ? ' on' : '') + '" data-act="rmPos" data-k="' + esc(k) + '" data-v="' + esc(JSON.stringify(v)) + '">' + esc(rmLabel(s, v)) + '</button>').join('') + '</div>').join('') + '</div>' +
      '<button class="btn primary block" data-act="rmTry" style="margin-top:8px">' + btn + '</button>';
  } else if (t === 'combine') {
    const inv = Rooms.inventory(s, c, myRole());
    h += inv.length ? '<p class="small muted" style="margin:0 0 6px">Elige qué usar aquí:</p><div class="chips">' + inv.map(x => '<button class="chip" data-act="rmUse" data-v="' + x.object_id + '">' + rmEmoji(s, x) + ' ' + esc(x.name) + '</button>').join('') + '</div>'
      : '<p class="small muted" style="margin:0">No llevas nada que puedas usar aquí. Busca por la zona.</p>';
  } else h += '<p class="small muted">Este tipo de acertijo llega con los próximos escape rooms.</p>';
  const n = (st.hints || {})[p.puzzle_id] || 0;
  if (n) h += p.hints.slice(0, n).map((x, j) => '<p class="small" style="margin:8px 0 0">💡 Ayuda ' + (j + 1) + ': ' + esc(x) + '</p>').join('');
  if (n < p.hints.length) h += '<button class="btn sm block" data-act="rmHint" data-v="' + p.puzzle_id + '" style="margin-top:8px">💡 Pedir ayuda (' + (n + 1) + ' de ' + p.hints.length + ')</button>';
  return h + '</div>';
}
function rmCurPuzzle() {
  const st = rmState(), s = rmScenario(st), o = s.objects.find(x => x.object_id === RZ.oid);
  return s.puzzles.find(x => x.puzzle_id === o.puzzle);
}
ACTS.rmRedraw = () => rmDraw();
ACTS.rmKey = el => { const p = rmCurPuzzle(); if (RZ.code.length < String(p.answer.value).length) RZ.code += el.dataset.v; rmDraw(); };
ACTS.rmDel = () => { RZ.code = RZ.code.slice(0, -1); rmDraw(); };
ACTS.rmPick = el => {
  const p = rmCurPuzzle(), v = el.dataset.v, len = p.answer.value.length;
  if (p.answer.type === 'set' && RZ.seq.includes(v)) RZ.seq = RZ.seq.filter(x => x !== v);
  else if (RZ.seq.length < len && !RZ.seq.includes(v)) RZ.seq.push(v);
  rmDraw();
};
ACTS.rmClear = () => { RZ.seq = []; rmDraw(); };
ACTS.rmPos = el => { RZ.pos[el.dataset.k] = JSON.parse(el.dataset.v); rmDraw(); };
ACTS.rmHint = el => { const st = rmState(), id = el.dataset.v; return rmPatch({ ['hints.' + id]: ((st.hints || {})[id] || 0) + 1 }).then(() => rmDraw()); };
ACTS.rmUse = el => rmTry([el.dataset.v, RZ.oid]);
ACTS.rmTryText = f => rmTry(f.v.value);
ACTS.rmTry = () => {
  const p = rmCurPuzzle(), t = p.answer.type;
  if (t === 'code') return rmTry(RZ.code);
  if (t === 'position') return rmTry(RZ.pos);
  if (RZ.seq.length < p.answer.value.length) { toast('Faltan ' + (p.answer.value.length - RZ.seq.length)); return; }
  return rmTry(RZ.seq);
};
async function rmTry(value) {
  const st = rmState(), p = rmCurPuzzle(), role = myRole();
  if (Rooms.puzzleStatus(rmScenario(st), rmCompute(st), st, p).status !== 'ready') return rmDraw();
  const r = Rooms.actTry(p, st, value, role);
  await rmPatch(r.patch);
  if (!r.ok) {
    RZ.seq = []; RZ.code = ''; vibrate([60, 40, 60]); chime(false);
    rmDraw(true);
    toast(r.lock ? 'Pausa corta: hablen y vuelvan a probar' : (p.on_fail && p.on_fail.message) || 'No es correcto');
    return;
  }
  closeSheet();
}

// ---------- Votación ----------
function rmVoteCard(s, st, p, role) {
  const v = (st.votes || {})[p.puzzle_id] || {}, mine = v[role], theirs = v[role === 'A' ? 'B' : 'A'];
  const differ = mine && theirs && mine !== theirs;
  const dlg = s.dialogues.find(d => String(d.trigger) === p.puzzle_id);
  return '<div class="card" style="border:2px solid var(--accent)"><h2>🗳️ ' + esc(p.name) + '</h2><p class="small" style="margin-top:0">' + esc(p.objective) + '</p>' +
    p.answer.options.map(o => '<button class="btn block" style="margin-top:8px;flex-direction:column;align-items:flex-start;text-align:left;' + (mine === o.key ? 'background:var(--accent);color:var(--accent-ink)' : '') + '" data-act="rmVote" data-p="' + p.puzzle_id + '" data-v="' + esc(o.key) + '"><b>' + esc(o.label) + '</b><span class="small">' + esc(o.consequence) + '</span></button>').join('') +
    '<p class="small muted" style="margin-bottom:0">' + (differ ? esc(dlg ? dlg.text : 'Votaron distinto. Hablen y voten otra vez.') : mine ? (theirs ? '' : 'Esperando el voto de ' + esc(partnerName()) + '…') : theirs ? esc(partnerName()) + ' ya votó. Te toca.' : 'Los dos votan. Cuéntense lo que leyeron.') + '</p></div>';
}
ACTS.rmVote = el => {
  const st = rmState(), s = rmScenario(st), p = s.puzzles.find(x => x.puzzle_id === el.dataset.p);
  return rmPatch(Rooms.actVote(p, st, myRole(), el.dataset.v).patch);
};

// Reloj de la partida
setInterval(() => {
  const t = document.getElementById('rmTimer'), st = rmState();
  if (!t || !st.startedAt || st.paused || !window.ROOMS_DATA[st.id]) return;
  const s = rmScenario(st), e = Rooms.elapsed(st);
  t.textContent = st.noTimer ? E.mmss(e) : E.mmss(Math.max(0, s.fail_condition.minutes * 60000 - e));
  // Ayuda por inactividad y fin del tiempo: se redibuja solo si no hay nada abierto
  const ae = document.activeElement;
  if (!$('#sheet') && !(ae && ae.tagName === 'INPUT') && (rmIdle(st) % 30 === 0 || (!st.noTimer && s.fail_condition.minutes * 60000 - e <= 0 && s.fail_condition.minutes * 60000 - e > -1500))) render();
}, 1000);
