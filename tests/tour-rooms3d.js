// Recorrido del visor 3D de los escape rooms: dos móviles entran a ER09 en 3D y se guardan capturas.
// Modo demo (DEMO=1 sh build.sh): dos pestañas. Con FB=1 (sh build.sh): dos navegadores separados contra Firebase real;
// el SDK sale del paquete npm en FB_PKG porque gstatic puede estar bloqueado.
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

const errsG = [];
(async () => {
  const url = `http://localhost:${srv.address().port}/`;
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const turns = JSON.parse(process.env.TURNS || '[0,0.9,0.9,0.9,0.9,0.9]');
  const mkCtx = async () => {
    const ctx = await b.newContext({ viewport: { width: 400, height: 820 }, hasTouch: true, isMobile: true });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    if (FB) await ctx.route(/www\.gstatic\.com\/firebasejs\/[^/]+\/(.+)$/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(pkg, r.request().url().split('/').pop())) }));
    return ctx;
  };
  const errs = errsG;
  const ctxA = await mkCtx(), ctxB = FB ? await mkCtx() : ctxA;
  const A = await ctxA.newPage(), B = await ctxB.newPage();
  for (const [p, n] of [[A, 'A'], [B, 'B']]) { p.on('pageerror', e => errs.push(n + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errs.push(n + ' consola: ' + m.text()); }); }
  await A.goto(url); await A.evaluate(() => localStorage.clear()); await A.reload(); await B.goto(url);
  if (FB) { ok('modo firebase', await A.evaluate(() => Sync.mode) === 'firebase'); await A.waitForFunction(() => S.ready); await B.waitForFunction(() => S.ready); }

  // Emparejar
  await A.fill('#wName', 'Antonny'); await A.fill('#wStart', '2025-02-14'); await A.click('button[type=submit]');
  await A.waitForSelector('.codebig'); await A.click('[data-act=enter]');
  await B.goto(await A.evaluate(() => inviteLink()));
  await B.fill('#wName', 'Ella'); await B.click('button[type=submit]'); await B.waitForSelector('.hero');

  // Partida de ER09 y visor 3D
  for (const p of [A, B]) { await p.click('[data-act=tab][data-v=games]'); await p.click('[data-act=tab][data-v=rooms]'); await p.click('[data-act=rmOpen][data-v=ER09]'); }
  await A.click('[data-act=rmStart]'); await wait(300);
  await A.evaluate(() => Sync.patchCouple(S.code, { 'rooms10.variant': null })); await wait(400); await B.evaluate(() => render());
  ok('botón 3D', !!(await A.$('[data-act=r3Open]')));
  await A.click('[data-act=r3Open]'); await A.waitForSelector('#e3 canvas', { timeout: 60000 });
  await B.click('[data-act=r3Open]'); await B.waitForSelector('#e3 canvas', { timeout: 60000 });
  await wait(FB ? 3000 : 6000);
  const infoA = await A.evaluate(() => Rooms3D._info()), infoB = await B.evaluate(() => Rooms3D._info());
  console.log('A', JSON.stringify(infoA)); console.log('B', JSON.stringify(infoB));
  ok('A en el altillo 3D', infoA.room === 'ROOM01' && infoA.objects.includes('O05'));
  ok('B en el puerto 3D', infoB.room === 'ROOM02' && infoB.objects.includes('O14'));
  ok('marcas de novedad', await A.evaluate(() => document.querySelector('#e3Name').textContent.length > 0));
  for (const [p, n] of [[A, 'A'], [B, 'B']]) {
    await p.evaluate(() => { for (const id of ['e3Msg', 'rmsub']) { const m = document.getElementById(id); if (m) m.style.display = 'none'; } });
    for (const [i, v] of turns.entries()) { await p.evaluate(v => Rooms3D._turn(v), v); await wait(1500); await p.screenshot({ path: shots + '/r3-' + n + '-' + i + '.png' }); }
  }
  // Tocar un objeto abre la misma ficha que en 2D
  await A.evaluate(() => Rooms3D._interact('O01')); await wait(800);
  ok('ficha del plano', (await A.textContent('#sheet')).includes('Plano del alumbrado'));
  await A.screenshot({ path: shots + '/r3-A-ficha.png' });
  await A.click('#rz [data-act=closeSheet]');
  // Puerta cerrada a la plaza
  await B.evaluate(() => Rooms3D._interact('door:DOOR02')); await wait(300);
  ok('puerta cerrada', (await B.textContent('#e3Msg')).includes('cerrada'));
  await A.click('#e3 [data-act=r3Exit]'); await wait(300);
  ok('salir del 3D', (await A.$('#e3')) === null && (await A.textContent('main')).includes('Altillo'));
  ok('sin errores', errs.length === 0); if (errs.length) console.log(errs.slice(0, 10).join('\n'));
  await b.close(); srv.close();
  console.log(fails ? fails + ' fallos' : 'todo ok');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e.message.split('\n')[0]); console.log(errsG.join('\n')); process.exit(1); });
