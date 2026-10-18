// Prueba del escape room 3D "Sin salida" en modo demo: dos pestañas = dos móviles
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const exe = fs.readdirSync('/opt/pw-browsers').filter(d => d.startsWith('chromium-')).map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find(fs.existsSync);
const root = path.join(__dirname, '..', 'web');
const shots = process.argv[2] || '/tmp';
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); r.end(d); } });
}).listen(0);
let fails = 0;
const ok = (n, c) => { if (!c) { fails++; console.log('FALLA', n); } else console.log('ok', n); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const url = `http://localhost:${srv.address().port}/`;
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 400, height: 820 }, hasTouch: true, isMobile: true });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const errs = [];
  const A = await ctx.newPage(), B = await ctx.newPage();
  for (const [p, n] of [[A, 'A'], [B, 'B']]) { p.on('pageerror', e => errs.push(n + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errs.push(n + ' consola: ' + m.text()); }); }
  await A.goto(url); await A.evaluate(() => localStorage.clear()); await A.reload(); await B.goto(url);

  // Emparejar
  await A.fill('#wName', 'Antonny'); await A.fill('#wStart', '2025-02-14'); await A.click('button[type=submit]');
  await A.waitForSelector('.codebig'); await A.click('[data-act=enter]');
  await B.goto(await A.evaluate(() => inviteLink()));
  await B.fill('#wName', 'Ella'); await B.click('button[type=submit]'); await B.waitForSelector('.hero');

  // Lista de juegos y vestíbulo
  await A.click('[data-act=tab][data-v=games]');
  ok('juego en la lista', (await A.textContent('main')).includes('Sin salida (3D)'));
  await A.click('[data-act=tab][data-v=escape3d]');
  ok('vestíbulo', (await A.textContent('main')).includes('Tres salas cerradas'));
  await A.screenshot({ path: shots + '/e3-00-vestibulo.png' });
  await A.click('[data-act=e3New]'); await A.click('[data-act=_confirmYes]');
  await A.waitForSelector('#e3 canvas', { timeout: 20000 });
  await B.click('[data-act=tab][data-v=games]'); await B.click('[data-act=tab][data-v=escape3d]');
  await B.click('[data-act=e3Open]'); await B.waitForSelector('#e3 canvas', { timeout: 20000 });
  await wait(1500);
  ok('temporizador', /\d\d:\d\d/.test(await A.textContent('#e3Time')));
  ok('sala 1 nombre', (await A.textContent('#e3Name')).includes('Sala 1 de 3'));
  console.log('dibujo', JSON.stringify(await A.evaluate(() => Esc3D._info())));
  await A.screenshot({ path: shots + '/e3-01-espera-A.png' }); await B.screenshot({ path: shots + '/e3-02-espera-B.png' });

  // Mirar arrastrando el dedo (gira la cámara)
  const look = async (p, dx) => { await p.mouse.move(250, 400); await p.mouse.down(); await p.mouse.move(250 + dx, 400, { steps: 8 }); await p.mouse.up(); await wait(400); };
  await look(A, 160); await A.screenshot({ path: shots + '/e3-03-espera-A-mira.png' });

  const st = p => p.evaluate(() => S.couple.escape3);
  const sheet = p => p.textContent('#sheet');
  // Sala 1: A ve el cuadro de lámparas, B ve el reloj
  await A.evaluate(() => Esc3D._interact('clue'));
  ok('A ve las lámparas', (await sheet(A)).includes('encendida, apagada, encendida, encendida'));
  await A.click('#sheet [data-act=closeSheet]');
  await B.evaluate(() => Esc3D._interact('clue'));
  ok('B ve el reloj', (await sheet(B)).includes('10:25'));
  await B.click('#sheet [data-act=closeSheet]');
  await A.evaluate(() => Esc3D._interact('door'));
  ok('puerta cerrada da pista', (await sheet(A)).includes('reloj de la otra sala') && (await sheet(A)).includes('0 de 3'));
  await A.click('#sheet [data-act=closeSheet]');
  // Cerraduras en orden: la segunda está bloqueada y lo que revela la primera aún no se ve
  await A.evaluate(() => Esc3D._interact('lock2')); await wait(200);
  ok('maletín bloqueado', (await A.textContent('#e3Msg')).includes('sigue bloqueado') && !(await A.$('#sheet')));
  await A.evaluate(() => Esc3D._interact('rev1')); await wait(200);
  ok('tarjeta oculta antes de abrir', !(await A.$('#sheet')));
  // A: clave incorrecta y luego la correcta
  await A.evaluate(() => Esc3D._interact('lock'));
  for (const k of '9999') await A.click(`#sheet [data-act=lkKey][data-v="${k}"]`);
  await A.click('#sheet [data-act=lkTry]');
  ok('clave mala no abre', !(await st(A)).pA && (await A.$('#sheet .shake')) !== null);
  await A.screenshot({ path: shots + '/e3-04-teclado.png' });
  for (const k of '1025') await A.click(`#sheet [data-act=lkKey][data-v="${k}"]`);
  await A.click('#sheet [data-act=lkTry]'); await wait(600);
  ok('A abrió la caja fuerte', (await st(B)).pA === 1 && !(await st(B)).A);
  ok('aparece la tarjeta de símbolos', (await sheet(A)).includes('★ = 2'));
  await A.click('#sheet [data-act=closeSheet]');
  ok('B se entera', (await B.textContent('#e3Msg')).includes('Tu pareja abrió una cerradura'));
  await A.evaluate(() => Esc3D._view(2.6, -2.4, 0, -0.5)); await wait(1200);
  await A.screenshot({ path: shots + '/e3-04b-tarjeta.png' });

  // Ayudantes para el resto de cerraduras
  const keypad = async (p, id, code) => { await p.evaluate(id => Esc3D._interact(id), id); for (const k of code) await p.click(`#sheet [data-act=lkKey][data-v="${k}"]`); await p.click('#sheet [data-act=lkTry]'); await wait(700); };
  const toggles = async (p, id, idx) => { await p.evaluate(id => Esc3D._interact(id), id); for (const i of idx) await p.click(`#sheet [data-act=lkToggle][data-v="${i}"]`); await p.click('#sheet [data-act=lkTry]'); await wait(700); };
  const word = async (p, id, w) => { await p.evaluate(id => Esc3D._interact(id), id); await p.fill('#lkWord', w); await p.click('#sheet [data-act=lkTry]'); await wait(700); };
  const close = async p => { const c = await p.$('#sheet [data-act=closeSheet]'); if (c) await c.click(); };

  // B: interruptores
  await B.evaluate(() => Esc3D._interact('lock'));
  for (const i of [0, 2, 3]) await B.click(`#sheet [data-act=lkToggle][data-v="${i}"]`);
  await B.screenshot({ path: shots + '/e3-05-interruptores.png' });
  await B.click('#sheet [data-act=lkTry]'); await wait(700);
  ok('B ve el mensaje del espejo', (await sheet(B)).includes('sillas, revistas'));
  await close(B);
  await keypad(A, 'lock2', '434'); ok('A abre el maletín', (await sheet(A)).includes('Rojo = O')); await close(A);
  await keypad(B, 'lock2', '926'); ok('B apaga el termostato', (await sheet(B)).includes('Multiplica')); await close(B);
  await B.evaluate(() => Esc3D._view(-1.4, -2.6, 0, 0)); await wait(1200); await B.screenshot({ path: shots + '/e3-05b-termostato.png' });
  await keypad(A, 'lock3', '12'); ok('A abrió su puerta', (await st(B)).A === true && (await st(B)).level === 0);
  await word(B, 'lock3', 'amor');
  await wait(1500);
  ok('pasan a la sala 2', (await st(A)).level === 1 && (await st(B)).level === 1);
  await wait(400);
  ok('A ve sala 2', (await A.textContent('#e3Name')).includes('Sala 2 de 3'));
  await A.screenshot({ path: shots + '/e3-06-biblioteca-A.png' }); await B.screenshot({ path: shots + '/e3-07-biblioteca-B.png' });
  await look(B, -200); await B.screenshot({ path: shots + '/e3-08-biblioteca-B-mira.png' });

  // Sala 2: B oye el acertijo (A responde RELOJ); A tiene la rueda para descifrar la pared de B
  await B.evaluate(() => Esc3D._interact('gram'));
  ok('B oye el acertijo', (await sheet(B)).includes('gramófono') || (await sheet(B)).includes('voz'));
  await close(B);
  await B.evaluate(() => Esc3D._interact('clue'));
  ok('B ve la pared cifrada', (await sheet(B)).includes('UHFXHUGR'));
  await close(B);
  await word(A, 'lock', 'reloj'); ok('A recibe la ficha', (await sheet(A)).includes('♦ = 7')); await close(A);
  await word(B, 'lock', 'recuerdo'); ok('B recibe la partitura', (await sheet(B)).includes('silencio, nota')); await close(B);
  await toggles(A, 'lock2', [1, 2]); ok('A enciende las velas', (await sheet(A)).includes('cruz')); await close(A);
  await A.evaluate(() => Esc3D._view(2.8, -1.2, 0, 0.15)); await wait(1200); await A.screenshot({ path: shots + '/e3-08b-velas.png' });
  await keypad(B, 'lock2', '7184'); ok('B abre la caja', (await sheet(B)).includes('12 · 9')); await close(B);
  await word(A, 'lock3', 'LIBRO');
  await toggles(B, 'lock3', [1, 3, 4, 5, 7]);
  await wait(1500);
  ok('pasan a la sala 3', (await st(A)).level === 2);
  await A.screenshot({ path: shots + '/e3-09-cabana-A.png' }); await B.screenshot({ path: shots + '/e3-10-cabana-B.png' });

  // Sala 3: A ve la lámpara Morse, B tiene el dibujo de grietas
  await A.evaluate(() => Esc3D._interact('clue')); await wait(300);
  ok('A ve la luz Morse', (await A.$('#mLamp')) !== null);
  await close(A);
  await B.evaluate(() => Esc3D._interact('clue2'));
  ok('B ve las grietas', (await sheet(B)).includes('arriba izquierda'));
  await close(B);
  await A.evaluate(() => Esc3D._interact('lock'));
  for (const i of [0, 2, 4, 6, 8]) await A.click(`#sheet [data-act=lkToggle][data-v="${i}"]`);
  await A.screenshot({ path: shots + '/e3-11-baldosas.png' });
  await A.click('#sheet [data-act=lkTry]'); await wait(700);
  ok('A ve los peces', (await sheet(A)).includes('4 rojos')); await close(A);
  await word(B, 'lock', 'BESO'); ok('B ve el mapa', (await sheet(B)).includes('mapa del lago')); await close(B);
  await toggles(A, 'lock2', [0, 1, 3]); ok('A lee el diario', (await sheet(A)).includes('contrario del frío')); await close(A);
  await A.evaluate(() => Esc3D._view(2.0, -1.6, 0, 0.1)); await wait(1200); await A.screenshot({ path: shots + '/e3-11b-faroles.png' });
  await keypad(B, 'lock2', '416'); ok('B abre el baúl', (await sheet(B)).includes('brújula')); await close(B);
  await keypad(A, 'lock3', '314');
  await word(B, 'lock3', 'calor');
  await wait(800);
  ok('ganaron', !!(await st(A)).wonAt);
  await wait(4000);
  ok('vuelve al vestíbulo con trofeo', (await A.$('#e3')) === null && (await A.textContent('main')).includes('¡Escaparon en'));
  await A.click('[data-act=tab][data-v=games]');
  ok('lista muestra resultado', (await A.textContent('main')).includes('✅ Escaparon en'));
  await A.click('[data-act=tab][data-v=escape3d]');

  // Se acaba el tiempo: la sala se reinicia una sola vez
  await A.click('[data-act=e3New]'); await A.click('[data-act=_confirmYes]'); await A.waitForSelector('#e3 canvas');
  await A.evaluate(() => Sync.patchCouple(S.code, { 'escape3.levelAt': Date.now() - 15 * 60000 + 300, 'escape3.A': true }));
  await wait(2000);
  const f = await st(A);
  console.log('fps A', await A.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const k = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(k); else r(n); }; requestAnimationFrame(k); })));
  ok('reinicio por tiempo', f.fails === 1 && f.A === false && Date.now() - f.levelAt < 5000);
  await A.screenshot({ path: shots + '/e3-12-tiempo.png' });

  // Los dos abren a la vez con estado viejo: igual avanzan una sola sala
  // (en el modo demo las pestañas no escriben a la vez de forma atómica; se prueba con escrituras parciales seguidas)
  await A.evaluate(() => Sync.patchCouple(S.code, { 'escape3.A': true })); await wait(100);
  await B.evaluate(() => Sync.patchCouple(S.code, { 'escape3.B': true }));
  await wait(1200);
  ok('a la vez avanza una sala', (await st(B)).level === 1);

  await A.click('#e3 [data-act=e3Exit]');
  ok('salir cierra la sala', (await A.$('#e3')) === null);
  ok('sin errores', errs.length === 0); if (errs.length) console.log(errs.join('\n'));
  await b.close(); srv.close();
  console.log(fails ? `${fails} fallas` : 'TODO OK');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
