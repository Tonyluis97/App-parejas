// Prueba con Firebase real: dos navegadores separados = dos móviles distintos.
// El SDK se sirve desde el paquete npm firebase@12.19.0 (ruta en FB_PKG) porque gstatic puede estar bloqueado.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const exe = fs.readdirSync('/opt/pw-browsers').filter(d => d.startsWith('chromium-')).map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find(fs.existsSync);
const root = path.join(__dirname, '..', 'web'), pkg = process.env.FB_PKG || '/tmp/fb12/package';
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); r.end(d); } });
}).listen(0);
let fails = 0;
const ok = (n, c) => { if (!c) { fails++; console.log('FALLA', n); } else console.log('ok', n); };
const until = (p, fn, arg, t = 15000) => p.waitForFunction(fn, arg, { timeout: t }).then(() => true, () => false);

(async () => {
  const url = `http://localhost:${srv.address().port}/`;
  const b = await chromium.launch({ executablePath: exe, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const mk = async name => {
    const ctx = await b.newContext({ viewport: { width: 400, height: 820 }, permissions: ['microphone'] });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await ctx.route(/www\.gstatic\.com\/firebasejs\/[^/]+\/(.+)$/, r => {
      const f = path.join(pkg, r.request().url().split('/').pop());
      r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(f) });
    });
    const p = await ctx.newPage();
    p.errs = [];
    p.on('pageerror', e => p.errs.push(name + ': ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) p.errs.push(name + ' consola: ' + m.text()); });
    await p.goto(url);
    return p;
  };
  const A = await mk('A'), B = await mk('B');
  ok('modo firebase', await A.evaluate(() => Sync.mode) === 'firebase');
  ok('A con sesión anónima', await until(A, () => !!S.uid && S.ready));
  ok('B con sesión anónima', await until(B, () => !!S.uid && S.ready));

  await A.fill('#wName', 'Prueba A'); await A.fill('#wStart', '2025-02-14'); await A.click('button[type=submit]');
  ok('pareja creada', await until(A, () => !!S.couple));
  const code = await A.evaluate(() => S.code);
  await A.click('[data-act=enter]');
  await B.click('[data-act=wmode][data-v=join]'); await B.fill('#wName', 'Prueba B'); await B.fill('#wCode', code); await B.click('button[type=submit]');
  ok('B se unió', await until(B, () => S.couple && S.couple.uids.length === 2));
  if (fails) { console.log(B.errs, await B.textContent('body')); process.exit(1); }
  ok('A ve a B', await until(A, () => S.couple && S.couple.uids.length === 2));

  // Un extraño no puede leer ni unirse a una pareja completa
  const C = await mk('C');
  await until(C, () => S.ready);
  const cErr = await C.evaluate(c => Sync.joinCouple(c, { name: 'X' }).then(() => 'unido', e => e.message), code);
  ok('extraño no entra (' + cErr + ')', cErr !== 'unido');
  C.errs = [];

  await A.click('[data-act=tab][data-v=chat]');
  await A.fill('[data-keep=chatIn]', 'Hola desde Firebase'); await A.click('form[data-act=send] button');
  const ms = await until(B, () => S.msgs.some(m => m.text === 'Hola desde Firebase'));
  ok('mensaje sincronizado', ms);
  if (!ms) console.log('A.msgs', await A.evaluate(() => JSON.stringify(S.msgs)), 'B.msgs', await B.evaluate(() => JSON.stringify(S.msgs)), 'A.tab', await A.evaluate(() => S.tab + ' ' + (document.querySelector('[data-keep=chatIn]') ? 'input' : 'sin input')));
  await B.evaluate(() => ACTS.ping({ dataset: { v: 'think' } }));
  ok('toque recibido', await until(A, () => !!document.querySelector('.love'), null, 10000));
  await B.evaluate(() => ACTS.mood({ dataset: { v: 'feliz' } }));
  ok('ánimo sincronizado', await until(A, () => Object.values(S.couple.members).some(m => m.mood === 'feliz')));

  await A.evaluate(() => Call.call());
  ok('B recibe llamada', await until(B, () => Call.state === 'ringing'));
  await B.evaluate(() => Call.accept());
  ok('llamada conectada', await until(A, () => Call._pc && Call._pc.connectionState === 'connected', null, 20000));
  await A.evaluate(() => Call.hangup());
  ok('llamada terminada en B', await until(B, () => Call.state === 'idle'));

  await A.evaluate(() => ACTS.erStart());
  ok('escape iniciado', await until(B, () => S.couple.escape && S.couple.escape.startedAt));
  await B.evaluate(() => Sync.patchCouple(S.code, { 'escape.chest': true }));
  ok('cofre sincronizado', await until(A, () => S.couple.escape.chest === true));
  await A.evaluate(() => Sync.add(S.code, 'letters', { from: S.uid, to: partnerId(), title: 'Prueba', text: 'Hola', openAt: null, opened: false, t: Date.now() }));
  ok('carta sincronizada', await until(B, () => S.letters.some(l => l.title === 'Prueba')));
  await B.evaluate(() => Sync.patchCouple(S.code, { ttt: { board: ['X', '', '', '', '', '', '', '', ''], x: S.uid, turn: S.uid, score: {} } }));
  ok('tres en raya sincronizado', await until(A, () => S.couple.ttt && S.couple.ttt.board[0] === 'X'));

  // Escape room 3D: la sala carga y si los dos abren a la vez se avanza una sola sala
  await A.evaluate(() => { const t = Date.now(); return Sync.patchCouple(S.code, { escape3: { level: 0, levelAt: t, startedAt: t, A: false, B: false, fails: 0 } }); });
  ok('sin salida iniciado', await until(B, () => S.couple.escape3 && S.couple.escape3.level === 0));
  await A.evaluate(() => Esc3D.open());
  ok('sala 3D abierta', !!(await A.$('#e3 canvas')));
  await Promise.all([A.evaluate(() => Sync.patchCouple(S.code, { 'escape3.A': true })), B.evaluate(() => Sync.patchCouple(S.code, { 'escape3.B': true }))]);
  ok('a la vez avanza una sala', await until(B, () => S.couple.escape3.level === 1 && !S.couple.escape3.A));
  await new Promise(r => setTimeout(r, 2000));
  ok('no se salta salas', await B.evaluate(() => S.couple.escape3.level) === 1);
  await A.evaluate(() => Esc3D.close());

  const errs = [...A.errs, ...B.errs].filter(e => !/fonts/.test(e));
  ok('sin errores', errs.length === 0); if (errs.length) console.log(errs.slice(0, 5));
  await b.close(); srv.close();
  console.log(fails ? fails + ' fallas' : 'TODO OK (código de prueba ' + code + ')');
  process.exit(fails ? 1 : 0);
})();
