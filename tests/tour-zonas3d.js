// Capturas de maqueta (desde arriba) y a la altura de los ojos de todas las zonas de un escape room, con todo visible.
// ID=ER05 node tests/tour-zonas3d.js <carpeta>   (tras DEMO=1 sh build.sh)
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const exe = fs.readdirSync('/opt/pw-browsers').filter(d => d.startsWith('chromium-')).map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find(fs.existsSync);
const root = path.join(__dirname, '..', 'web'), shots = process.argv[2] || '/tmp', IDS = (process.env.ID || 'ER09').split(',');
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); r.end(d); } });
}).listen(0);
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 400, height: 820 }, hasTouch: true, isMobile: true });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const A = await ctx.newPage(); const errs = [];
  A.on('pageerror', e => errs.push(e.message));
  await A.goto(`http://localhost:${srv.address().port}/`); await A.evaluate(() => localStorage.clear()); await A.reload();
  await A.fill('#wName', 'Antonny'); await A.fill('#wStart', '2025-02-14'); await A.click('button[type=submit]');
  await A.waitForSelector('.codebig'); await A.click('[data-act=enter]');
  for (const ID of IDS) {
    await A.evaluate(id => { if (Rooms3D.active) Rooms3D.close(); S.roomSel = id; S.tab = 'room'; return Sync.patchCouple(S.code, { rooms10: { id, variant: null, startedAt: Date.now() } }); }, ID);
    await A.waitForSelector('#e3 canvas', { timeout: 90000 }); await wait(3000);
    // Todo visible y todas las zonas abiertas, solo para mirar
    const rooms = await A.evaluate(() => { const s = rmScenario(rmState()); Rooms._objectsIn = Rooms._objectsIn || Rooms.objectsIn; Rooms.objectsIn = (s, c, id) => s.objects.filter(o => o.room === id); return s.rooms.filter(r => r.dimensions_m).map(r => r.room_id); });
    for (const r of rooms) {
      await A.evaluate(r => Rooms3D._over(false) || Rooms3D._go(r), r); await wait(2500);
      await A.evaluate(() => { for (const id of ['e3Msg', 'rmsub', 'r3Bar', 'e3Hint', 'e3Joy']) { const m = document.getElementById(id); if (m) m.style.display = 'none'; } });
      await wait(1500); await A.screenshot({ path: `${shots}/${ID}-${r}-ojos.png` });
      await A.evaluate(() => Rooms3D._over(true)); await wait(1500); await A.screenshot({ path: `${shots}/${ID}-${r}-maqueta.png` });
      await A.evaluate(() => Rooms3D._over(false));
      console.log('ok', ID, r);
    }
  }
  if (errs.length) console.log('ERRORES', errs.slice(0, 5).join('\n'));
  await b.close(); srv.close(); process.exit(errs.length ? 1 : 0);
})();
