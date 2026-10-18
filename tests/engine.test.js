const E = require('../src/engine.js');
let fails = 0, n = 0;
function eq(name, got, want) {
  n++;
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { fails++; console.log('FALLA', name, 'obtenido', g, 'esperado', w); }
}

eq('días entre', E.daysBetween('2026-01-01', '2026-01-31'), 30);
eq('días juntos incluye inicio', E.daysTogether('2026-10-18', '2026-10-18'), 1);
eq('días juntos año bisiesto', E.daysTogether('2024-02-28', '2024-03-01'), 3);
eq('días juntos futuro', E.daysTogether('2027-01-01', '2026-10-18'), null);
eq('fecha inválida', E.daysBetween('hola', '2026-01-01'), null);
eq('distancia Lima-Madrid', E.distanceKm({ lat: -12.0464, lng: -77.0428 }, { lat: 40.4168, lng: -3.7038 }), 9509);
eq('distancia mismo punto', E.distanceKm({ lat: 1, lng: 1 }, { lat: 1, lng: 1 }), 0);
eq('distancia sin datos', E.distanceKm(null, { lat: 1, lng: 1 }), null);
eq('formato km', E.formatKm(0), 'menos de 1 km');
eq('formato sin dato', E.formatKm(null), '—');
eq('hoy en zona', E.today('America/Lima', Date.UTC(2026, 9, 18, 3, 0)), '2026-10-17');
eq('hoy en Madrid', E.today('Europe/Madrid', Date.UTC(2026, 9, 18, 3, 0)), '2026-10-18');
eq('hora local', E.clock('UTC', Date.UTC(2026, 9, 18, 9, 5)), '09:05');
eq('código válido', E.validCode(E.newCode()), true);
eq('código inválido', E.validCode('12a456'), false);
eq('pregunta igual para ambos', E.questionFor('2026-10-18'), E.questionFor('2026-10-18'));
eq('pregunta cambia', E.questionFor('2026-10-18') !== E.questionFor('2026-10-19'), true);
eq('fusión gana u mayor', E.mergeRecords({ a: { u: 1, t: 'x' } }, { a: { u: 2, t: 'y' }, b: { u: 1 } }), { a: { u: 2, t: 'y' }, b: { u: 1 } });

// Escape room
let r = E.escapeTry({}, 'chest', '2 7 1 4');
eq('cofre correcto', r.ok, true);
eq('cofre incorrecto', E.escapeTry({}, 'chest', '1234').ok, false);
eq('panel sin cofre', E.escapeTry({}, 'panel', ['rojo', 'verde', 'azul', 'amarillo']).ok, false);
let s = r.state;
r = E.escapeTry(s, 'panel', ['Rojo', 'verde', 'azul', 'amarillo']); eq('panel correcto', r.ok, true); s = r.state;
eq('panel orden malo', E.escapeTry(s, 'panel', ['verde', 'rojo', 'azul', 'amarillo']).ok, false);
r = E.escapeTry(s, 'doorB', ['sol', 'corazon', 'llave']); eq('puerta B con tilde opcional', r.ok, true); s = r.state;
eq('no ganó aún', E.escapeWon(s), false);
r = E.escapeTry(s, 'doorA', ['luna', 'estrella', 'corazón']); eq('puerta A', r.ok, true); s = r.state;
eq('ganaron', E.escapeWon(s), true);
eq('progreso', E.escapeProgress(s), 4);
eq('no muta', E.escapeProgress({}), 0);
eq('mmss', E.mmss(125000), '02:05');

// Fechas importantes
eq('próximo aniversario este año', E.nextOccurrence('2025-12-24', '2026-10-18', true), '2026-12-24');
eq('próximo aniversario el año siguiente', E.nextOccurrence('2025-02-14', '2026-10-18', true), '2027-02-14');
eq('hoy cuenta como próximo', E.nextOccurrence('2020-10-18', '2026-10-18', true), '2026-10-18');
eq('29 feb en año no bisiesto', E.nextOccurrence('2024-02-29', '2026-10-18', true), '2027-02-28');
eq('fecha única', E.nextOccurrence('2026-12-01', '2026-10-18', false), '2026-12-01');
eq('años cumplidos', E.yearsAt('2025-02-14', '2027-02-14'), 2);
eq('sumar días cruza mes', E.addDays('2026-10-31', 1), '2026-11-01');
// Racha
const G = (day, from) => ({ day, from });
eq('racha 3', E.streak([G('2026-10-16', 'a'), G('2026-10-16', 'b'), G('2026-10-17', 'a'), G('2026-10-17', 'b'), G('2026-10-18', 'a'), G('2026-10-18', 'b')], ['a', 'b'], '2026-10-18'), 3);
eq('racha sigue si hoy falta uno', E.streak([G('2026-10-17', 'a'), G('2026-10-17', 'b'), G('2026-10-18', 'a')], ['a', 'b'], '2026-10-18'), 1);
eq('racha rota', E.streak([G('2026-10-15', 'a'), G('2026-10-15', 'b')], ['a', 'b'], '2026-10-18'), 0);
eq('racha sin pareja', E.streak([], ['a'], '2026-10-18'), 0);
// Tres en raya
eq('gana fila', E.tttWinner(['X', 'X', 'X', '', 'O', 'O', '', '', '']), 'X');
eq('gana diagonal', E.tttWinner(['O', 'X', '', 'X', 'O', '', '', '', 'O']), 'O');
eq('empate', E.tttWinner(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']), 'empate');
eq('sigue', E.tttWinner(['X', '', '', '', '', '', '', '', '']), null);
eq('jugada válida', E.tttMove(['', '', '', '', '', '', '', '', ''], 4, 'X')[4], 'X');
eq('casilla ocupada', E.tttMove(['X', '', '', '', '', '', '', '', ''], 0, 'O'), null);
eq('partida terminada', E.tttMove(['X', 'X', 'X', '', '', '', '', '', ''], 5, 'O'), null);
const seq = [0.45, 0.45, 0.9]; let k = 0;
eq('elige otro distinto', E.pickOther(5, 2, () => seq[k++]), 4);
eq('elige con uno solo', E.pickOther(1, 0), 0);
eq('contenido juegos', E.TRUTHS.length >= 20 && E.DARES.length >= 20 && E.NEVER.length >= 15, true);

// Escape 3D
eq('césar cifra', E.caesar('Recuerdo', 3), 'UHFXHUGR');
eq('césar descifra', E.caesar('UHFXHUGR', -3), 'RECUERDO');
eq('pista de cifrado coincide', E.caesar(E.ESC3.levels[1].clues.B.cipher, -E.ESC3.levels[1].clues.A.shift), E.ESC3.levels[1].B.answer);
eq('morse', E.morse('beso'), ['-...', '.', '...', '---']);
eq('pista morse coincide', E.ESC3.levels[2].clues.A.morse, E.ESC3.levels[2].B.answer);
eq('pista reloj coincide', E.ESC3.levels[0].clues.B.clock.replace(':', ''), E.ESC3.levels[0].A.answer);
eq('pista cuadro coincide', E.ESC3.levels[0].clues.A.lamps, E.ESC3.levels[0].B.answer);
eq('pista dibujo coincide', E.ESC3.levels[2].clues.B.pattern, E.ESC3.levels[2].A.answer);
eq('caja fuerte', E.esc3Check(0, 'A', '10 25'), true);
eq('caja fuerte mala', E.esc3Check(0, 'A', '2510'), false);
eq('interruptores', E.esc3Check(0, 'B', [true, false, true, true]), true);
eq('interruptores malos', E.esc3Check(0, 'B', [1, 1, 1, 1]), false);
eq('palabra con tilde y minúsculas', E.esc3Check(1, 'A', 'reloj '), true);
eq('palabra mala', E.esc3Check(1, 'B', 'RECUERDOS'), false);
eq('baldosas', E.esc3Check(2, 'A', [1, 0, 1, 0, 1, 0, 1, 0, 1]), true);
let e3 = { level: 0, levelAt: 1000, startedAt: 1000, A: false, B: false };
e3 = E.esc3Solve(e3, 'A'); eq('sala sin terminar', E.esc3LevelDone(e3), false);
e3 = E.esc3Solve(e3, 'B'); eq('sala terminada', E.esc3LevelDone(e3), true);
e3 = E.esc3Advance(e3, 5000); eq('pasa a sala 2', [e3.level, e3.A, e3.B, e3.levelAt], [1, false, false, 5000]);
eq('tiempo restante', E.esc3Remaining(e3, 65000), 10 * 60000 - 60000);
e3 = E.esc3Fail(E.esc3Solve(e3, 'A'), 9000); eq('fallo reinicia sala', [e3.level, e3.A, e3.fails, e3.levelAt], [1, false, 1, 9000]);
e3 = E.esc3Advance(Object.assign(e3, { level: 2 }), 20000); eq('gana al final', e3.wonAt, 20000);

console.log(fails ? `${fails} de ${n} pruebas fallaron` : `OK ${n} pruebas`);
process.exit(fails ? 1 : 0);
