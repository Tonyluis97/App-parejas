// Juega de punta a punta cualquier escape room tocando la pantalla (node tests/e2e-room-play.js ER01 <capturas>).
// Modo demo (DEMO=1 sh build.sh): dos pestañas. Con FB=1 (sh build.sh): dos navegadores separados contra Firebase real;
// el SDK sale del paquete npm en FB_PKG porque gstatic puede estar bloqueado.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const exe = fs.readdirSync('/opt/pw-browsers').filter(d => d.startsWith('chromium-')).map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find(fs.existsSync);
const root = path.join(__dirname, '..', 'web');
const ID = process.argv[2] || 'ER01', shots = process.argv[3] || '/tmp';
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
  const b = await chromium.launch({ executablePath: exe });
  const mkCtx = async () => {
    const ctx = await b.newContext({ viewport: { width: 400, height: 820 }, hasTouch: true, isMobile: true });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    if (FB) await ctx.route(/www\.gstatic\.com\/firebasejs\/[^/]+\/(.+)$/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(pkg, r.request().url().split('/').pop())) }));
    return ctx;
  };
  const errs = [];
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

  for (const p of [A, B]) { await p.click('[data-act=tab][data-v=games]'); await p.click('[data-act=tab][data-v=rooms]'); }
  ok(ID + ' disponible', !!(await A.$('[data-act=rmOpen][data-v=' + ID + ']')));
  for (const p of [A, B]) await p.click('[data-act=rmOpen][data-v=' + ID + ']');
  await A.click('[data-act=rmStart]'); await wait(300);
  await A.evaluate(() => Sync.patchCouple(S.code, { 'rooms10.variant': null })); // base, para saber las respuestas
  await wait(400); await B.evaluate(() => render());
  await A.screenshot({ path: shots + '/' + ID + '-A.png', fullPage: true }); await B.screenshot({ path: shots + '/' + ID + '-B.png', fullPage: true });
  // Acertijo "a la vez": el otro móvil abre su terminal y los dos pulsan casi juntos
  const simPress = async (p, id) => {
    const info = await p.evaluate(id => {
      const st = rmState(), s = rmScenario(st), role = myRole(), pz = s.puzzles.find(x => x.puzzle_id === id);
      const o = s.objects.find(x => x.puzzle === id && (x.authorized === role || x.authorized === 'AB') && !['examine', 'narrative', 'decorative', 'collect'].includes(x.category));
      return { oid: o && o.object_id, room: o && o.room, mine: pz.answer.value[role], shared: Object.fromEntries(Object.keys(pz.answer.value).filter(k => k !== 'A' && k !== 'B').map(k => [k, pz.answer.value[k]])), parts: Rooms.simParts(pz)[role] };
    }, id);
    if (!info.oid) return;
    if (await p.$('[data-act=rmRoom][data-v=' + info.room + ']')) { await p.click('[data-act=rmRoom][data-v=' + info.room + ']'); await wait(100); }
    while (await p.$('#rmsub')) await p.click('#rmsub');
    await p.click('[data-act=rmObj][data-v=' + info.oid + ']'); await wait(150);
    if (info.parts.code) for (const d of String(info.mine)) await p.click('#rz [data-act=rmKey][data-v="' + d + '"]');
    else { const i = info.parts.options.findIndex(v => JSON.stringify(v) === JSON.stringify(info.mine)); await p.click('#rz [data-act=rmSimPick][data-i="' + i + '"]'); }
    for (const k in info.shared) { const i = await p.evaluate(([id, k, v]) => Rooms.simParts(rmScenario(rmState()).puzzles.find(x => x.puzzle_id === id)).shared[k].findIndex(x => JSON.stringify(x) === JSON.stringify(v)), [id, k, info.shared[k]]); await p.click('#rz [data-act=rmSimShared][data-k="' + k + '"][data-i="' + i + '"]'); }
  };
  const other = p => p === A ? B : A;
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
    if (info.type === 'simultaneous') {
      if (await p.$('#rz [data-act=closeSheet]')) await p.click('#rz [data-act=closeSheet]');
      const q = other(p);
      while (await q.$('#sheet')) await q.click('#sheet [data-act=closeSheet]').catch(() => q.evaluate(() => closeSheet()));
      await simPress(p, info.id); await simPress(q, info.id);
      await p.click('#rz [data-act=rmSim]'); await wait(FB ? 900 : 300);
      ok(name + ' ve que la pareja ya pulsó', FB || (await q.textContent('#rz')).includes('ya pulsó'));
      await q.click('#rz [data-act=rmSim]'); await wait(FB ? 1200 : 400);
      const done = await p.evaluate(id => !!(rmState().solved || {})[id], info.id);
      ok(name + ' resuelve ' + info.id + ' a la vez', done);
      if (await q.$('#rz [data-act=closeSheet]')) await q.click('#rz [data-act=closeSheet]');
      return done;
    }
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
  for (let round = 0; round < 20; round++) {
    console.log('ronda', round, Date.now() % 100000);
    await sweep(A, 'A'); await wait(200); await sweep(B, 'B'); await wait(200);
    if (await A.evaluate(() => Rooms.won(rmScenario(rmState()), rmCompute(rmState())))) break;
  }
  await wait(400);
  await A.evaluate(() => render()); await B.evaluate(() => render());
  ok('A ve que escaparon', (await A.textContent('main')).includes('Lo lograron juntos'));
  ok('B ve que escaparon', (await B.textContent('main')).includes('Lo lograron juntos'));
    await A.screenshot({ path: shots + '/' + ID + '-final.png', fullPage: true });

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
