// Prueba de punta a punta en modo demo: dos pestañas = dos móviles
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
  const b = await chromium.launch({ executablePath: exe, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 400, height: 820 }, colorScheme: scheme, permissions: ['microphone', 'geolocation'], geolocation: { latitude: -12.0464, longitude: -77.0428 } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    const errs = [];
    const A = await ctx.newPage(), B = await ctx.newPage();
    for (const [p, n] of [[A, 'A'], [B, 'B']]) { p.on('pageerror', e => errs.push(n + ': ' + e.message)); p.on('dialog', d => d.accept()); }
    await A.goto(url); await B.goto(url);
    await A.evaluate(() => { localStorage.clear(); });
    await A.reload(); await B.reload();

    // A crea la pareja
    await A.fill('#wName', 'Antonny'); await A.fill('#wStart', '2025-02-14');
    await A.click('button[type=submit]');
    await A.waitForSelector('.codebig');
    const code = (await A.textContent('.codebig')).trim();
    ok(scheme + ' código de 6 dígitos', /^\d{6}$/.test(code));
    if (scheme === 'light') await A.screenshot({ path: shots + '/01-codigo.png' });
    await A.click('[data-act=enter]');

    // B se une
    await B.click('[data-act=wmode][data-v=join]');
    await B.fill('#wName', 'Ella'); await B.fill('#wCode', code);
    await B.click('button[type=submit]');
    await B.waitForSelector('.hero');
    await wait(300);
    ok(scheme + ' A ve a su pareja', (await A.textContent('.hero .names')).includes('Ella'));
    const days = await A.evaluate(() => Engine.daysTogether('2025-02-14', Engine.today()));
    ok(scheme + ' contador de días', (await A.textContent('.hero .big')).trim() === String(days));

    // Ubicación (B en Madrid) y distancia
    await A.click('[data-act=locate]'); await wait(400);
    await B.evaluate(() => Sync.patchCouple(S.code, { ['members.' + S.uid + '.loc']: { lat: 40.42, lng: -3.70, t: Date.now() }, ['members.' + S.uid + '.tz']: 'Europe/Madrid' }));
    await wait(400);
    ok(scheme + ' distancia', /Están a 9\.?5\d\d km/.test(await A.textContent('main')));

    // Estado de ánimo y pienso en ti
    await B.click('[data-act=mood][data-v=extrano]'); await wait(300);
    ok(scheme + ' ánimo de la pareja', (await A.textContent('main')).includes('Te extraño'));
    await A.click('[data-act=ping][data-v=think]'); await wait(500);
    ok(scheme + ' toque recibido', await B.$('.love') !== null);

    // Pregunta del día: B no ve la respuesta de A hasta responder
    await A.fill('textarea[data-keep=ans]', 'Cuando nos reímos en la playa'); await A.click('form[data-act=answer] button'); await wait(300);
    ok(scheme + ' B no ve respuesta antes', !(await B.textContent('main')).includes('reímos en la playa'));
    await B.fill('textarea[data-keep=ans]', 'Nuestra primera cita'); await B.click('form[data-act=answer] button'); await wait(300);
    ok(scheme + ' B ve respuesta después', (await B.textContent('main')).includes('reímos en la playa'));
    if (scheme === 'light') { await A.screenshot({ path: shots + '/02-inicio.png', fullPage: true }); }
    else await A.screenshot({ path: shots + '/02-inicio-oscuro.png', fullPage: true });

    // Chat con visto
    await A.click('[data-act=tab][data-v=chat]');
    await A.fill('[data-keep=chatIn]', 'Hola amor ❤️'); await A.click('form[data-act=send] button'); await wait(300);
    ok(scheme + ' B tiene no leído', (await B.textContent('nav')).includes('1'));
    await B.click('[data-act=tab][data-v=chat]'); await wait(400);
    ok(scheme + ' B recibe mensaje', (await B.textContent('.chat')).includes('Hola amor'));
    ok(scheme + ' A ve visto', (await A.textContent('.chat')).includes('Visto'));
    await B.fill('[data-keep=chatIn]', 'Te extraño mucho'); await B.click('form[data-act=send] button'); await wait(300);
    if (scheme === 'light') await A.screenshot({ path: shots + '/03-chat.png' });

    // Listas
    await A.click('[data-act=tab][data-v=lists]');
    await A.fill('[data-keep=itemIn]', 'Ver Interestelar'); await A.click('form[data-act=addItem] button'); await wait(300);
    await B.click('[data-act=tab][data-v=lists]'); await wait(200);
    ok(scheme + ' lista compartida', (await B.textContent('main')).includes('Interestelar'));
    await B.click('[data-act=toggleItem]'); await wait(300);
    ok(scheme + ' marcado compartido', await A.$('.item.done') !== null);

    // Llamada de voz
    await A.click('[data-act=call]'); await wait(800);
    ok(scheme + ' B recibe llamada', (await B.textContent('#callbar')).includes('te llama'));
    await B.click('[data-act=callAccept]');
    await B.waitForFunction(() => Call.state === 'active', null, { timeout: 8000 }).catch(() => { });
    await A.waitForFunction(() => Call.state === 'active', null, { timeout: 8000 }).catch(() => { });
    const st = await A.evaluate(() => Call._pc && Call._pc.connectionState);
    ok(scheme + ' llamada conectada (' + st + ')', st === 'connected');

    // Escape room jugando en llamada
    await A.click('[data-act=tab][data-v=games]'); await A.click('[data-act=tab][data-v=escape]');
    await A.click('[data-act=erStart]'); await wait(300);
    await B.click('[data-act=tab][data-v=games]'); await B.click('[data-act=tab][data-v=escape]'); await wait(200);
    ok(scheme + ' roles distintos', (await A.textContent('.er-top')).includes('Estudio') && (await B.textContent('.er-top')).includes('Ático'));
    if (scheme === 'light') await A.screenshot({ path: shots + '/04-escape-estudio.png' });
    // A mira el cuadro (pista), B el espejo
    await A.click('[data-v=paintA]'); await wait(100);
    ok(scheme + ' pista del cuadro', (await A.textContent('#pz')).includes('2 _ _ 4'));
    await A.click('[data-act=closeSheet]');
    // B gira a los baúles y abre el cofre
    await B.click('[data-act=erTurn][data-v="1"]');
    await B.click('[data-v=chestB]');
    for (const d of ['1', '2', '3', '4']) await B.click(`.keypad [data-v="${d}"]`);
    await B.click('[data-act=pzTry]'); await wait(200);
    ok(scheme + ' código incorrecto no abre', (await B.$('#pz')) !== null);
    for (const d of ['2', '7', '1', '4']) await B.click(`.keypad [data-v="${d}"]`);
    await B.click('[data-act=pzTry]'); await wait(300);
    ok(scheme + ' cofre abierto en A', await A.evaluate(() => S.couple.escape.chest === true));
    if (scheme === 'light') { await B.click('[data-v=chestB]'); await wait(100); await B.screenshot({ path: shots + '/05-escape-cofre.png' }); await B.click('[data-act=closeSheet]'); }
    // A resuelve el panel
    await A.click('[data-act=erTurn][data-v="1"]'); await A.click('[data-v=panelA]');
    for (const c of ['rojo', 'verde', 'azul', 'amarillo']) await A.click(`.swatches [data-v="${c}"]`);
    await A.click('[data-act=pzTry]'); await wait(300);
    ok(scheme + ' panel resuelto', await B.evaluate(() => S.couple.escape.panel === true));
    // B abre su puerta con la pista del cajón de A
    await B.click('[data-act=erTurn][data-v="-1"]'); await B.click('[data-v=doorB]');
    for (const s of ['sol', 'corazón', 'llave']) await B.click(`.symbols [data-v="${s}"]`);
    await B.click('[data-act=pzTry]'); await wait(300);
    // A abre la suya con la pista del telescopio de B
    await A.click('[data-act=erTurn][data-v="-1"]'); await A.click('[data-v=doorA]');
    if (scheme === 'light') await A.screenshot({ path: shots + '/06-escape-puerta.png' });
    for (const s of ['luna', 'estrella', 'corazón']) await A.click(`.symbols [data-v="${s}"]`);
    await A.click('[data-act=pzTry]'); await wait(400);
    ok(scheme + ' ganaron', (await B.textContent('main')).includes('Escaparon juntos'));
    if (scheme === 'light') await B.screenshot({ path: shots + '/07-escape-ganaron.png' });
    await A.click('[data-act=callHang]'); await wait(500);
    ok(scheme + ' colgaron ambos', await B.evaluate(() => Call.state) === 'idle');

    // ¿Qué prefieres?
    await A.click('[data-act=tab][data-v=games]'); await A.click('[data-act=tab][data-v=would]');
    await B.click('[data-act=tab][data-v=games]'); await B.click('[data-act=tab][data-v=would]');
    await A.click('[data-act=wouldPick][data-v="0"]'); await B.click('[data-act=wouldPick][data-v="0"]'); await wait(300);
    ok(scheme + ' coinciden', (await A.textContent('main')).includes('Coinciden'));

    // Sin desbordamiento horizontal en ninguna pantalla
    for (const t of ['home', 'chat', 'games', 'lists', 'settings', 'escape', 'would']) {
      await A.evaluate(t => { S.tab = t; render(); }, t);
      const over = await A.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      ok(scheme + ' sin desborde ' + t, !over);
    }
    // Datos persisten al recargar (actualización)
    await A.reload(); await wait(500);
    ok(scheme + ' sigue conectado tras recargar', (await A.textContent('.hero .names')).includes('Ella'));

    ok(scheme + ' sin errores de consola', errs.length === 0);
    if (errs.length) console.log(errs);
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails ? fails + ' fallas' : 'TODO OK');
  process.exit(fails ? 1 : 0);
})();
