// Genera los iconos PNG de la PWA a partir de un SVG
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
const exe = fs.readdirSync('/opt/pw-browsers').filter(d => d.startsWith('chromium-')).map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find(fs.existsSync);
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e24d6b"/><stop offset="1" stop-color="#ff8a65"/></linearGradient></defs><rect width="512" height="512" fill="url(#g)"/><g transform="translate(256 270) scale(${pad})"><path d="M0 120 C-40 90 -170 20 -170 -60 C-170 -120 -120 -160 -70 -160 C-35 -160 -12 -140 0 -118 C12 -140 35 -160 70 -160 C120 -160 170 -120 170 -60 C170 20 40 90 0 120 Z" fill="#fff"/><path transform="translate(38 -6) scale(.55)" d="M0 120 C-40 90 -170 20 -170 -60 C-170 -120 -120 -160 -70 -160 C-35 -160 -12 -140 0 -118 C12 -140 35 -160 70 -160 C120 -160 170 -120 170 -60 C170 20 40 90 0 120 Z" fill="#e24d6b" opacity=".9"/></g></svg>`;
(async () => {
  const b = await chromium.launch({ executablePath: exe });
  const p = await b.newPage();
  for (const [name, size, pad] of [['icon-192', 192, 1], ['icon-512', 512, 1], ['apple-touch-icon', 180, 1], ['icon-maskable', 512, .72]]) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<style>body{margin:0}</style><img src="data:image/svg+xml;base64,${Buffer.from(svg(pad)).toString('base64')}" width="${size}" height="${size}">`);
    await p.screenshot({ path: `web/icons/${name}.png` });
  }
  await b.close();
  console.log('iconos listos');
})();
