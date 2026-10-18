// Valida los guiones ERxx.json: sintaxis, referencias, cooperación real y ruta de victoria.
// Uso: node design/escape-rooms/tools/validate.mjs [ER01 ER02 ...]   (sin argumentos: todos)
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATEGORIES = ['decorative', 'examine', 'collect', 'use', 'combine', 'activate', 'locked', 'coop', 'narrative', 'exit'];
const STATES = ['INITIALIZING', 'INTRO', 'EXPLORATION', 'PUZZLE_ACTIVE', 'WAITING_FOR_PARTNER', 'VALIDATING', 'PUZZLE_SOLVED',
  'ROOM_UNLOCKED', 'FINAL_SEQUENCE', 'COMPLETED', 'FAILED', 'PAUSED', 'RESETTING'];
const TOP = ['scenario_id', 'title', 'version', 'players', 'genre', 'synopsis', 'difficulty', 'estimated_duration_minutes', 'phase_minutes',
  'competencies', 'initial_conditions', 'initial_state', 'objectives', 'win_condition', 'fail_condition', 'reset_condition', 'narrative',
  'rooms', 'players_data', 'objects', 'clues', 'puzzles', 'coop_mechanisms', 'dependencies', 'state_transitions', 'events', 'dialogues',
  'audio_cues', 'visual_effects', 'endings', 'replay_tips', 'variants', 'difficulty_tuning', 'reset_rules', 'test_cases', 'resources'];
const PUZZLE_FIELDS = ['puzzle_id', 'name', 'narrative', 'objective', 'situation', 'required_objects', 'info_a', 'info_b', 'must_communicate',
  'rules', 'steps', 'answer', 'wrong_answers', 'validation', 'on_solve', 'on_fail', 'attempts', 'hints', 'estimated_minutes', 'unlocks',
  'reset_condition', 'edge_cases', 'room', 'main', 'prerequisites', 'solution_proof'];
const MECH_FIELDS = ['mechanism_id', 'model', 'puzzle', 'title', 'why_not_solo', 'info_a', 'info_b', 'communicate_a', 'communicate_b',
  'action_a', 'action_b', 'validation', 'miscommunication', 'anti_domination', 'skill_gap'];
const VARIANT_PUZZLE_KEYS = ['answer', 'hints', 'wrong_answers', 'rules', 'steps', 'on_solve', 'solution_proof'];
const BANNED = /por definir|agregar después|a criterio del programador|lorem ipsum|\bTODO\b|\bTBD\b|\bxxx\b/;

export function validate(s) {
  const err = [];
  const e = (m) => err.push(m);
  for (const k of TOP) if (!(k in s)) e(`falta la clave ${k}`);
  if (err.length) return err;
  if (s.players !== 2) e('players debe ser 2');
  if (!['easy', 'medium', 'hard'].includes(s.difficulty)) e('difficulty inválida');
  if (s.initial_state !== 'INITIALIZING') e('initial_state debe ser INITIALIZING');
  const pm = s.phase_minutes;
  const sum = ['awakening', 'discovery', 'complication', 'climax', 'escape'].reduce((a, k) => a + (pm[k] ?? NaN), 0);
  if (sum !== s.estimated_duration_minutes) e(`phase_minutes suma ${sum}, no ${s.estimated_duration_minutes}`);
  const text = JSON.stringify(s);
  const bad = text.match(BANNED) || text.toLowerCase().match(/por definir|agregar después|a criterio del programador/);
  if (bad) e(`texto prohibido: "${bad[0]}"`);

  // índices y unicidad
  const idx = {};
  const ids = new Set();
  const reg = (list, key, prefix) => {
    idx[prefix] = new Map();
    for (const x of list) {
      const id = x[key];
      if (!id || !new RegExp(`^${prefix}\\d{2}$`).test(id)) e(`${key} mal formado: ${id}`);
      if (ids.has(id)) e(`ID duplicado: ${id}`);
      ids.add(id); idx[prefix].set(id, x);
    }
  };
  reg(s.rooms, 'room_id', 'ROOM'); reg(s.objects, 'object_id', 'O'); reg(s.clues, 'clue_id', 'C'); reg(s.puzzles, 'puzzle_id', 'P');
  reg(s.coop_mechanisms, 'mechanism_id', 'M'); reg(s.events, 'event_id', 'E'); reg(s.dialogues, 'dialogue_id', 'D');
  reg(s.audio_cues, 'audio_id', 'A'); reg(s.visual_effects, 'vfx_id', 'V'); reg(s.endings, 'ending_id', 'END');
  reg(s.variants, 'variant_id', 'VAR'); reg(s.test_cases, 'test_id', 'T'); reg(s.objectives, 'objective_id', 'OBJ');
  const doorIds = new Set(), lightIds = new Set();
  for (const r of s.rooms) {
    for (const d of r.doors || []) { if (doorIds.has(d.door_id) || ids.has(d.door_id)) e(`puerta duplicada ${d.door_id}`); doorIds.add(d.door_id); }
    for (const l of r.lighting || []) { if (lightIds.has(l.light_id)) e(`luz duplicada ${l.light_id}`); lightIds.add(l.light_id); }
  }
  const R = idx.ROOM, O = idx.O, C = idx.C, P = idx.P, M = idx.M, E = idx.E, AU = idx.A, V = idx.V;
  const has = (m, id, where) => { if (!m.has(id)) e(`${where}: referencia inexistente ${id}`); };

  // tokens
  const tokenOk = (t, where) => {
    let m;
    if (t === 'START' || t === 'TIMER_EXPIRED' || /^IDLE_\d+$/.test(t)) return;
    if ((m = t.match(/^(P\d{2})_SOLVED$/))) return has(P, m[1], where);
    if ((m = t.match(/^(P\d{2})_OPT_([A-Z0-9_]+)$/))) {
      const p = P.get(m[1]);
      if (!p) return e(`${where}: token ${t} con acertijo inexistente`);
      if (!(p.answer.options || []).some((o) => o.key === m[2])) e(`${where}: opción ${m[2]} no existe en ${m[1]}`);
      return;
    }
    if ((m = t.match(/^(C\d{2})_DISCOVERED$/))) return has(C, m[1], where);
    if ((m = t.match(/^(E\d{2})_DONE$/))) return has(E, m[1], where);
    if ((m = t.match(/^(ROOM\d{2})_UNLOCKED$/))) return has(R, m[1], where);
    if ((m = t.match(/^(O\d{2})_([A-Z_]+)$/))) {
      const o = O.get(m[1]);
      if (!o) return e(`${where}: token ${t} con objeto inexistente`);
      if (!o.states.includes(m[2])) e(`${where}: el objeto ${m[1]} no tiene el estado ${m[2]}`);
      return;
    }
    e(`${where}: token desconocido ${t}`);
  };
  const tokens = (list, where) => { if (!Array.isArray(list)) return e(`${where}: debe ser lista de tokens`); list.forEach((t) => tokenOk(t, where)); };

  for (const ob of s.objectives) tokens(ob.completed_when, ob.objective_id);
  s.win_condition.required_objectives.forEach((id) => has(idx.OBJ, id, 'win_condition'));

  // zonas
  for (const r of s.rooms) {
    tokens(r.unlocked_when, r.room_id); tokens(r.exit_conditions, `${r.room_id}.exit_conditions`);
    if (!r.access || typeof r.access.A !== 'boolean' || typeof r.access.B !== 'boolean') e(`${r.room_id}: access inválido`);
    for (const d of r.doors) { tokens(d.opens_when, d.door_id); if (d.to !== 'EXIT') has(R, d.to, d.door_id); }
    for (const id of r.objects) { has(O, id, r.room_id); if (O.get(id) && O.get(id).room !== r.room_id) e(`${id} listado en ${r.room_id} pero su room es ${O.get(id).room}`); }
    for (const id of r.puzzles) { has(P, id, r.room_id); if (P.get(id) && P.get(id).room !== r.room_id) e(`${id} listado en ${r.room_id} pero su room es ${P.get(id).room}`); }
    if (r.ambient_sound) has(AU, r.ambient_sound, r.room_id);
    if (r.music) has(AU, r.music, r.room_id);
    for (const c of r.dynamic_changes) has(E, c.event, r.room_id);
    for (const [k, v] of Object.entries(r.dimensions_m)) if (!(v > 0)) e(`${r.room_id}: dimensión ${k} inválida`);
    const inside = (pos, where) => {
      if (!pos || pos.x < 0 || pos.z < 0 || pos.y < 0 || pos.x > r.dimensions_m.w || pos.z > r.dimensions_m.d || pos.y > r.dimensions_m.h) e(`${where}: posición fuera de ${r.room_id}`);
    };
    r.doors.forEach((d) => inside(d.position, d.door_id)); r.lighting.forEach((l) => inside(l.position, l.light_id));
    for (const id of r.objects) if (O.get(id)) inside(O.get(id).position, id);
  }
  for (const o of s.objects) if (![...R.values()].some((r) => r.objects.includes(o.object_id))) e(`${o.object_id} no está en ninguna zona`);
  for (const p of s.puzzles) if (![...R.values()].some((r) => r.puzzles.includes(p.puzzle_id))) e(`${p.puzzle_id} no está en ninguna zona`);

  // jugadores
  for (const k of ['player_a', 'player_b']) {
    const pd = s.players_data[k];
    has(R, pd.initial_location, k); pd.initial_clues.forEach((c) => has(C, c, k)); pd.initial_inventory.forEach((o) => has(O, o, k));
  }

  // objetos
  for (const o of s.objects) {
    const w = o.object_id;
    if (!CATEGORIES.includes(o.category)) e(`${w}: categoría inválida ${o.category}`);
    if (!o.states?.length || o.states[0] !== o.initial_state) e(`${w}: states[0] debe ser initial_state`);
    if (!o.states.includes(o.final_state)) e(`${w}: final_state fuera de states`);
    for (const st of o.states) if (!/^[A-Z_]+$/.test(st)) e(`${w}: estado ${st} no está en mayúsculas`);
    has(R, o.room, w); tokens(o.activation_condition, w);
    for (const t of o.transitions) { tokens(t.when, `${w}.transitions`); if (!o.states.includes(t.to)) e(`${w}: transición a estado inexistente ${t.to}`); }
    if (o.clue) has(C, o.clue, w);
    if (o.puzzle) has(P, o.puzzle, w);
    if (o.category === 'decorative' && (o.clue || o.puzzle || o.transitions.length || o.action !== 'none' || o.authorized !== 'none')) e(`${w}: un decorativo no puede ser interactivo`);
    if (o.category !== 'decorative' && !['A', 'B', 'AB'].includes(o.authorized)) e(`${w}: authorized inválido`);
    const r = R.get(o.room);
    if (r && o.authorized !== 'none') for (const pl of o.authorized === 'AB' ? ['A', 'B'] : [o.authorized]) if (!r.access[pl]) e(`${w}: ${pl} autorizado en una zona sin acceso`);
    if (o.category !== 'decorative' && !o.clue && !o.puzzle && !s.puzzles.some((p) => p.required_objects.includes(w)) && !s.clues.some((c) => c.location === w) && o.category !== 'exit' && o.category !== 'narrative')
      e(`${w}: objeto interactivo sin pista ni acertijo que lo use`);
  }
  if (s.objects.filter((o) => o.category === 'decorative').length < 1) e('debe haber elementos decorativos explícitos');
  if (!s.objects.some((o) => o.category === 'exit')) e('falta un objeto de salida');

  // pistas
  for (const c of s.clues) {
    const w = c.clue_id;
    has(O, c.location, w); has(P, c.puzzle, w); c.depends_on.forEach((d) => has(C, d, w));
    tokens(c.enabled_when, w); tokens(c.discovered_when, `${w}.discovered_when`);
    if (!['A', 'B', 'AB'].includes(c.player)) e(`${w}: player inválido`);
    if (!c.content || !c.alt_text) e(`${w}: falta contenido o alternativa accesible`);
    if (!(c.help_level >= 0 && c.help_level <= 3)) e(`${w}: help_level inválido`);
    const o = O.get(c.location), r = o && R.get(o.room);
    if (r) for (const pl of c.player === 'AB' ? ['A', 'B'] : [c.player]) if (!r.access[pl] && !(r.view && r.view[pl])) e(`${w}: ${pl} no puede ver la zona ${r.room_id}`);
  }

  // acertijos
  const mains = s.puzzles.filter((p) => p.main);
  if (mains.length < 5 || mains.length > 8) e(`acertijos principales: ${mains.length} (deben ser 5–8)`);
  for (const p of s.puzzles) {
    const w = p.puzzle_id;
    for (const f of PUZZLE_FIELDS) if (!(f in p)) e(`${w}: falta ${f}`);
    if (err.length > 60) break;
    has(R, p.room, w); p.required_objects.forEach((o) => has(O, o, w)); p.unlocks.forEach((u) => has(P, u, w));
    tokens(p.prerequisites, w); tokens(p.on_solve.sets, `${w}.on_solve`); p.on_solve.events.forEach((x) => has(E, x, w));
    p.validation.requires_clues.forEach((c) => { has(C, c, w); });
    if (p.hints.length !== 3 || p.hints.some((h) => !h)) e(`${w}: necesita 3 niveles de ayuda`);
    if (!p.steps.length || !p.rules.length || !p.edge_cases.length) e(`${w}: faltan pasos, reglas o casos límite`);
    const a = p.answer;
    if (a.type === 'decision') {
      if (!a.options || a.options.length < 2) e(`${w}: una decisión necesita al menos 2 opciones`);
      if (p.validation.coop_model !== 'M6') e(`${w}: una decisión usa M6`);
    } else {
      if (a.value === null || a.value === undefined || a.value === '' || (Array.isArray(a.value) && !a.value.length)) e(`${w}: respuesta vacía`);
      if (!p.wrong_answers.length) e(`${w}: faltan respuestas incorrectas posibles`);
      for (const wa of p.wrong_answers) if (JSON.stringify(wa.value) === JSON.stringify(a.value)) e(`${w}: una respuesta incorrecta coincide con la correcta`);
    }
    const v = p.validation;
    if (!v.input_by?.length || v.input_by.some((x) => !['A', 'B'].includes(x))) e(`${w}: input_by inválido`);
    if (v.coop_model && !/^M[1-6]$/.test(v.coop_model)) e(`${w}: coop_model inválido`);
    if (v.mechanism_id) { has(M, v.mechanism_id, w); const m = M.get(v.mechanism_id); if (m && (m.puzzle !== w || m.model !== v.coop_model)) e(`${w}: mecanismo ${v.mechanism_id} no coincide`); }
    if (v.coop_model === 'M3' && !(v.window_ms > 0 && v.input_by.length === 2)) e(`${w}: M3 necesita window_ms e input_by de A y B`);
    // cooperación real: en un principal deben aportar los dos
    const who = new Set(v.input_by);
    for (const c of v.requires_clues) { const cl = C.get(c); if (cl) (cl.player === 'AB' ? ['A', 'B'] : [cl.player]).forEach((x) => who.add(x)); }
    if (p.main && !(who.has('A') && who.has('B'))) e(`${w}: acertijo principal que puede resolver un solo jugador`);
    if (v.coop_model === 'M1' || v.coop_model === 'M2') {
      const inputters = new Set(v.input_by);
      const others = v.requires_clues.map((c) => C.get(c)).filter((c) => c && c.player !== 'AB' && !inputters.has(c.player));
      if (!others.length) e(`${w}: ${v.coop_model} exige una pista que solo tenga el jugador que no introduce la respuesta`);
    }
    for (const c of v.requires_clues) { const cl = C.get(c); if (cl && cl.puzzle !== w && !s.puzzles.some((q) => q.puzzle_id === cl.puzzle)) e(`${w}: pista ${c} apunta a acertijo inexistente`); }
  }

  // mecanismos cooperativos
  const genuine = new Set();
  for (const m of s.coop_mechanisms) {
    for (const f of MECH_FIELDS) if (!m[f]) e(`${m.mechanism_id}: falta ${f}`);
    has(P, m.puzzle, m.mechanism_id);
    const p = P.get(m.puzzle);
    if (p && p.validation.mechanism_id !== m.mechanism_id) e(`${m.mechanism_id}: el acertijo ${m.puzzle} no lo referencia`);
    genuine.add(m.puzzle);
  }
  if (genuine.size < 3) e(`solo ${genuine.size} mecanismos cooperativos en acertijos distintos (mínimo 3)`);
  if (new Set(s.coop_mechanisms.map((m) => m.model)).size < 3) e('los mecanismos deben usar al menos 3 modelos distintos');

  // dependencias, eventos y demás referencias
  const anyId = (id, where) => { if (id === 'START' || id === 'ESCAPE') return; if (!ids.has(id) && !doorIds.has(id)) e(`${where}: nodo inexistente ${id}`); };
  for (const d of s.dependencies) { anyId(d.from, 'dependencies'); anyId(d.to, 'dependencies'); if (!['required', 'optional'].includes(d.type)) e(`dependencia ${d.from}->${d.to}: type inválido`); }
  if (!s.dependencies.some((d) => d.from === 'START') || !s.dependencies.some((d) => d.to === 'ESCAPE')) e('el grafo debe empezar en START y acabar en ESCAPE');
  for (const t of s.state_transitions) { if (!STATES.includes(t.from) && t.from !== 'ANY') e(`transición con estado ${t.from}`); if (!STATES.includes(t.to)) e(`transición con estado ${t.to}`); }
  for (const x of s.events) {
    tokens(x.trigger, x.event_id); x.affects.forEach((a) => anyId(a, x.event_id));
    if (x.audio) has(AU, x.audio, x.event_id); if (x.visual) has(V, x.visual, x.event_id);
  }
  for (const d of s.dialogues) {
    if (/^E\d{2}$/.test(d.trigger)) has(E, d.trigger, d.dialogue_id);
    else if (/^P\d{2}$/.test(d.trigger)) has(P, d.trigger, d.dialogue_id);
    else tokenOk(d.trigger, d.dialogue_id);
    if (!['A', 'B', 'AB'].includes(d.audience)) e(`${d.dialogue_id}: audience inválida`);
  }
  for (const en of s.endings) tokens(en.condition, en.ending_id);
  if (!s.endings.some((x) => x.type === 'main')) e('falta un final principal');
  if (s.endings.length < 2) e('se necesitan al menos 2 finales');
  if (s.variants.length < 2) e('se necesitan al menos 2 variantes');
  for (const va of s.variants) {
    for (const id of Object.keys(va.overrides.clues || {})) has(C, id, va.variant_id);
    for (const [id, ov] of Object.entries(va.overrides.puzzles || {})) {
      has(P, id, va.variant_id);
      const p = P.get(id);
      if (p && ov.answer && JSON.stringify(ov.answer.value) === JSON.stringify(p.answer.value)) e(`${va.variant_id}: la variante de ${id} no cambia la respuesta`);
      if (p && !Object.keys(va.overrides.clues || {}).some((c) => p.validation.requires_clues.includes(c))) e(`${va.variant_id}: cambia ${id} sin cambiar ninguna de sus pistas`);
      for (const k of Object.keys(ov)) if (!VARIANT_PUZZLE_KEYS.includes(k)) e(`${va.variant_id}.${id}: clave de variante no permitida ${k}`);
      if (p && ov.answer) {
        // con otra respuesta, las ayudas y las respuestas incorrectas de la base dejan de valer
        if (!Array.isArray(ov.hints) || ov.hints.length !== 3) e(`${va.variant_id}.${id}: cambia la respuesta y necesita sus 3 ayudas propias`);
        if (!Array.isArray(ov.wrong_answers) || !ov.wrong_answers.length) e(`${va.variant_id}.${id}: cambia la respuesta y necesita sus respuestas incorrectas propias`);
        for (const wa of ov.wrong_answers || []) if (JSON.stringify(wa.value) === JSON.stringify(ov.answer.value)) e(`${va.variant_id}.${id}: una respuesta incorrecta coincide con la correcta de la variante`);
        const base = typeof p.answer.value === 'string' ? p.answer.value : null;
        if (base && base.length >= 3 && (ov.hints || []).some((h) => h.includes(base))) e(`${va.variant_id}.${id}: una ayuda contiene la respuesta de la base`);
      }
    }
    for (const id of Object.keys(va.overrides.dialogues || {})) has(idx.D, id, va.variant_id);
  }
  for (const t of s.test_cases) t.covers.forEach((c) => anyId(c, t.test_id));
  const cats = new Set(s.test_cases.map((t) => t.category));
  for (let i = 1; i <= 15; i++) if (!cats.has(i)) e(`falta prueba de la categoría ${i}`);
  for (const p of s.puzzles) if (!s.test_cases.some((t) => t.covers.includes(p.puzzle_id))) e(`${p.puzzle_id} sin caso de prueba`);
  for (const m of s.coop_mechanisms) if (!s.test_cases.some((t) => t.covers.includes(m.mechanism_id))) e(`${m.mechanism_id} sin caso de prueba`);

  if (!err.length) err.push(...simulate(s));
  return err;
}

// Simulación de progreso: aplica todo lo alcanzable hasta un punto fijo, con los dos jugadores ideales.
export function simulate(s, { overrides } = {}) {
  const err = [];
  const T = new Set(['START']);
  const objState = new Map(s.objects.map((o) => [o.object_id, o.initial_state]));
  const setObj = (id, st) => { const prev = objState.get(id); if (prev) T.delete(`${id}_${prev}`); objState.set(id, st); T.add(`${id}_${st}`); };
  for (const [id, st] of objState) T.add(`${id}_${st}`);
  const all = (list) => list.every((t) => T.has(t));
  const roomOpen = (id) => T.has(`${id}_UNLOCKED`);
  for (const k of ['player_a', 'player_b']) for (const c of s.players_data[k].initial_clues) T.add(`${c}_DISCOVERED`);
  const order = [];
  let changed = true, guard = 0;
  while (changed && guard++ < 500) {
    changed = false;
    for (const r of s.rooms) if (!roomOpen(r.room_id) && all(r.unlocked_when)) { T.add(`${r.room_id}_UNLOCKED`); changed = true; order.push(`${r.room_id}_UNLOCKED`); }
    for (const o of s.objects) {
      if (!roomOpen(o.room)) continue;
      // cada transición se aplica una sola vez, en orden, y como mucho una por pasada,
      // para que las pistas que dependen de un estado intermedio lleguen a verlo
      const i = o.transitions.findIndex((t, k) => !T.has(`applied:${o.object_id}:${k}`) && all(t.when));
      if (i >= 0) { T.add(`applied:${o.object_id}:${i}`); setObj(o.object_id, o.transitions[i].to); changed = true; }
    }
    for (const c of s.clues) {
      const tok = `${c.clue_id}_DISCOVERED`;
      if (T.has(tok)) continue;
      const o = s.objects.find((x) => x.object_id === c.location);
      if (o && roomOpen(o.room) && objState.get(o.object_id) !== 'HIDDEN' && all(c.enabled_when) && all(c.discovered_when) && c.depends_on.every((d) => T.has(`${d}_DISCOVERED`))) {
        T.add(tok); changed = true; order.push(tok);
      }
    }
    for (const p of s.puzzles) {
      const tok = `${p.puzzle_id}_SOLVED`;
      if (T.has(tok) || !roomOpen(p.room)) continue;
      if (!all(p.prerequisites)) continue;
      if (!p.validation.requires_clues.every((c) => T.has(`${c}_DISCOVERED`))) continue;
      if (p.required_objects.some((o) => objState.get(o) === 'HIDDEN')) continue;
      T.add(tok); order.push(tok);
      for (const st of p.on_solve.sets) {
        const m = st.match(/^(O\d{2})_([A-Z_]+)$/);
        if (m) setObj(m[1], m[2]); else T.add(st);
      }
      if (p.answer.type === 'decision') for (const o of p.answer.options) T.add(`${p.puzzle_id}_OPT_${o.key}`);
      changed = true;
    }
    for (const x of s.events) {
      const tok = `${x.event_id}_DONE`;
      if (T.has(tok) || x.trigger.some((t) => /^IDLE_|TIMER_EXPIRED/.test(t))) continue;
      if (all(x.trigger)) { T.add(tok); changed = true; }
    }
  }
  for (const p of s.puzzles) if (p.main && !T.has(`${p.puzzle_id}_SOLVED`)) err.push(`ruta sin salida: ${p.puzzle_id} nunca se puede resolver`);
  for (const c of s.clues) if (c.help_level === 0 && !T.has(`${c.clue_id}_DISCOVERED`)) err.push(`ruta sin salida: la pista ${c.clue_id} nunca se descubre`);
  for (const id of s.win_condition.required_objectives) {
    const ob = s.objectives.find((o) => o.objective_id === id);
    if (ob && !ob.completed_when.every((t) => T.has(t))) err.push(`el objetivo ${id} no se puede completar`);
  }
  for (const en of s.endings) if (!en.condition.every((t) => T.has(t))) err.push(`el final ${en.ending_id} es inalcanzable`);
  // cada acertijo necesita sus pistas antes de poder intentarse (no después)
  for (const p of s.puzzles) for (const c of p.validation.requires_clues) {
    const ic = order.indexOf(`${c}_DISCOVERED`), ip = order.indexOf(`${p.puzzle_id}_SOLVED`);
    const initial = ['player_a', 'player_b'].some((k) => s.players_data[k].initial_clues.includes(c));
    if (!initial && ic > ip && ip >= 0) err.push(`${p.puzzle_id} se resolvería antes de descubrir ${c}`);
  }
  return err;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const want = process.argv.slice(2);
  const files = readdirSync(DIR).filter((f) => /^ER\d{2}\.json$/.test(f)).filter((f) => !want.length || want.includes(f.slice(0, 4)));
  let bad = 0;
  for (const f of files) {
    let s;
    try { s = JSON.parse(readFileSync(join(DIR, f), 'utf8')); } catch (x) { console.log(`✗ ${f}: JSON inválido: ${x.message}`); bad++; continue; }
    const errs = validate(s);
    if (errs.length) { bad++; console.log(`✗ ${f}: ${errs.length} problemas`); errs.slice(0, 80).forEach((m) => console.log('   - ' + m)); }
    else {
      const mains = s.puzzles.filter((p) => p.main).length;
      console.log(`✓ ${f}: ${s.rooms.length} zonas, ${s.objects.length} objetos, ${s.clues.length} pistas, ${mains} acertijos principales, ${s.coop_mechanisms.length} mecanismos, ${s.test_cases.length} pruebas`);
    }
  }
  if (!files.length) console.log('no hay escenarios');
  process.exit(bad ? 1 : 0);
}
