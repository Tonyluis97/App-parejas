// Prueba de los escape rooms para dos en modo demo: dos pestañas = dos móviles juegan ER09 tocando la pantalla.
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
  const b = await chromium.launch({ executablePath: exe });
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

  // Lista y presentación
  for (const p of [A, B]) { await p.click('[data-act=tab][data-v=games]'); await p.click('[data-act=tab][data-v=rooms]'); }
  ok('lista de 10', (await A.$$('#app .card.game')).length === 10);
  ok('ER09 disponible', (await A.textContent('main')).includes('La ciudad en miniatura'));
  await A.screenshot({ path: shots + '/r-00-lista.png', fullPage: true });
  for (const p of [A, B]) await p.click('[data-act=rmOpen][data-v=ER09]');
  ok('presentación con roles', (await A.textContent('main')).includes('Gigante del altillo'));
  await A.screenshot({ path: shots + '/r-01-intro.png', fullPage: true });
  await A.click('[data-act=rmStart]'); await wait(300);
  await A.evaluate(() => Sync.patchCouple(S.code, { 'rooms10.variant': null })); // base, para saber las respuestas
  await wait(400); await B.evaluate(() => render());
  ok('A en el altillo', (await A.textContent('main')).includes('Altillo del maquetista'));
  ok('B en el puerto', (await B.textContent('main')).includes('Barrio del Puerto'));
  ok('B no ve el altillo', !(await B.textContent('main')).includes('Altillo del maquetista'));
  await wait(200);
  ok('subtítulo de inicio', await A.$('#rmsub') !== null);
  await A.screenshot({ path: shots + '/r-02-altillo-A.png', fullPage: true });
  await B.screenshot({ path: shots + '/r-03-puerto-B.png', fullPage: true });
  for (const p of [A, B]) while (await p.$('#rmsub')) await p.click('#rmsub');

  // Antes de tener las pistas, la palanca pide información
  await B.click('[data-act=rmObj][data-v=O10]'); await wait(200);
  ok('P01 pide pistas', (await B.textContent('#rz')).includes('Les falta información'));
  await B.click('#rz [data-act=closeSheet]');

  // Jugar tocando: cada uno revisa todo lo que ve y resuelve lo que le toca
  const solve = async (p, name) => {
    const info = await p.evaluate(() => {
      if (!document.getElementById('rz')) return null;
      const st = rmState(), s = rmScenario(st), o = s.objects.find(x => x.object_id === RZ.oid);
      const pz = o.puzzle && s.puzzles.find(x => x.puzzle_id === o.puzzle);
      if (!pz || !pz.validation.input_by.includes(myRole()) || ['examine', 'narrative', 'decorative', 'collect'].includes(o.category)) return null;
      return { id: pz.puzzle_id, type: pz.answer.type, value: pz.answer.value, status: Rooms.puzzleStatus(s, rmCompute(st), st, pz).status };
    });
    if (!info || info.status !== 'ready' || info.type === 'decision') return false;
    if (!solve.wrongTried && info.type === 'code') { // una incorrecta primero
      solve.wrongTried = true;
      for (const d of '999') await p.click('#rz [data-act=rmKey][data-v="' + d + '"]');
      await p.click('#rz [data-act=rmTry]'); await wait(250);
      ok(name + ' rechaza código incorrecto', !(await p.evaluate(id => !!(rmState().solved || {})[id], info.id)));
    }
    if (info.type === 'code') for (const d of String(info.value)) await p.click('#rz [data-act=rmKey][data-v="' + d + '"]');
    if (info.type === 'sequence' || info.type === 'set') for (const v of info.value) await p.click('#rz [data-act=rmPick][data-v="' + v + '"]');
    if (info.type === 'position') for (const k in info.value) await p.click('#rz [data-act=rmPos][data-k="' + k + '"][data-v=\'' + JSON.stringify(info.value[k]) + '\']');
    if (info.type === 'combine') { const btn = await p.$('#rz [data-act=rmUse][data-v="' + info.value[0] + '"]'); if (!btn) return false; await btn.click(); }
    else await p.click('#rz [data-act=rmTry]');
    await wait(300);
    const done = await p.evaluate(id => !!(rmState().solved || {})[id], info.id);
    ok(name + ' resuelve ' + info.id + ' tocando', done);
    if (done && !solve.shot) { solve.shot = 1; }
    return done;
  };
  const sweep = async (p, name) => {
    while (await p.$('#rmsub')) await p.click('#rmsub');
    const rooms = await p.$$eval('[data-act=rmRoom]', els => els.map(e => e.dataset.v));
    for (const r of rooms.length ? rooms : [null]) {
      if (r) { await p.click('[data-act=rmRoom][data-v=' + r + ']'); await wait(100); }
      // solo lo que tiene algo que hacer (acción, pista o acertijo listo para este jugador)
      const tiles = await p.evaluate(() => {
        const st = rmState(), s = rmScenario(st), c = rmCompute(st), role = myRole();
        return [...document.querySelectorAll('[data-act=rmObj]')].map(e => e.dataset.v).filter(id => {
          const o = s.objects.find(x => x.object_id === id), pz = o.puzzle && s.puzzles.find(x => x.puzzle_id === o.puzzle);
          return Rooms.nextAction(s, c, o, role) >= 0 || Rooms.cluesAt(s, c, st, o, role).length ||
            (pz && pz.validation.input_by.includes(role) && Rooms.puzzleStatus(s, c, st, pz).status === 'ready');
        });
      });
      for (const id of tiles) {
        while (await p.$('#rmsub')) await p.click('#rmsub');
        if (!(await p.$('[data-act=rmObj][data-v=' + id + ']'))) continue;
        await p.click('[data-act=rmObj][data-v=' + id + ']'); await wait(120);
        if (await p.$('#rz [data-act=rmAct]')) { await p.click('#rz [data-act=rmAct]'); await wait(150); }
        await solve(p, name);
        if (await p.$('#rz [data-act=closeSheet]')) await p.click('#rz [data-act=closeSheet]');
        await wait(80);
      }
    }
    const vote = await p.$('[data-act=rmVote]');
    if (vote) { await vote.click(); await wait(300); }
  };
  let shotMid = false;
  for (let round = 0; round < 12; round++) {
    console.log('ronda', round, Date.now() % 100000);
    await sweep(A, 'A'); await wait(200); await sweep(B, 'B'); await wait(200);
    if (!shotMid && await B.evaluate(() => !!(rmState().solved || {}).P01)) {
      shotMid = true;
      await A.screenshot({ path: shots + '/r-04-A-con-pistas.png', fullPage: true });
      await B.click('[data-act=rmObj][data-v=O14]'); await wait(150);
      await B.screenshot({ path: shots + '/r-05-B-agujas.png' });
      await B.click('#rz [data-act=closeSheet]');
    }
    if (await A.evaluate(() => Rooms.won(rmScenario(rmState()), rmCompute(rmState())))) break;
  }
  await wait(400);
  await A.evaluate(() => render()); await B.evaluate(() => render());
  ok('A ve que escaparon', (await A.textContent('main')).includes('Lo lograron juntos'));
  ok('B ve que escaparon', (await B.textContent('main')).includes('Lo lograron juntos'));
  ok('final de la votación', (await A.textContent('main')).includes('Noche de faroles'));
  await A.screenshot({ path: shots + '/r-06-final.png', fullPage: true });

  // Pausa compartida y reinicio
  for (const p of [A, B]) while (await p.$('#rmsub')) await p.click('#rmsub');
  await A.click('[data-act=rmStart]'); await wait(400); await B.evaluate(() => render());
  ok('nueva partida en curso', await A.evaluate(() => !rmState().solved));
  await A.click('[data-act=rmPause]'); await wait(400); await B.evaluate(() => render());
  ok('B ve la pausa', (await B.textContent('main')).includes('Partida en pausa'));
  await B.click('[data-act=rmResume]'); await wait(400);
  ok('reanudada', await A.evaluate(() => !rmState().paused));
  ok('sin errores', errs.length === 0); if (errs.length) console.log(errs.slice(0, 10).join('\n'));
  await b.close(); srv.close();
  console.log(fails ? fails + ' fallos' : 'todo ok');
  process.exit(fails ? 1 : 0);
})();
