// Pruebas del motor de escape rooms: dos jugadores simulados juegan cada escenario jugable,
// en la base y en cada variante, solo con lo que les deja hacer el motor.
const R = require('../src/rooms-engine.js');
global.window = {};
require('../src/rooms-data.js');
let fails = 0, n = 0;
function ok(name, c) { n++; if (!c) { fails++; console.log('FALLA', name); } }

// Busca un objeto del inventario para los acertijos de combinar
function combineValue(s, c, p, role) {
  const inv = R.inventory(s, c, role).map(o => o.object_id);
  const want = p.answer.value;
  return want.slice(0, -1).every(x => inv.includes(x)) ? want : null;
}

function play(data, variant) {
  const s = R.scenario(data, variant);
  const tag = data.scenario_id + (variant ? '/' + variant : '');
  let st = { id: s.scenario_id, startedAt: 1000 };
  let now = 2000, steps = 0;
  const step = patch => { R.applyPatch(st, patch); now += 1000; steps++; };

  // Antes de empezar no hay nada abierto
  ok(tag + ' sin empezar no hay zonas', R.myRooms(s, R.compute(s, {}), 'A').length === 0);

  for (let round = 0; round < 60 && !R.won(s, R.compute(s, st)); round++) {
    for (const role of ['A', 'B']) {
      // Mirar todo lo que se ve y hacer lo que toque
      let c = R.compute(s, st);
      for (const r of R.myRooms(s, c, role)) for (const o of R.objectsIn(s, c, r.room_id)) {
        c = R.compute(s, st);
        const i = R.nextAction(s, c, o, role);
        if (i >= 0) { step(R.actTransition(o, i, role, now)); c = R.compute(s, st); }
        const found = R.cluesAt(s, c, st, o, role);
        if (found.length) step(R.actFind(found, role, now));
      }
      // Intentar los acertijos listos
      c = R.compute(s, st);
      for (const p of s.puzzles) {
        if (!p.validation.input_by.includes(role) || R.puzzleStatus(s, c, st, p, now).status !== 'ready') continue;
        if (p.answer.type === 'decision') {
          const key = p.answer.options[0].key;
          step(R.actVote(p, st, role, key, now).patch);
          continue;
        }
        // Una respuesta incorrecta se rechaza antes de la buena
        const wrong = (p.wrong_answers || [])[0];
        if (wrong && p.answer.type !== 'combine') {
          const r = R.actTry(p, st, wrong.value, role, now);
          ok(tag + ' ' + p.puzzle_id + ' rechaza la incorrecta', !r.ok);
        }
        const value = p.answer.type === 'combine' ? combineValue(s, c, p, role) : p.answer.value;
        if (value === null) continue;
        const r = R.actTry(p, st, value, role, now);
        ok(tag + ' ' + p.puzzle_id + ' acepta la correcta', r.ok);
        step(r.patch);
        c = R.compute(s, st);
      }
    }
  }
  const c = R.compute(s, st);
  ok(tag + ' escapan', R.won(s, c));
  for (const p of s.puzzles.filter(p => p.main)) ok(tag + ' resuelto ' + p.puzzle_id, !!(st.solved || {})[p.puzzle_id]);
  ok(tag + ' hay final', R.endings(s, c).length > 0);
  // Cada jugador terminó con pistas en su registro y nunca con pistas del otro
  for (const role of ['A', 'B']) for (const k of R.myClues(s, st, role)) ok(tag + ' ' + k.clue_id + ' es de ' + role, k.player === role || k.player === 'AB');
  return steps;
}

for (const id in window.ROOMS_DATA) {
  const data = window.ROOMS_DATA[id];
  play(data, null);
  for (const v of data.variants) play(data, v.variant_id);

  // Reglas concretas sobre la base
  const s = R.scenario(data, null);
  const st = { startedAt: 1000 };
  const c = R.compute(s, st);
  for (const p of s.puzzles) if (p.validation.requires_clues.length && p.prerequisites.every(t => t === 'START'))
    ok(id + ' ' + p.puzzle_id + ' pide pistas antes de intentarse', R.puzzleStatus(s, c, st, p, 2000).status === 'clues');
  // Enfriamiento tras fallos seguidos
  const p = s.puzzles.find(x => x.attempts && x.attempts.cooldown_after && x.answer.type !== 'decision');
  if (p) {
    let t = { startedAt: 1000 };
    for (let i = 0; i < p.attempts.cooldown_after; i++) R.applyPatch(t, R.actTry(p, t, ['X'], 'A', 5000).patch);
    ok(id + ' bloqueo tras ' + p.attempts.cooldown_after + ' fallos', t.tries[p.puzzle_id].lockUntil === 5000 + p.attempts.cooldown_s * 1000);
  }
  // Votos distintos no resuelven
  const d = s.puzzles.find(x => x.answer.type === 'decision');
  if (d) {
    const t = {};
    R.applyPatch(t, R.actVote(d, t, 'A', d.answer.options[0].key).patch);
    const r = R.actVote(d, t, 'B', d.answer.options[1].key);
    ok(id + ' votos distintos', r.result === 'differ' && !r.patch['solved.' + d.puzzle_id]);
  }
  // Una variante cambia la respuesta: la de la base ya no sirve
  for (const v of data.variants) for (const pid in v.overrides.puzzles || {}) {
    const base = s.puzzles.find(x => x.puzzle_id === pid), vs = R.scenario(data, v.variant_id).puzzles.find(x => x.puzzle_id === pid);
    if (base.answer.value && JSON.stringify(base.answer.value) !== JSON.stringify(vs.answer.value)) ok(id + ' ' + v.variant_id + ' ' + pid + ' no acepta la respuesta base', !R.check(vs, base.answer.value));
  }
}
ok('normaliza tildes', R.check({ answer: { type: 'sequence', value: ['MASCARA'] } }, ['máscara ']));

console.log(fails ? fails + ' fallos de ' + n : 'ok ' + n + ' comprobaciones');
process.exit(fails ? 1 : 0);
