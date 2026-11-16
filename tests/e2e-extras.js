// Recuperar la sesión, reto semanal, logros, álbum y silueta de la pareja (modo demo: DEMO=1 sh build.sh).
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
const FB = !!process.env.FB, pkg = process.env.FB_PKG || '/tmp/fb12/package';
const wait = ms => new Promise(r => setTimeout(r, FB ? ms * 4 : ms));


(async () => {
  const url = `http://localhost:${srv.address().port}/`;
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 400, height: 820 }, hasTouch: true, isMobile: true });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const errs = [];
  const A = await ctx.newPage(), B = await ctx.newPage();
  for (const [p, n] of [[A, 'A'], [B, 'B']]) { p.on('pageerror', e => errs.push(n + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|no coinciden/.test(m.text())) errs.push(n + ' consola: ' + m.text()); }); }
  await A.goto(url); await A.evaluate(() => localStorage.clear()); await A.reload(); await B.goto(url);
  await A.fill('#wName', 'Antonny'); await A.fill('#wStart', '2025-02-14'); await A.click('button[type=submit]');
  await A.waitForSelector('.codebig'); await A.click('[data-act=enter]');
  await B.goto(await A.evaluate(() => inviteLink()));
  await B.fill('#wName', 'Ella'); await B.click('button[type=submit]'); await B.waitForSelector('.hero');
  await B.evaluate(() => Sync.add(S.code, 'messages', { from: S.uid, text: 'hola desde antes', t: Date.now() }));
  await wait(600);

  // ----- Clave de recuperación: cada uno ve la suya y la de su pareja -----
  const open = (p, t) => p.evaluate(t => { S.tab = t; render(); }, t);
  await open(B, 'settings'); await B.waitForSelector('#myRecov');
  const key = (await B.textContent('#myRecov')).trim(), code = await B.evaluate(() => S.code), oldUid = await B.evaluate(() => S.uid);
  ok('clave de 12 caracteres (' + key + ')', /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key));
  await open(A, 'settings'); await wait(300);
  ok('A ve la clave de su pareja', (await A.textContent('#recovCard')).includes(key));
  await A.screenshot({ path: shots + '/x-01-clave.png', fullPage: true });

  // ----- B reinstala: sesión nueva, vuelve a ser la misma persona -----
  await B.evaluate(() => { localStorage.removeItem('nosotros_perfil:' + Sync.uid()); sessionStorage.clear(); });
  await B.goto(url); await B.waitForSelector('#wName');
  ok('sesión nueva distinta', await B.evaluate(() => S.uid) !== oldUid);
  await B.click('[data-act=wmode][data-v=recover]');
  await B.fill('#wCode', code); await B.fill('#wKey', 'AAAA-BBBB-CCCC'); await B.click('button[type=submit]'); await wait(500);
  ok('clave equivocada no entra', !!(await B.$('#wKey')));
  await B.screenshot({ path: shots + '/x-02-recuperar.png' });
  await B.fill('#wKey', key.toLowerCase().replace(/-/g, ' ')); await B.click('button[type=submit]'); await B.waitForSelector('.hero'); await wait(600);
  ok('misma persona tras recuperar', await B.evaluate(() => S.uid) === oldUid);
  ok('sigue siendo jugador B', await B.evaluate(() => myRole()) === 'B');
  ok('ve a su pareja', await B.evaluate(() => partnerName()) === 'Antonny');
  ok('sus mensajes siguen siendo suyos', await B.evaluate(() => S.msgs.some(m => m.from === S.uid && m.text === 'hola desde antes')));
  ok('A sigue viendo dos personas', await A.evaluate(() => S.couple.uids.length === 2 && partnerName() === 'Ella'));
  await B.reload(); await B.waitForSelector('.hero'); await wait(400);
  ok('tras reabrir sigue recuperada', await B.evaluate(() => S.uid) === oldUid);

  // ----- Reto semanal, logros y álbum -----
  for (const p of [A, B]) await open(p, 'rooms');
  ok('reto de la semana en la lista', !!(await A.$('#rmWeekly')));
  await A.screenshot({ path: shots + '/x-03-reto.png', fullPage: true });
  const wk = await A.evaluate(() => Rooms.weekly(Date.now(), ROOMS_INDEX));
  await A.evaluate(w => Sync.patchCouple(S.code, { 'roomsBest.ER09': { points: 1620, stars: 3, ms: 1500000, at: 5, plays: 1, lastWon: 5, clean: true }, 'roomsEnds.ER09': { END01: 5, END03: 5 }, ['roomsWeekly.' + w.key]: { id: w.id, points: 1920, ok: true, ms: 1500000, at: Date.now() }, ['roomsWeekly.w' + (w.n - 1)]: { id: 'ER01', points: 1400, ok: false, ms: 2100000, at: 1 } }), wk);
  await wait(700);
  ok('B recibe el aviso del logro', /Logro conseguido/.test(await B.evaluate(() => (document.querySelector('.toast') || {}).textContent || '')));
  ok('reto marcado como cumplido', /Reto cumplido/.test(await A.textContent('#rmWeekly')) && /2 semanas seguidas/.test(await A.textContent('#rmWeekly')));
  await A.click('[data-act=tab][data-v=roomsAlbum]'); await wait(300);
  const alb = await A.textContent('main');
  ok('ranking semanal', /1\.?920 pts/.test(alb) && /Esta semana/.test(alb));
  ok('logros conseguidos', /Primera fuga/.test(alb) && /Sin pistas/.test(alb));
  ok('álbum con finales abiertos y por descubrir', /Noche de música/.test(alb) && /Final por descubrir/.test(alb) && !/Noche de faroles/.test(alb));
  await A.screenshot({ path: shots + '/x-04-album.png', fullPage: true });
  await A.click('header [data-act=tab]'); await wait(200);
  ok('volver lleva a la lista', !!(await A.$('#rmWeekly')));

  // ----- Aviso de partida y silueta de la pareja en 3D -----
  await open(B, 'home');
  await A.click('[data-act=rmOpen][data-v=ER09]'); await A.click('[data-act=rmStart]');
  await wait(1200);
  ok('B recibe que le esperan', /te espera en el escape room/.test(await B.evaluate(() => (document.querySelector('.toast') || {}).textContent || '')));
  await A.waitForFunction(() => typeof Rooms3D !== 'undefined' && Rooms3D._info() && Rooms3D._info().room, null, { timeout: 90000 });
  await A.evaluate(() => { document.querySelectorAll('#rmsub').forEach(m => m.style.display = 'none'); Rooms3D._view(0, 0.6, 0, -0.05); });
  const room = await A.evaluate(() => Rooms3D._info().room);
  ok('sin pareja en la zona no hay silueta', await A.evaluate(() => Rooms3D._ghost()) === null);
  await B.evaluate(r => Sync.patchCouple(S.code, { 'rooms10.where.B': { room: r, oid: null, x: 0.2, z: -1.3, yaw: 3.1, t: Date.now() } }), room);
  await A.waitForFunction(() => Rooms3D._ghost(), null, { timeout: 60000 });
  await wait(6000);
  const g = await A.evaluate(() => Rooms3D._ghost());
  ok('silueta de la pareja en su sitio', g && Math.abs(g.x - 0.2) < 0.3 && Math.abs(g.z + 1.3) < 0.3);
  await A.screenshot({ path: shots + '/x-05-silueta.png' });
  await B.evaluate(() => Sync.patchCouple(S.code, { 'rooms10.where.B': { room: 'OTRA', oid: null, x: 0, z: 0, yaw: 0, t: Date.now() } }));
  await A.waitForFunction(() => !Rooms3D._ghost(), null, { timeout: 60000 });
  ok('al irse de la zona desaparece', true);
  ok('sin errores', errs.length === 0); if (errs.length) console.log(errs.slice(0, 10).join('\n'));
  await b.close(); srv.close();
  console.log(fails ? fails + ' fallos' : 'todo ok');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e.message); process.exit(1); });
