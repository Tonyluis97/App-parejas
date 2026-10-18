// Genera src/rooms-data.js: el índice de los 10 escenarios y los datos de juego de los que ya son jugables,
// sin los campos que solo sirven al diseño (pruebas, recursos, mecanismos, coordenadas…).
// Uso: node design/escape-rooms/tools/slim.mjs
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(DIR, '..', '..', 'src', 'rooms-data.js');
const PLAYABLE = ['ER09'];

const pick = (o, keys) => Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]));

function slim(s) {
  return {
    ...pick(s, ['scenario_id', 'title', 'synopsis', 'difficulty', 'estimated_duration_minutes', 'fail_condition', 'objectives', 'win_condition', 'endings']),
    narrative: pick(s.narrative, ['intro', 'goal', 'escape_scene', 'epilogue']),
    players_data: s.players_data,
    rooms: s.rooms.map(r => pick(r, ['room_id', 'name', 'description', 'access', 'view', 'unlocked_when'])),
    objects: s.objects.map(o => pick(o, ['object_id', 'name', 'visual', 'room', 'category', 'states', 'initial_state', 'action', 'result', 'transitions', 'clue', 'puzzle', 'authorized'])),
    clues: s.clues.map(c => pick(c, ['clue_id', 'content', 'alt_text', 'location', 'player', 'depends_on', 'enabled_when', 'help_level', 'discovered_when'])),
    puzzles: s.puzzles.map(p => ({
      ...pick(p, ['puzzle_id', 'name', 'narrative', 'objective', 'situation', 'required_objects', 'rules', 'answer', 'on_solve', 'on_fail', 'attempts', 'hints', 'room', 'main', 'prerequisites']),
      wrong_answers: p.wrong_answers.map(w => ({ value: w.value })),
      validation: pick(p.validation, ['input_by', 'requires_clues', 'coop_model', 'window_ms']),
    })),
    events: s.events.map(e => pick(e, ['event_id', 'trigger', 'action'])),
    dialogues: s.dialogues.map(d => pick(d, ['dialogue_id', 'speaker', 'text', 'trigger', 'audience', 'channel'])),
    variants: s.variants.map(v => ({ variant_id: v.variant_id, overrides: v.overrides })),
  };
}

const index = [], data = {};
for (const f of readdirSync(DIR).filter(f => /^ER\d{2}\.json$/.test(f)).sort()) {
  const s = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  const id = s.scenario_id;
  const ready = PLAYABLE.includes(id);
  index.push({ id, title: s.title, synopsis: s.synopsis, difficulty: s.difficulty, minutes: s.estimated_duration_minutes, ready });
  if (!ready) continue;
  const ui = join(DIR, 'ui', id + '.json');
  data[id] = { ...slim(s), ui: existsSync(ui) ? JSON.parse(readFileSync(ui, 'utf8')) : {} };
}
const js = '// Generado por design/escape-rooms/tools/slim.mjs a partir de los ERxx.json. No editar a mano.\n' +
  'window.ROOMS_INDEX = ' + JSON.stringify(index) + ';\nwindow.ROOMS_DATA = ' + JSON.stringify(data) + ';\n';
writeFileSync(OUT, js);
console.log('src/rooms-data.js', Math.round(js.length / 1024) + ' KB', 'jugables: ' + PLAYABLE.join(', '));
