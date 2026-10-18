// Genera el guion legible (Markdown) de cada escenario a partir de su JSON.
// Uso: node design/escape-rooms/tools/render.mjs [ER01 ...]   → design/escape-rooms/md/ERxx.md
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const CAT = { decorative: '1 Decorativo', examine: '2 Examinar', collect: '3 Recoger', use: '4 Usar', combine: '5 Combinar', activate: '6 Activar',
  locked: '7 Bloqueado', coop: '8 Mecanismo cooperativo', narrative: '9 Elemento narrativo', exit: '10 Objeto de salida' };
const DIFF = { easy: 'Fácil', medium: 'Media', hard: 'Difícil' };
const MODEL = { M1: 'M1 Información dividida', M2: 'M2 Observación y ejecución', M3: 'M3 Acciones simultáneas', M4: 'M4 Perspectivas complementarias',
  M5: 'M5 Objetos complementarios', M6: 'M6 Decisión compartida' };
const WHO = { A: 'Jugador A', B: 'Jugador B', AB: 'Ambos', none: 'Nadie' };
const TESTCAT = ['', 'Inicio', 'Pistas obligatorias', 'Resolución correcta', 'Rechazo de incorrectas', 'Acciones prematuras', 'Validación cooperativa',
  'Simultaneidad', 'Desbloqueos duplicados', 'Pausa y reanudación', 'Reinicio', 'Final exitoso', 'Errores de secuencia', 'Desconexión', 'Accesibilidad',
  'Rutas sin salida'];

const cell = (v) => String(v ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const table = (head, rows) => `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.map(cell).join(' | ')} |`).join('\n')}\n`;
const pos = (p) => (p ? `(${p.x}, ${p.y}, ${p.z})` : '—');
const val = (v) => (Array.isArray(v) ? v.join(' · ') : typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v));
const list = (a) => (a && a.length ? a.join(', ') : '—');
const mid = (id) => id.replace(/[^A-Za-z0-9_]/g, '_');

export function render(s) {
  const out = [];
  const w = (x = '') => out.push(x);
  const O = new Map(s.objects.map((o) => [o.object_id, o]));
  const C = new Map(s.clues.map((c) => [c.clue_id, c]));
  const P = new Map(s.puzzles.map((p) => [p.puzzle_id, p]));
  const R = new Map(s.rooms.map((r) => [r.room_id, r]));
  const AU = new Map(s.audio_cues.map((a) => [a.audio_id, a]));
  const mains = s.puzzles.filter((p) => p.main);
  const label = (id) => (O.get(id)?.name || C.get(id)?.reveals || P.get(id)?.name || R.get(id)?.name || s.events.find((e) => e.event_id === id)?.action || id);

  w(`# ${s.scenario_id} · ${s.title}`);
  w();
  w(s.synopsis);
  w();
  w('## A. Ficha técnica');
  w();
  w(table(['Campo', 'Valor'], [
    ['ID', s.scenario_id], ['Nombre', s.title], ['Versión', s.version], ['Género', s.genre], ['Sinopsis', s.synopsis],
    ['Objetivo principal', s.objectives.filter((o) => o.required).map((o) => `${o.objective_id} ${o.text}`).join('; ')],
    ['Objetivos secundarios', s.objectives.filter((o) => !o.required).map((o) => `${o.objective_id} ${o.text}`).join('; ') || '—'],
    ['Jugadores', `2 (A: ${s.players_data.player_a.role}; B: ${s.players_data.player_b.role})`],
    ['Duración estimada', `${s.estimated_duration_minutes} min (despertar ${s.phase_minutes.awakening}, descubrimiento ${s.phase_minutes.discovery}, complicación ${s.phase_minutes.complication}, clímax ${s.phase_minutes.climax}, escape ${s.phase_minutes.escape})`],
    ['Dificultad', DIFF[s.difficulty]], ['Zonas', s.rooms.length],
    ['Acertijos', `${mains.length} principales${s.puzzles.length > mains.length ? ` y ${s.puzzles.length - mains.length} microacertijos` : ''}`],
    ['Objetos interactivos', `${s.objects.filter((o) => o.category !== 'decorative').length} (más ${s.objects.filter((o) => o.category === 'decorative').length} decorativos)`],
    ['Finales', s.endings.length], ['Competencias', s.competencies.join(', ')],
    ['Condiciones iniciales', s.initial_conditions],
    ['Condición de victoria', `Completar ${s.win_condition.required_objectives.join(', ')}`],
    ['Condición de fallo', `${s.fail_condition.minutes} min de cuenta atrás: ${s.fail_condition.consequence}`],
    ['Condición de reinicio', s.reset_condition],
  ]));

  w('## B. Guion narrativo');
  w();
  const n = s.narrative;
  const parts = [['Introducción cinematográfica', n.intro], ['Por qué están aquí', n.reason], ['Situación inicial', n.initial_situation], ['Objetivo', n.goal],
    ['Primer descubrimiento', n.first_discovery]];
  parts.forEach(([h, t], i) => { w(`**${i + 1}. ${h}.** ${t}`); w(); });
  w('**6. Progresión de los acontecimientos.**'); w(); n.progression.forEach((t) => w(`- ${t}`)); w();
  w('**7. Obstáculos narrativos.**'); w(); n.obstacles.forEach((t) => w(`- ${t}`)); w();
  w('**8. Revelaciones.**'); w(); n.revelations.forEach((t) => w(`- ${t}`)); w();
  [['9. Clímax', n.climax], ['10. Escena de escape', n.escape_scene], ['11. Epílogo', n.epilogue]].forEach(([h, t]) => { w(`**${h}.** ${t}`); w(); });
  w('### Diálogos y textos del sistema');
  w();
  w('Cada línea es un subtítulo. Las líneas de canal `document` quedan además guardadas en el registro de pistas.');
  w();
  w(table(['ID', 'Quién', 'Texto', 'Cuándo', 'Para', 'Canal'], s.dialogues.map((d) => [d.dialogue_id, d.speaker, d.text, d.trigger, WHO[d.audience], d.channel])));

  w('## C. Escenografía y planos');
  w();
  w('Coordenadas en metros con origen en la esquina suroeste del suelo de cada zona: `x` hacia el este, `y` hacia arriba, `z` hacia el norte.');
  w();
  for (const r of s.rooms) {
    w(`### ${r.room_id} · ${r.name}`);
    w();
    w(r.description);
    w();
    w(`**Medidas:** ${r.dimensions_m.w} × ${r.dimensions_m.d} m, altura ${r.dimensions_m.h} m. **Acceso:** A ${r.access.A ? 'sí' : 'no'}, B ${r.access.B ? 'sí' : 'no'}. **Se abre:** ${r.unlocked_when.length ? r.unlocked_when.join(' + ') : 'desde el inicio'}.`);
    w();
    w(`**Qué ve cada jugador.** A: ${r.view.A}. B: ${r.view.B}.`);
    w();
    w(`**Distribución.** ${r.layout}`);
    w();
    const rows = [];
    for (const d of r.doors) rows.push([d.door_id, d.to === 'EXIT' ? 'Puerta de salida' : `Puerta a ${R.get(d.to)?.name || d.to}`, `pared ${d.wall}`, pos(d.position), d.opens_when.length ? `Se abre con ${d.opens_when.join(' + ')}` : 'Abierta']);
    for (const x of r.windows) rows.push(['—', 'Ventana', `pared ${x.wall}`, pos(x.position), x.note]);
    for (const id of r.objects) { const o = O.get(id); rows.push([id, o.name, CAT[o.category], pos(o.position), o.visual]); }
    w(table(['ID', 'Elemento', 'Tipo o pared', 'Posición (x, y, z)', 'Notas'], rows));
    w(table(['Luz', 'Tipo', 'Posición', 'Color', 'Intensidad', 'Uso'], r.lighting.map((l) => [l.light_id, l.type, pos(l.position), l.color, l.intensity, l.note])));
    w(`**Sonido ambiente:** ${AU.get(r.ambient_sound)?.description || '—'}. **Música:** ${AU.get(r.music)?.description || '—'}.`);
    w();
    if (r.dynamic_changes.length) { w('**Cambios dinámicos:**'); w(); r.dynamic_changes.forEach((c) => w(`- ${c.event}: ${c.change}`)); w(); }
    w(`**Para el motor:** ${r.engine_notes}`);
    w();
  }

  w('## D. Inventario de objetos');
  w();
  w(table(['object_id', 'Nombre', 'Descripción visual', 'Zona', 'Posición', 'Tipo', 'Estado inicial', 'Acción', 'Activación', 'Resultado', 'Pista', 'Acertijo', 'Jugador', 'Estado final'],
    s.objects.map((o) => [o.object_id, o.name, o.visual, o.room, pos(o.position), CAT[o.category], o.initial_state, o.action, list(o.activation_condition), o.result, o.clue || '—', o.puzzle || '—', WHO[o.authorized], o.final_state])));

  w('## E. Pistas');
  w();
  w(table(['clue_id', 'Contenido exacto', 'Alternativa accesible', 'Ubicación', 'Descubrimiento', 'Quién', 'Acertijo', 'Revela', 'Depende de', 'Se habilita', 'Nivel', 'Descubierta cuando'],
    s.clues.map((c) => [c.clue_id, c.content, c.alt_text, `${c.location} ${O.get(c.location)?.name || ''}`, c.discovery, WHO[c.player], c.puzzle, c.reveals, list(c.depends_on), list(c.enabled_when), c.help_level, list(c.discovered_when)])));
  w('### Ayudas progresivas por acertijo');
  w();
  w(table(['Acertijo', 'Nivel 1: dónde mirar', 'Nivel 2: principio', 'Nivel 3: ayuda concreta'], s.puzzles.map((p) => [`${p.puzzle_id} ${p.name}`, ...p.hints])));

  w('## F. Acertijos');
  w();
  for (const p of s.puzzles) {
    const v = p.validation;
    w(`### ${p.puzzle_id} · ${p.name}${p.main ? '' : ' (microacertijo)'}`);
    w();
    const a = p.answer;
    const ans = a.type === 'decision' ? `Decisión compartida: ${a.options.map((o) => `${o.key} (${o.label}: ${o.consequence})`).join('; ')}` : `${val(a.value)} (${a.type}; ${a.normalize})`;
    const fields = [
      ['ID', p.puzzle_id], ['Nombre', p.name], ['Narrativa', p.narrative], ['Objetivo', p.objective], ['Situación', p.situation],
      ['Elementos necesarios', p.required_objects.map((o) => `${o} ${O.get(o)?.name}`).join(', ') || '—'],
      ['Información de A', p.info_a], ['Información de B', p.info_b], ['Qué deben comunicarse', p.must_communicate],
      ['Reglas', p.rules.join(' ')], ['Pasos', p.steps.map((x, i) => `(${i + 1}) ${x}`).join(' ')], ['Respuesta correcta', ans],
      ['Respuestas incorrectas posibles', p.wrong_answers.map((x) => `${val(x.value)}: ${x.why}`).join('; ') || 'No aplica: cualquier opción acordada es válida'],
      ['Validación', `${v.check} Introduce: ${v.input_by.map((x) => WHO[x]).join(' y ')}. Pistas exigidas: ${list(v.requires_clues)}.${v.coop_model ? ` Modelo ${MODEL[v.coop_model]}${v.window_ms ? `, ventana ${v.window_ms} ms` : ''}.` : ''}`],
      ['Al resolverlo', `${p.on_solve.message} Eventos: ${list(p.on_solve.events)}. Estado: ${list(p.on_solve.sets)}.`],
      ['Al fallar', `${p.on_fail.message} ${p.on_fail.effect}`],
      ['Intentos', `${p.attempts.max ?? 'ilimitados'}; ${p.attempts.cooldown_after > 0 ? `pausa de ${p.attempts.cooldown_s} s cada ${p.attempts.cooldown_after} fallos seguidos` : 'sin pausa: no hay estado de fallo'}`],
      ['Sistema de pistas', `Pistas ${list(v.requires_clues)} y tres niveles de ayuda (tabla de ayudas).`],
      ['Tiempo estimado', `${p.estimated_minutes} min`], ['Desbloquea', list(p.unlocks)], ['Reinicio', p.reset_condition],
      ['Casos límite', p.edge_cases.join(' ')],
    ];
    fields.forEach(([k, t], i) => w(`${i + 1}. **${k}.** ${t}`));
    w();
    w(`**Requisitos previos:** ${list(p.prerequisites)}. **Zona:** ${p.room}.`);
    w();
    w(`**Por qué la solución es válida:** ${p.solution_proof}`);
    w();
  }

  w('## G. Dependencia real entre los jugadores');
  w();
  for (const m of s.coop_mechanisms) {
    w(`### ${m.mechanism_id} · ${m.title} (${MODEL[m.model]}, ${m.puzzle})`);
    w();
    [['Por qué no lo resuelve una sola persona', m.why_not_solo], ['Qué tiene A', m.info_a], ['Qué tiene B', m.info_b], ['Qué comunica A', m.communicate_a],
      ['Qué comunica B', m.communicate_b], ['Qué hace A', m.action_a], ['Qué hace B', m.action_b], ['Cómo se valida la cooperación', m.validation],
      ['Si se comunican mal', m.miscommunication], ['Para que nadie domine', m.anti_domination], ['Con distinta habilidad', m.skill_gap]]
      .forEach(([k, t]) => w(`- **${k}.** ${t}`));
    w();
  }

  w('## Mapa de dependencias');
  w();
  w('Las flechas continuas son obligatorias y las discontinuas opcionales; la etiqueta es la condición para avanzar.');
  w();
  w('```mermaid');
  w('flowchart TD');
  const nodes = new Set();
  for (const d of s.dependencies) { nodes.add(d.from); nodes.add(d.to); }
  for (const id of nodes) {
    const shape = id === 'START' ? `([Inicio])` : id === 'ESCAPE' ? `([Escape])` : P.has(id) ? `{{"${id} ${cell(P.get(id).name)}"}}` : C.has(id) ? `["${id} ${cell(C.get(id).reveals).replace(/"/g, "'").slice(0, 40)}"]` : R.has(id) ? `[/"${id} ${cell(R.get(id).name)}"/]` : `["${id} ${cell(label(id)).slice(0, 40)}"]`;
    w(`  ${mid(id)}${shape.replace(/"/g, '"')}`);
  }
  for (const d of s.dependencies) w(`  ${mid(d.from)} ${d.type === 'required' ? '-->' : '-.->'}|"${cell(d.condition).replace(/"/g, "'").slice(0, 60)}"| ${mid(d.to)}`);
  w('```');
  w();
  w(table(['Desde', 'Hacia', 'Condición', 'Tipo'], s.dependencies.map((d) => [d.from, d.to, d.condition, d.type === 'required' ? 'obligatoria' : 'opcional'])));

  w('## Máquina de estados del escenario');
  w();
  w('Usa la máquina común del documento maestro; estas son las transiciones propias de este escenario.');
  w();
  w('```mermaid');
  w('stateDiagram-v2');
  w('  [*] --> INITIALIZING');
  w('  INITIALIZING --> INTRO: escenario cargado');
  for (const t of s.state_transitions) w(`  ${t.from === 'ANY' ? 'EXPLORATION' : t.from} --> ${t.to}: ${cell(t.event).replace(/:/g, ' ')}`);
  w('  COMPLETED --> [*]');
  w('```');
  w();
  w(table(['Origen', 'Evento', 'Condiciones', 'Validaciones', 'Efectos', 'Destino', 'Mensaje'], s.state_transitions.map((t) => [t.from, t.event, t.conditions, t.validations, t.effects, t.to, t.message])));

  w('## Escenografía dinámica y eventos');
  w();
  w(table(['ID', 'Se activa con', 'Estado previo', 'Acción', 'Afecta', 'Duración', 'Sonido', 'Efecto visual', 'Termina cuando', 'Si se interrumpe', 'Repetición'],
    s.events.map((x) => [x.event_id, list(x.trigger), x.prev_state, x.action, list(x.affects), `${x.duration_s} s`, x.audio ? `${x.audio} ${AU.get(x.audio)?.description}` : '—',
      x.visual ? `${x.visual} ${s.visual_effects.find((v) => v.vfx_id === x.visual)?.description}` : '—', x.end_condition, x.on_interrupt, x.repeat])));
  w('### Audio');
  w();
  w(table(['ID', 'Tipo', 'Descripción', 'Bucle', 'Subtítulo'], s.audio_cues.map((a) => [a.audio_id, a.type, a.description, a.loop ? 'sí' : 'no', a.subtitle || '—'])));
  w('### Efectos visuales');
  w();
  w(table(['ID', 'Descripción', 'Alternativa con movimiento reducido'], s.visual_effects.map((v) => [v.vfx_id, v.description, v.reduced_motion_alt])));

  w('## Finales y rejugabilidad');
  w();
  w(table(['ID', 'Final', 'Tipo', 'Condición', 'Texto'], s.endings.map((x) => [x.ending_id, x.name, x.type, list(x.condition), x.text])));
  w('El resumen final muestra objetivos completados, acertijos resueltos con quién aportó cada parte, duración total, ayudas usadas por nivel y la lista de mecanismos cooperativos superados. No califica a los jugadores ni a la pareja.');
  w();
  w('**Recomendaciones para una segunda partida:**');
  w();
  s.replay_tips.forEach((t) => w(`- ${t}`));
  w();
  w(table(['Variante', 'Qué cambia', 'Pistas que cambian', 'Respuestas que cambian', 'Ayudas y textos de la variante'], s.variants.map((v) => [v.variant_id, v.description,
    Object.entries(v.overrides.clues || {}).map(([k, x]) => `${k}: ${x.content}`).join(' / ') || '—',
    Object.entries(v.overrides.puzzles || {}).filter(([, x]) => x.answer).map(([k, x]) => `${k}: ${val(x.answer.value)}`).join(' / ') || '—',
    [...Object.entries(v.overrides.puzzles || {}).map(([k, x]) => [x.hints && `${k} ayudas: ${x.hints.join(' · ')}`, x.rules && `${k} reglas: ${x.rules.join(' ')}`, x.on_solve && `${k} al resolver: ${x.on_solve.message}`].filter(Boolean).join(' / ')),
      ...Object.entries(v.overrides.dialogues || {}).map(([k, x]) => `${k}: ${x.text}`)].filter(Boolean).join(' / ') || '—'])));

  w('## Balance de dificultad');
  w();
  w(table(['Fase', 'Minutos'], [['Despertar', s.phase_minutes.awakening], ['Descubrimiento', s.phase_minutes.discovery], ['Complicación', s.phase_minutes.complication],
    ['Clímax', s.phase_minutes.climax], ['Escape y epílogo', s.phase_minutes.escape], ['Total', s.estimated_duration_minutes]]));
  w(`**Modo fácil:** ${s.difficulty_tuning.easy.join(' ')}`);
  w();
  w(`**Modo difícil:** ${s.difficulty_tuning.hard.join(' ')}`);
  w();

  w('## Reinicio');
  w();
  w(table(['Alcance', 'Objetivo', 'Restaura', 'Conserva'], s.reset_rules.map((r) => [r.scope, r.target, r.restores, r.keeps])));

  w('## Plan de pruebas');
  w();
  w(table(['ID', 'Categoría', 'Prueba', 'Pasos', 'Resultado esperado', 'Cubre'], s.test_cases.map((t) => [t.test_id, `${t.category} ${TESTCAT[t.category]}`, t.title, t.steps.join(' → '), t.expected, list(t.covers)])));
  w('### Trazabilidad');
  w();
  const trace = s.puzzles.map((p) => {
    const req = s.objectives.find((o) => o.completed_when.includes(`${p.puzzle_id}_SOLVED`));
    return [req ? `${req.objective_id} ${req.text}` : `Progreso hacia ${list(p.unlocks)}`, `${p.puzzle_id} ${p.name}`, list(p.on_solve.events), list(p.required_objects),
      list(s.test_cases.filter((t) => t.covers.includes(p.puzzle_id)).map((t) => t.test_id))];
  });
  for (const m of s.coop_mechanisms) trace.push([`Cooperación ${MODEL[m.model]}`, m.puzzle, list(P.get(m.puzzle)?.on_solve.events), list(P.get(m.puzzle)?.required_objects),
    list(s.test_cases.filter((t) => t.covers.includes(m.mechanism_id)).map((t) => t.test_id))]);
  w(table(['Requisito', 'Acertijo', 'Eventos', 'Objetos', 'Pruebas'], trace));

  w('## Recursos que hay que producir');
  w();
  const rs = s.resources;
  w(table(['Tipo', 'Lista'], [['Modelos 3D', rs.models_3d.join(', ')], ['Texturas', rs.textures.join(', ')], ['Sonidos', rs.sounds.join(', ')], ['Animaciones', rs.animations.join(', ')],
    ['Interfaz', rs.ui.join(', ')], ['Efectos', rs.vfx.join(', ')], ['Diálogos', `${rs.dialogue_lines} líneas subtituladas`], ['Mecanismos', rs.mechanisms.join(', ')]]));
  w(`Especificación programable: \`design/escape-rooms/${s.scenario_id}.json\`.`);
  return out.join('\n');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const want = process.argv.slice(2);
  mkdirSync(join(DIR, 'md'), { recursive: true });
  for (const f of readdirSync(DIR).filter((f) => /^ER\d{2}\.json$/.test(f)).filter((f) => !want.length || want.includes(f.slice(0, 4)))) {
    const s = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
    const md = render(s);
    writeFileSync(join(DIR, 'md', f.replace('.json', '.md')), md + '\n');
    console.log(`${f} → md/${f.replace('.json', '.md')} (${md.length} caracteres)`);
  }
}
