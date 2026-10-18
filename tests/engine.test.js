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

console.log(fails ? `${fails} de ${n} pruebas fallaron` : `OK ${n} pruebas`);
process.exit(fails ? 1 : 0);
