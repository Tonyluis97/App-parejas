// Baja assets CC0 de Poly Haven (https://polyhaven.com). Se ejecuta en GitHub Actions
// porque el contenedor de desarrollo no llega a polyhaven.com.
// Escribe tools/polyhaven-catalog.json y descarga lo listado en tools/polyhaven-wanted.json a assets-raw/.
import fs from 'node:fs';
import path from 'node:path';

const UA = { 'User-Agent': 'App-parejas asset fetch (github.com/Tonyluis97/App-parejas)' };
const get = async u => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(u + ' ' + r.status); return r; };
const json = async u => (await get(u)).json();
async function save(u, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await (await get(u)).arrayBuffer()));
  console.log('ok', file);
}

const all = await json('https://api.polyhaven.com/assets?t=all');
const cat = Object.entries(all).map(([id, a]) => [id, ['hdri', 'tex', 'model'][a.type], a.categories.join(','), a.tags.slice(0, 6).join(',')].join('|'));
fs.writeFileSync('tools/polyhaven-catalog.txt', cat.sort().join('\n') + '\n');

const wanted = fs.existsSync('tools/polyhaven-wanted.json') ? JSON.parse(fs.readFileSync('tools/polyhaven-wanted.json', 'utf8')) : [];
for (const w of wanted) {
  const res = w.res || '1k';
  try {
    const f = await json('https://api.polyhaven.com/files/' + w.id);
    const dir = path.join('assets-raw', w.id);
    if (all[w.id].type === 0) await save(f.hdri[res].hdr.url, path.join(dir, w.id + '_' + res + '.hdr'));
    else if (all[w.id].type === 1) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'maps.json'), JSON.stringify(Object.keys(f)));
      for (const m of w.maps || ['Diffuse', 'nor_gl', 'arm']) {
        const e = f[m] && f[m][res] && (f[m][res].jpg || f[m][res].png);
        if (e) await save(e.url, path.join(dir, m + path.extname(e.url)));
        else console.log('falta', w.id, m);
      }
    } else {
      const g = f.gltf[res].gltf;
      await save(g.url, path.join(dir, w.id + '.gltf'));
      for (const [rel, inc] of Object.entries(g.include || {})) await save(inc.url, path.join(dir, rel));
    }
  } catch (e) { console.log('ERROR', w.id, e.message); }
}
