// Recuperar la sesión contra Firebase real (sh build.sh): un tercer navegador entra como la persona B con su clave.
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
const FB = true, pkg = process.env.FB_PKG || '/tmp/fb12/package';
const wait = ms => new Promise(r => setTimeout(r, FB ? ms * 4 : ms));

(async () => {
  const url = `http://localhost:${srv.address().port}/`;
  const b = await chromium.launch({ executablePath: exe });
  const mkCtx = async () => {
    const ctx = await b.newContext({ viewport: { width: 400, height: 820 }, hasTouch: true, isMobile: true });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await ctx.route(/www\.gstatic\.com\/firebasejs\/[^/]+\/(.+)$/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(pkg, r.request().url().split('/').pop())) }));
    const p = await ctx.newPage(); await p.goto(url); await p.waitForFunction(() => typeof S !== 'undefined' && S.ready, null, { timeout: 60000 });
    return p;
  };
  const A = await mkCtx(), B = await mkCtx();
  ok('modo firebase', await A.evaluate(() => Sync.mode) === 'firebase');
  await A.fill('#wName', 'Antonny'); await A.fill('#wStart', '2025-02-14'); await A.click('button[type=submit]');
  await A.waitForSelector('.codebig'); await A.click('[data-act=enter]');
  await B.goto(await A.evaluate(() => inviteLink())); await B.waitForFunction(() => typeof S !== 'undefined' && S.ready);
  await B.fill('#wName', 'Ella'); await B.click('button[type=submit]'); await B.waitForSelector('.hero');
  await B.evaluate(() => Sync.add(S.code, 'messages', { from: S.uid, text: 'hola desde antes', t: Date.now() }));
  await B.evaluate(() => { S.tab = 'settings'; render(); }); await B.waitForSelector('#myRecov', { timeout: 30000 });
  const key = (await B.textContent('#myRecov')).trim(), code = await B.evaluate(() => S.code), oldUid = await B.evaluate(() => S.uid);
  console.log('pareja de prueba', code);
  // Móvil nuevo de B (otra sesión anónima)
  const C = await mkCtx();
  ok('sesión nueva distinta', await C.evaluate(() => S.uid) !== oldUid);
  await C.click('[data-act=wmode][data-v=recover]');
  await C.fill('#wCode', code); await C.fill('#wKey', 'AAAA-BBBB-CCCC'); await C.click('button[type=submit]'); await wait(1500);
  ok('clave equivocada no entra', !!(await C.$('#wKey')));
  await C.fill('#wKey', key); await C.click('button[type=submit]');
  await C.waitForSelector('.hero', { timeout: 30000 }); await wait(1500);
  ok('misma persona tras recuperar', await C.evaluate(() => S.uid) === oldUid);
  ok('sigue siendo jugador B', await C.evaluate(() => myRole()) === 'B');
  ok('ve a su pareja', await C.evaluate(() => partnerName()) === 'Antonny');
  ok('sus mensajes siguen siendo suyos', await C.evaluate(() => S.msgs.some(m => m.from === S.uid && m.text === 'hola desde antes')));
  await C.evaluate(() => Sync.add(S.code, 'messages', { from: S.uid, text: 'ya volví', t: Date.now() })); await wait(1500);
  ok('A recibe su mensaje nuevo', await A.evaluate(() => S.msgs.some(m => m.text === 'ya volví' && m.from === partnerId())));
  ok('A sigue viendo dos personas', await A.evaluate(() => S.couple.uids.length === 2 && partnerName() === 'Ella'));
  await C.reload(); await C.waitForSelector('.hero', { timeout: 30000 }); await wait(800);
  ok('tras reabrir sigue recuperada', await C.evaluate(() => S.uid) === oldUid);
  // Un extraño sin clave sigue sin poder entrar ni leer
  const X = await mkCtx();
  ok('extraño no puede leer la pareja', await X.evaluate(async c => { try { await Sync.recover(c, 'ZZZZ-ZZZZ-ZZZZ'); return false; } catch (e) { return true; } }, code));
  await b.close(); srv.close();
  console.log(fails ? fails + ' fallos' : 'todo ok');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERROR', e.message); process.exit(1); });
