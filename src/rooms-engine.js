// Motor de los escape rooms para dos (ERxx): lee el JSON del escenario y deduce todo el estado
// a partir de los hechos que guardan los jugadores. Sin DOM: funciona en Node y en el navegador (window.Rooms).
(function (root) {
  'use strict';

  // Estado guardado en la pareja (couple.rooms10), solo hechos de los jugadores:
  // { id, variant, startedAt, solved {Pxx: {at, by, opt}}, applied {'Oxx_k': 'A'|'B'}, found {A: {Cxx: t}, B: {...}},
  //   tries {Pxx: {fails, lockUntil}}, hints {Pxx: n}, votes {Pxx: {A, B}}, last, paused, pausedMs, noTimer, wonAt }
  // Las zonas, transiciones del sistema, eventos y finales se recalculan igual en los dos móviles.

  const COLLECTED = ['COLLECTED', 'TAKEN', 'IN_INVENTORY', 'HELD', 'JOINED'];

  function norm(v) {
    return String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
  }
  const normCode = v => norm(v).replace(/\s+/g, '');
  const all = (T, list) => (list || []).every(t => T.has(t));

  // Aplica una variante: cada clave sobrescrita sustituye a la de la base
  function scenario(data, variantId) {
    const s = JSON.parse(JSON.stringify(data));
    const v = (s.variants || []).find(x => x.variant_id === variantId);
    if (!v) return s;
    const o = v.overrides || {};
    for (const id in o.clues || {}) Object.assign(s.clues.find(c => c.clue_id === id) || {}, o.clues[id]);
    for (const id in o.puzzles || {}) Object.assign(s.puzzles.find(p => p.puzzle_id === id) || {}, o.puzzles[id]);
    for (const id in o.dialogues || {}) Object.assign(s.dialogues.find(d => d.dialogue_id === id) || {}, o.dialogues[id]);
    s.variant = variantId;
    return s;
  }

  function discovered(st) {
    const f = st.found || {}, out = new Set();
    for (const r of ['A', 'B']) for (const c in f[r] || {}) out.add(c);
    return out;
  }

  // Punto fijo: zonas, objetos, eventos. idleS añade los tokens IDLE_n ya cumplidos.
  function compute(s, st, idleS) {
    const T = new Set();
    const obj = new Map();
    const setObj = (id, v) => { const p = obj.get(id); if (p) T.delete(id + '_' + p); obj.set(id, v); T.add(id + '_' + v); };
    for (const o of s.objects) setObj(o.object_id, o.initial_state);
    if (!st || !st.startedAt) return { T, obj, done: new Set() };
    T.add('START');
    for (const c of discovered(st)) T.add(c + '_DISCOVERED');
    for (const k of ['player_a', 'player_b']) for (const c of s.players_data[k].initial_clues) T.add(c + '_DISCOVERED');
    const solved = st.solved || {};
    for (const id in solved) { T.add(id + '_SOLVED'); if (solved[id].opt) T.add(id + '_OPT_' + solved[id].opt); }
    if (idleS != null) for (const n of idleTokens(s)) if (n <= idleS) T.add('IDLE_' + n);
    const applied = st.applied || {}, done = new Set(), setsDone = new Set();
    let changed = true, guard = 0;
    while (changed && guard++ < 500) {
      changed = false;
      for (const r of s.rooms) if (!T.has(r.room_id + '_UNLOCKED') && all(T, r.unlocked_when)) { T.add(r.room_id + '_UNLOCKED'); changed = true; }
      for (const p of s.puzzles) if (solved[p.puzzle_id] && !setsDone.has(p.puzzle_id)) {
        setsDone.add(p.puzzle_id); changed = true;
        for (const x of p.on_solve.sets) { const m = x.match(/^(O\d{2})_([A-Z0-9_]+)$/); if (m && obj.has(m[1])) setObj(m[1], m[2]); else T.add(x); }
      }
      for (const o of s.objects) {
        if (!T.has(o.room + '_UNLOCKED')) continue;
        // una transición por objeto y pasada, en orden: las del sistema solas, las de jugador si se hicieron
        const i = o.transitions.findIndex((t, k) => !done.has(o.object_id + ':' + k) && all(T, t.when));
        if (i < 0) continue;
        const t = o.transitions[i];
        if (t.by !== 'system' && !applied[o.object_id + '_' + i]) continue;
        done.add(o.object_id + ':' + i); setObj(o.object_id, t.to); changed = true;
      }
      for (const e of s.events) if (!T.has(e.event_id + '_DONE') && all(T, e.trigger)) { T.add(e.event_id + '_DONE'); changed = true; }
    }
    return { T, obj, done };
  }

  function idleTokens(s) {
    if (s._idle) return s._idle;
    const set = new Set();
    JSON.stringify([s.clues, s.events]).replace(/IDLE_(\d+)/g, (m, n) => { set.add(+n); return m; });
    return (s._idle = [...set].sort((a, b) => a - b));
  }

  const can = (who, role) => who === role || who === 'AB';
  function roomOpen(c, id) { return c.T.has(id + '_UNLOCKED'); }
  function myRooms(s, c, role) { return s.rooms.filter(r => r.access[role] && roomOpen(c, r.room_id)); }
  function objectsIn(s, c, roomId) { return s.objects.filter(o => o.room === roomId && c.obj.get(o.object_id) !== 'HIDDEN'); }

  // Siguiente transición que puede hacer este jugador sobre el objeto (o -1)
  function nextAction(s, c, o, role) {
    if (!roomOpen(c, o.room)) return -1;
    const i = o.transitions.findIndex((t, k) => !c.done.has(o.object_id + ':' + k) && all(c.T, t.when));
    if (i < 0) return -1;
    const t = o.transitions[i];
    return t.by !== 'system' && can(t.by, role) ? i : -1;
  }

  // Pistas de juego que este jugador descubre al mirar el objeto
  function cluesAt(s, c, st, o, role) {
    const have = discovered(st);
    return s.clues.filter(k => k.location === o.object_id && k.help_level === 0 && !((st.found || {})[role] || {})[k.clue_id] &&
      can(k.player, role) && all(c.T, k.enabled_when) && all(c.T, k.discovered_when) && k.depends_on.every(d => have.has(d)));
  }
  function myClues(s, st, role) {
    const f = (st.found || {})[role] || {};
    const init = s.players_data[role === 'A' ? 'player_a' : 'player_b'].initial_clues;
    return s.clues.filter(k => f[k.clue_id] || init.includes(k.clue_id)).sort((a, b) => ((f[a.clue_id] || 0) - (f[b.clue_id] || 0)));
  }
  // Ayudas del sistema (pistas de nivel 1–3) que ya se ofrecen a este jugador
  function helpClues(s, c, role) {
    return s.clues.filter(k => k.help_level > 0 && can(k.player, role) && all(c.T, k.enabled_when) && all(c.T, k.discovered_when));
  }

  function inventory(s, c, role) {
    return s.objects.filter(o => o.category === 'collect' && can(o.authorized, role) && COLLECTED.includes(c.obj.get(o.object_id)));
  }

  // ¿Se puede intentar ya? ready | solved | locked | clues | cooldown | hidden
  function puzzleStatus(s, c, st, p, now) {
    if ((st.solved || {})[p.puzzle_id]) return { status: 'solved' };
    if (!roomOpen(c, p.room) || !all(c.T, p.prerequisites)) return { status: 'locked' };
    if (p.required_objects.some(o => c.obj.get(o) === 'HIDDEN')) return { status: 'hidden' };
    const have = discovered(st);
    const init = s.players_data.player_a.initial_clues.concat(s.players_data.player_b.initial_clues);
    const missing = p.validation.requires_clues.filter(k => !have.has(k) && !init.includes(k));
    if (missing.length) return { status: 'clues', missing };
    const tr = (st.tries || {})[p.puzzle_id] || {};
    if (tr.lockUntil && tr.lockUntil > (now || Date.now())) return { status: 'cooldown', until: tr.lockUntil };
    return { status: 'ready' };
  }

  // Comprueba una respuesta contra el acertijo (ya con la variante aplicada)
  function check(p, value) {
    const a = p.answer, want = a.value;
    switch (a.type) {
      case 'code': return normCode(value) === normCode(want);
      case 'sequence': return Array.isArray(value) && value.length === want.length && value.every((v, i) => norm(v) === norm(want[i]));
      case 'set': return Array.isArray(value) && value.length === want.length && value.map(norm).sort().join('|') === want.map(norm).sort().join('|');
      case 'position': {
        if (typeof want !== 'object' || want === null) return norm(value) === norm(want);
        return Object.keys(want).every(k => norm(JSON.stringify(value && value[k])) === norm(JSON.stringify(want[k])));
      }
      case 'combine': {
        if (!Array.isArray(value) || value.length !== want.length) return false;
        const t = want[want.length - 1];
        return norm(value[value.length - 1]) === norm(t) && value.slice(0, -1).map(norm).sort().join('|') === want.slice(0, -1).map(norm).sort().join('|');
      }
      case 'decision': return (a.options || []).some(o => o.key === value);
      default: return false;
    }
  }

  // Opciones que se ofrecen para secuencias, conjuntos y posiciones: lo de la respuesta y lo de las respuestas incorrectas
  function choices(p, extra) {
    const vals = [p.answer.value].concat((p.wrong_answers || []).map(w => w.value));
    if (p.answer.type === 'position' && p.answer.value && typeof p.answer.value === 'object') {
      const out = {};
      for (const k of Object.keys(p.answer.value)) {
        const set = new Set(vals.map(v => v && typeof v === 'object' ? v[k] : undefined).filter(v => v !== undefined).map(v => JSON.stringify(v)));
        for (const x of (extra && extra[k]) || []) set.add(JSON.stringify(x));
        out[k] = [...set].map(v => JSON.parse(v)).sort((a, b) => String(a).localeCompare(String(b), 'es', { numeric: true }));
      }
      return out;
    }
    const set = new Set();
    for (const v of vals) if (Array.isArray(v)) v.forEach(x => set.add(norm(x)));
    for (const x of extra || []) set.add(norm(x));
    return [...set].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  }

  function objectiveDone(s, c, id) { const ob = s.objectives.find(o => o.objective_id === id); return !!ob && all(c.T, ob.completed_when); }
  function won(s, c) { return s.win_condition.required_objectives.every(id => objectiveDone(s, c, id)); }
  function endings(s, c) { return s.endings.filter(e => all(c.T, e.condition)); }

  // Diálogos cuyo disparador ya se cumplió y que van a este jugador
  function dialoguesFor(s, c, role) {
    return s.dialogues.filter(d => {
      if (!can(d.audience, role)) return false;
      const t = String(d.trigger);
      if (/^E\d{2}$/.test(t)) return c.T.has(t + '_DONE');
      if (/^P\d{2}$/.test(t)) return c.T.has(t + '_SOLVED');
      return c.T.has(t);
    });
  }

  // Minutos de juego descontando pausas
  function elapsed(st, now) {
    if (!st || !st.startedAt) return 0;
    const end = st.wonAt || (st.paused || now || Date.now());
    return Math.max(0, end - st.startedAt - (st.pausedMs || 0));
  }


  // ---------- Acciones: cada una devuelve el parche (claves con puntos dentro de rooms10) ----------
  function actTransition(o, i, role, now) { return { ['applied.' + o.object_id + '_' + i]: role, last: now || Date.now() }; }
  function actFind(clues, role, now) {
    const t = now || Date.now(), patch = {};
    clues.forEach((k, j) => { patch['found.' + role + '.' + k.clue_id] = t + j; });
    if (clues.length) patch.last = t;
    return patch;
  }
  // Intento de respuesta: { ok, patch }
  function actTry(p, st, value, role, now) {
    const t = now || Date.now();
    if (check(p, value)) return { ok: true, patch: { ['solved.' + p.puzzle_id]: { at: t, by: role }, last: t } };
    const tr = (st.tries || {})[p.puzzle_id] || {};
    const fails = (tr.fails || 0) + 1, a = p.attempts || {};
    const lock = a.cooldown_after && fails % a.cooldown_after === 0 ? t + (a.cooldown_s || 0) * 1000 : 0;
    return { ok: false, lock, patch: { ['tries.' + p.puzzle_id]: { fails, lockUntil: lock } } };
  }
  // Votación (M6): se resuelve cuando los dos votan lo mismo. { result: 'wait'|'differ'|'solved', patch }
  function actVote(p, st, role, key, now) {
    const t = now || Date.now();
    const other = ((st.votes || {})[p.puzzle_id] || {})[role === 'A' ? 'B' : 'A'];
    if (other && other === key) return { result: 'solved', patch: { ['solved.' + p.puzzle_id]: { at: t, by: 'AB', opt: key }, ['votes.' + p.puzzle_id]: {}, last: t } };
    return { result: other ? 'differ' : 'wait', patch: { ['votes.' + p.puzzle_id + '.' + role]: key } };
  }
  function applyPatch(st, patch) {
    for (const k in patch) {
      const parts = k.split('.');
      let o = st;
      for (let i = 0; i < parts.length - 1; i++) { if (typeof o[parts[i]] !== 'object' || !o[parts[i]]) o[parts[i]] = {}; o = o[parts[i]]; }
      o[parts[parts.length - 1]] = patch[k];
    }
    return st;
  }

  const Rooms = { norm, scenario, compute, discovered, myRooms, objectsIn, nextAction, cluesAt, myClues, helpClues, inventory,
    puzzleStatus, check, choices, objectiveDone, won, endings, dialoguesFor, elapsed, COLLECTED,
    actTransition, actFind, actTry, actVote, applyPatch };
  if (typeof module !== 'undefined' && module.exports) module.exports = Rooms;
  else root.Rooms = Rooms;
})(typeof window !== 'undefined' ? window : globalThis);
