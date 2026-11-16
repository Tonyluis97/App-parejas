// Recorrido del visor 3D de los escape rooms: dos móviles entran a ER09 en 3D y se guardan capturas.
// Modo demo (DEMO=1 sh build.sh): dos pestañas. Con FB=1 (sh build.sh): dos navegadores separados contra Firebase real;
// el SDK sale del paquete npm en FB_PKG porque gstatic puede estar bloqueado.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const exe = fs.readdirSync('/opt/pw-browsers').filter(d => d.startsWith('chromium-')).map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find(fs.existsSync);
const root = path.join(__dirname, '..', 'web');
// Auditoría del 3D: en ninguna zona de ningún escape room puede haber objetos que se pisen o se salgan.
// node tests/audit-rooms3d.js   (tras DEMO=1 sh build.sh)
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); r.end(d); } });
}).listen(0);
(async () => {
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  p.on('pageerror', e => console.log('error', e.message));
  await p.goto(`http://localhost:${srv.address().port}/`);
  await p.evaluate(() => Rooms3D._boot());
  let bad = 0;
  for (const id of await p.evaluate(() => Object.keys(window.ROOMS_DATA))) {
    const r = await p.evaluate(id => Rooms3D._audit(Rooms.scenario(window.ROOMS_DATA[id], null)), id);
    const n = Object.values(r).reduce((a, x) => a + x.length, 0); bad += n;
    console.log(n ? 'FALLA' : 'ok', id, n ? JSON.stringify(r) : 'sin superposiciones');
  }
  await b.close(); srv.close();
  console.log(bad ? bad + ' superposiciones' : 'todo ok');
  process.exit(bad ? 1 : 0);
})();
