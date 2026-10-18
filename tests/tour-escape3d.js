// Capturas de las tres salas desde varios ángulos (para revisar cómo se ven). Uso: node tests/tour-escape3d.js <carpeta>
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const exe = fs.readdirSync('/opt/pw-browsers').filter(d => d.startsWith('chromium-')).map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find(fs.existsSync);
const root = path.join(__dirname, '..', 'web');
const shots = process.argv[2] || '/tmp';
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); r.end(d); } });
}).listen(0);
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const url = `http://localhost:${srv.address().port}/`;
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 400, height: 820 }, hasTouch: true, isMobile: true });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const A = await ctx.newPage(), B = await ctx.newPage();
  for (const p of [A, B]) p.on('pageerror', e => console.log('error', e.message));
  await A.goto(url); await A.evaluate(() => localStorage.clear()); await A.reload(); await B.goto(url);
  await A.fill('#wName', 'Antonny'); await A.fill('#wStart', '2025-02-14'); await A.click('button[type=submit]');
  await A.waitForSelector('.codebig'); await A.click('[data-act=enter]');
  await B.goto(await A.evaluate(() => inviteLink()));
  await B.fill('#wName', 'Ella'); await B.click('button[type=submit]'); await B.waitForSelector('.hero');
  await A.click('[data-act=tab][data-v=games]'); await A.click('[data-act=tab][data-v=escape3d]');
  await A.click('[data-act=e3New]'); await A.click('[data-act=_confirmYes]');
  await A.waitForSelector('#e3 canvas', { timeout: 60000 });
  await B.click('[data-act=tab][data-v=games]'); await B.click('[data-act=tab][data-v=escape3d]');
  await B.click('[data-act=e3Open]'); await B.waitForSelector('#e3 canvas', { timeout: 60000 });
  const q = Math.PI / 4, views = [[3.2, 3.2, q, -0.2], [-3.2, 3.2, -q, -0.2], [-3.2, -3.2, -3 * q, -0.2], [3.2, -3.2, 3 * q, -0.2], [0, 2, 0, 0.9]];
  for (const lv of (process.argv[3] || '0,1,2').split(',').map(Number)) {
    await A.evaluate(lv => Sync.patchCouple(S.code, { escape3: Object.assign({}, S.couple.escape3, { level: lv, levelAt: Date.now(), A: false, B: false }) }), lv);
    await wait(lv ? 8000 : 2000);
    for (const [p, n] of [[A, 'A'], [B, 'B']]) {
      await p.evaluate(() => { const m = document.getElementById('e3Msg'); if (m) m.style.display = 'none'; });
      for (let i = 0; i < views.length; i++) {
        await p.evaluate(v => Esc3D._view(...v), views[i]); await wait(1200);
        await p.screenshot({ path: `${shots}/t${lv}-${n}-${i}.png` });
      }
    }
  }
  await b.close(); srv.close();
})();
