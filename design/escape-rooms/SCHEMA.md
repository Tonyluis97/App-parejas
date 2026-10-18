# Esquema de datos de los escenarios (ERxx.json)

Cada escenario es un único archivo JSON válido, sin comentarios, en `design/escape-rooms/ERxx.json`.
`node design/escape-rooms/tools/validate.mjs` comprueba sintaxis, referencias, reglas de cooperación y que exista una ruta de victoria.
`node design/escape-rooms/tools/render.mjs ERxx` genera el guion legible en `design/escape-rooms/md/ERxx.md`.

Idioma: todo el texto visible está en español neutro. Las claves y los valores de enumeración están en inglés.

## Convenciones

- Coordenadas en metros. Origen en la esquina suroeste del suelo de cada zona; `x` crece hacia el este, `z` hacia el norte, `y` hacia arriba. Paredes: `north` (z = profundidad), `south` (z = 0), `east` (x = anchura), `west` (x = 0).
- IDs únicos dentro del escenario: `ROOM01`, `O01`, `C01`, `P01`, `M01` (mecanismos), `E01` (eventos), `D01` (diálogos), `A01` (audio), `V01` (efectos visuales), `END01`, `VAR01`, `T01`, `OBJ01` (objetivos), `L01` (luces), `DOOR01`.
- Jugadores: `"A"`, `"B"` o `"AB"` (ambos).

## Tokens de condición

Todas las condiciones (`prerequisites`, `enabled_when`, `discovered_when`, `when`, `trigger`, `unlocked_when`, `exit_conditions`, `completed_when`, `condition`) son listas de tokens que deben cumplirse todos a la vez:

| Token | Se cumple cuando |
|---|---|
| `START` | La partida pasó de INTRO a EXPLORATION |
| `Pxx_SOLVED` | El acertijo Pxx está resuelto |
| `Pxx_OPT_<KEY>` | En el acertijo de decisión Pxx los dos votaron la opción `<KEY>` |
| `Cxx_DISCOVERED` | La pista Cxx está en el registro de quien puede verla |
| `Oxx_<STATE>` | El objeto Oxx está en el estado `<STATE>` (en mayúsculas, uno de sus `states`) |
| `Exx_DONE` | El evento Exx terminó |
| `ROOMxx_UNLOCKED` | La zona ROOMxx está accesible |
| `IDLE_<s>` | Pasaron `<s>` segundos sin progreso (solo para eventos de ayuda, nunca para progreso obligatorio) |
| `TIMER_EXPIRED` | Cuenta atrás a cero (solo en `fail_condition` y eventos) |

## Claves de primer nivel (todas obligatorias)

```
scenario_id, title, version, players (2), genre, synopsis, difficulty ("easy"|"medium"|"hard"),
estimated_duration_minutes, phase_minutes {awakening, discovery, complication, climax, escape} (suman la duración),
competencies [texto], initial_conditions (texto), initial_state ("INITIALIZING"),
objectives [{objective_id, text, required (bool), completed_when [tokens]}],
win_condition {type: "all_required_objectives_completed", required_objectives [OBJ ids]},
fail_condition {type: "timer_expired", minutes, consequence (texto)},
reset_condition (texto),
narrative {intro, reason, initial_situation, goal, first_discovery, progression [texto], obstacles [texto],
           revelations [texto], climax, escape_scene, epilogue},
rooms [], players_data {player_a, player_b}, objects [], clues [], puzzles [], coop_mechanisms [],
dependencies [], state_transitions [], events [], dialogues [], audio_cues [], visual_effects [],
endings [], replay_tips [texto], variants [], difficulty_tuning {easy [texto], hard [texto]},
reset_rules [], test_cases [], resources {}
```

### rooms[]
```
{ room_id, name, description, dimensions_m {w, d, h}, layout (texto del plano),
  access {A: bool, B: bool}            // false = ese jugador no puede entrar ni tocar nada ahí
  view {A, B}                          // qué ve cada jugador de esta zona (texto)
  unlocked_when [tokens]               // [] = accesible desde el inicio
  doors [{door_id, wall, position {x,y,z}, to (ROOM id | "EXIT"), opens_when [tokens]}],
  windows [{wall, position {x,y,z}, note}],
  lighting [{light_id, type, position {x,y,z}, color (hex), intensity, note}],
  ambient_sound (A id), music (A id),
  dynamic_changes [{event (E id), change (texto)}],
  objects [O ids], puzzles [P ids], exit_conditions [tokens], engine_notes (texto) }
```

### players_data.player_a / player_b
```
{ role, view (qué ve y qué no), initial_location (ROOM id), initial_clues [C ids], initial_inventory [O ids] }
```

### objects[]
```
{ object_id, name, visual, room, position {x,y,z},
  category: "decorative"|"examine"|"collect"|"use"|"combine"|"activate"|"locked"|"coop"|"narrative"|"exit",
  states [mayúsculas, el primero es el inicial], initial_state, action (texto, "none" si decorativo),
  activation_condition [tokens], result (texto),
  transitions [{to (estado), when [tokens], by ("A"|"B"|"AB"|"system")}],
  clue (C id | null), puzzle (P id | null), authorized ("A"|"B"|"AB"|"none"), final_state,
  interact_radius_m }
```
Un objeto decorativo tiene `action: "none"`, `authorized: "none"`, sin pista, sin acertijo y sin transiciones.
El estado `HIDDEN` significa que aún no se ve; mientras un objeto requerido por un acertijo esté `HIDDEN` el acertijo no se puede validar.

### clues[]
```
{ clue_id, content (texto exacto que se ve u oye), alt_text (alternativa accesible equivalente),
  location (O id), discovery (cómo se descubre), player ("A"|"B"|"AB"), puzzle (P id),
  reveals (qué información aporta), depends_on [C ids], enabled_when [tokens],
  help_level (0 = pista de juego; 1–3 = ayuda contextual que el sistema ofrece), discovered_when [tokens] }
```

### puzzles[] (los 22 campos más los de control)
```
{ puzzle_id, name, narrative, objective, situation, required_objects [O ids],
  info_a, info_b, must_communicate, rules [texto], steps [texto],
  answer {type: "code"|"sequence"|"set"|"simultaneous"|"decision"|"combine"|"position", value, normalize (texto)}
     // decision: value = null y options [{key, label, consequence}]
  wrong_answers [{value, why}], validation {input_by ["A"|"B"], requires_clues [C ids], coop_model ("M1".."M6"|null),
     mechanism_id (M id | null), window_ms (solo M3), check (texto de la regla exacta)},
  on_solve {message, events [E ids], sets [tokens]}, on_fail {message, effect},
  attempts {max (n | null), cooldown_after, cooldown_s}, hints [nivel 1, nivel 2, nivel 3],
  estimated_minutes, unlocks [P ids], reset_condition, edge_cases [texto],
  room (ROOM id), main (bool), prerequisites [tokens], solution_proof (por qué la respuesta es la única válida y por qué fallan las alternativas) }
```

### coop_mechanisms[]
```
{ mechanism_id, model ("M1".."M6"), puzzle (P id), title, why_not_solo, info_a, info_b, communicate_a, communicate_b,
  action_a, action_b, validation, miscommunication, anti_domination, skill_gap }
```

### dependencies[]
`{ from, to, condition, type ("required"|"optional") }`. `from` y `to` son IDs de pista, acertijo, objeto, evento o zona, o `START` / `ESCAPE`.

### state_transitions[]
`{ from, event, conditions, validations, effects, to, message }` con los estados comunes (INITIALIZING, INTRO, EXPLORATION, PUZZLE_ACTIVE, WAITING_FOR_PARTNER, VALIDATING, PUZZLE_SOLVED, ROOM_UNLOCKED, FINAL_SEQUENCE, COMPLETED, FAILED, PAUSED, RESETTING).

### events[]
`{ event_id, trigger [tokens], prev_state, action, affects [IDs], duration_s, audio (A id | null), visual (V id | null), end_condition, on_interrupt, repeat }`

### dialogues[]
`{ dialogue_id, speaker, text, trigger (E id, P id o token), audience ("A"|"B"|"AB"), channel ("subtitle"|"popup"|"audio_subtitled"|"document") }`

### audio_cues[] y visual_effects[]
`{ audio_id, type ("ambient"|"music"|"sfx"|"voice"), description, loop (bool), subtitle (texto | null) }`
`{ vfx_id, description, reduced_motion_alt }`

### endings[]
`{ ending_id, name, type ("main"|"alternative"|"decision"), condition [tokens], text }`

### variants[]
`{ variant_id, description, overrides {clues {C id: {content, alt_text}}, puzzles {P id: {answer, hints, wrong_answers, rules?, steps?, on_solve?, solution_proof?}}, dialogues {D id: {text}}} }` (al menos 2). Cada variante cambia pista y respuesta a la vez para que siga siendo resoluble; si cambia una respuesta, trae también sus 3 ayudas y sus respuestas incorrectas, y sobrescribe cualquier regla, mensaje o diálogo que nombre la respuesta de la base. El motor aplica cada clave sobrescrita en lugar de la de la base.

### reset_rules[]
`{ scope ("puzzle"|"room"|"full"), target (ID o "ALL"), restores (texto), keeps (texto) }`

### test_cases[]
`{ test_id, category (1–15, ver plan de pruebas), title, steps [texto], expected, covers [IDs] }`

Categorías: 1 inicio, 2 pistas obligatorias, 3 resolución correcta, 4 rechazo de incorrectas, 5 acciones prematuras, 6 validación cooperativa, 7 simultaneidad dentro y fuera de ventana, 8 desbloqueos duplicados, 9 pausa y reanudación, 10 reinicio completo, 11 final exitoso, 12 errores de secuencia, 13 desconexión, 14 accesibilidad de pistas esenciales, 15 ausencia de rutas sin salida.

### resources
`{ models_3d [], textures [], sounds [], animations [], ui [], vfx [], dialogue_lines (n), mechanisms [] }`
