// Visor 3D en primera persona para los escape rooms ER01–ER10.
// Arma cada zona a partir del diseño (medidas, puertas, luces y posición de cada objeto en metros)
// y reutiliza las texturas, muebles y piezas de "Sin salida". Tocar un objeto abre la misma ficha
// que en la vista 2D (rmObj), así que la lógica del juego es una sola.
'use strict';

const Rooms3D = (function () {
  let K = null, T = null, R = null, raf = 0, lastT = 0, roomId = null, sig = '';
  const keys = {}, look = { yaw: 0, pitch: 0 };
  const joy = { id: null, x0: 0, y0: 0, dx: 0, dy: 0 };
  const drag = { id: null, x: 0, y: 0, t: 0, moved: 0, tap: 0 };

  // ---------- Ambiente de cada zona ----------
  // Se puede fijar en ui/ERxx.json ("rooms3d"); si no, se deduce del nombre de la zona.
  const THEMES = {
    casa: { floor: 'herringbone_parquet', wall: 'painted_plaster_wall', ceil: 'painted_plaster_wall', hdri: 'lythwood_room', light: '#ffe2b8', fog: '#2a1d14', wallTint: '#e6d3ad' },
    altillo: { floor: 'dark_wooden_planks', wall: 'dark_wooden_planks', ceil: 'roof_planks', hdri: 'lythwood_room', light: '#ffe2bd', fog: '#1d140e', wallTint: '#e0d2c4', ceilTint: '#b8a898', decor: 'altillo' },
    biblioteca: { floor: 'dirty_carpet', wall: 'decrepit_wallpaper', ceil: 'rectangular_parquet', hdri: 'lythwood_room', light: '#ffd9a0', fog: '#141812', wallTint: '#b8c4b0', floorTint: '#b05058', decor: 'biblio' },
    piedra: { floor: 'monastery_stone_floor', wall: 'large_sandstone_blocks', ceil: 'stacked_stone_wall', hdri: 'lythwood_room', light: '#ffc98a', fog: '#120e0a', wallTint: '#d9c8a8', ceilTint: '#8a7c68', decor: 'stone', floorRep: 2 },
    madera: { floor: 'dark_wooden_planks', wall: 'wooden_panels', ceil: 'roof_planks', hdri: 'snowy_forest', light: '#ffe0b0', fog: '#1a1410', wallTint: '#c9a888', decor: 'train', wallRep: 1.6 },
    tecnica: { floor: 'concrete_floor_worn_001', wall: 'concrete_panels', ceil: 'painted_plaster_wall', hdri: 'lythwood_room', light: '#e8f2ff', fog: '#10151a', wallTint: '#b4bec6', floorTint: '#a9afb5', ceilTint: '#9aa3aa', decor: 'tech', dim: 0.8, wallRep: 2.4 },
    museo: { floor: 'marble_tiles', wall: 'painted_plaster_wall', ceil: 'painted_plaster_wall', hdri: 'lythwood_room', light: '#fff0d8', fog: '#15130f', wallTint: '#d8d0c2', decor: 'museo', floorRep: 2 },
    calle: { floor: 'cobblestone_floor_08', wall: 'painted_plaster_wall', outdoor: true, hdri: 'snowy_forest', light: '#ffc46b', fog: '#0d1424', sky: '#0d1424', wallTint: '#d9c7a8', floorRep: 2.2, decor: 'calle' },
  };
  function themeFor(s, room) {
    const ui = (s.ui.rooms3d || {})[room.room_id];
    if (ui) return Object.assign({}, THEMES[ui.theme] || THEMES.casa, ui);
    const n = (room.name + ' ' + (room.description || '')).toLowerCase();
    if (/plaza|puerto|barrio|calle|muelle|jard[ií]n|patio|exterior/.test(n)) return THEMES.calle;
    if (/altillo|desv[aá]n|buhardilla/.test(n)) return THEMES.altillo;
    if (/templo|santuario|atrio|c[aá]mara de la arena|cripta|b[oó]veda de piedra/.test(n)) return THEMES.piedra;
    if (/biblioteca|galer[ií]a|retratos|mansi[oó]n|sal[oó]n/.test(n)) return THEMES.biblioteca;
    if (/tren|coche|furg[oó]n|cabina del automotor|caba[nñ]a/.test(n)) return THEMES.madera;
    if (/laboratorio|estaci[oó]n|m[oó]dulo|energ[ií]a|esclusa|invernadero|refugio|transmisor|radio|cabina|b[oó]veda|sala de/.test(n)) return THEMES.tecnica;
    return THEMES.casa;
  }

  // ---------- Sonido ----------
  // Todo sintetizado con WebAudio: efectos al abrir puertas o resolver, y un ambiente suave por tipo de zona.
  const SND = { ctx: null, amb: null, mute: (() => { try { return localStorage.getItem('r3mute') === '1'; } catch (e) { return false; } })() };
  function actx() {
    if (!SND.ctx) { try { SND.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (SND.ctx.state === 'suspended') SND.ctx.resume().catch(() => { });
    return SND.ctx;
  }
  function noiseBuf(a, sec) {
    const b = a.createBuffer(1, a.sampleRate * sec, a.sampleRate), d = b.getChannelData(0);
    let last = 0; for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; } // ruido marrón
    return b;
  }
  function tone(a, out, f, t0, dur, type, vol, f2) {
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function sfx(kind) {
    const a = !SND.mute && actx(); if (!a) return;
    const t = a.currentTime, out = a.destination;
    if (kind === 'solve') [523, 659, 784, 1047].forEach((f, i) => tone(a, out, f, t + i * 0.09, 0.5, 'triangle', 0.18));
    else if (kind === 'door') { tone(a, out, 90, t, 1.1, 'sawtooth', 0.05, 60); tone(a, out, 180, t + 0.15, 0.7, 'triangle', 0.04, 140); }
    else if (kind === 'tap') tone(a, out, 880, t, 0.08, 'sine', 0.06);
  }
  function ambient(theme) {
    ambientStop();
    const a = !SND.mute && actx(); if (!a) return;
    const g = a.createGain(); g.gain.value = 0; g.connect(a.destination);
    g.gain.linearRampToValueAtTime(0.5, a.currentTime + 2);
    const src = a.createBufferSource(); src.buffer = noiseBuf(a, 4); src.loop = true;
    const lp = a.createBiquadFilter(); lp.type = 'lowpass';
    const ng = a.createGain();
    const kind = theme.outdoor ? 'calle' : theme.decor === 'tech' ? 'tecnica' : theme.decor === 'train' ? 'tren' : theme.decor === 'stone' ? 'piedra' : 'casa';
    lp.frequency.value = { calle: 600, tecnica: 300, tren: 220, piedra: 400, casa: 250 }[kind]; ng.gain.value = { calle: 0.12, tecnica: 0.05, tren: 0.16, piedra: 0.1, casa: 0.03 }[kind];
    src.connect(lp).connect(ng).connect(g); src.start();
    const extra = [];
    if (kind === 'tecnica') { const o = a.createOscillator(), og = a.createGain(); o.frequency.value = 60; og.gain.value = 0.015; o.connect(og).connect(g); o.start(); extra.push(o); }
    // Ritmo propio: traqueteo del tren, tic-tac en casas y bibliotecas, pitidos sueltos en zonas técnicas, gotas en piedra
    const beat = { tren: 430, casa: 1000, tecnica: 4200, piedra: 2900, calle: 0 }[kind];
    const iv = beat && setInterval(() => {
      if (SND.mute || !SND.ctx) return;
      const t = a.currentTime;
      if (kind === 'tren') { tone(a, g, 70, t, 0.12, 'square', 0.05); tone(a, g, 70, t + 0.13, 0.12, 'square', 0.04); }
      else if (kind === 'casa') tone(a, g, 2400, t, 0.03, 'square', 0.012);
      else if (kind === 'tecnica') tone(a, g, 1200 + Math.random() * 600, t, 0.12, 'sine', 0.02);
      else if (kind === 'piedra') tone(a, g, 1800 + Math.random() * 900, t, 0.18, 'sine', 0.025, 700);
    }, beat);
    SND.amb = { g, src, extra, iv };
  }
  function ambientStop() {
    const m = SND.amb; SND.amb = null; if (!m) return;
    clearInterval(m.iv);
    try { const a = SND.ctx; m.g.gain.linearRampToValueAtTime(0, a.currentTime + 0.6); setTimeout(() => { try { m.src.stop(); m.extra.forEach(o => o.stop()); m.g.disconnect(); } catch (e) { } }, 800); } catch (e) { }
  }
  const doorWas = {}, solvedSeen = new Set(), fxQueue = [];

  // ---------- Coordenadas ----------
  // El diseño mide desde la esquina suroeste (x al este, z al norte). En la escena el centro de la zona es el origen
  // y el norte queda hacia -z, que es hacia donde mira la cámara al entrar.
  const toW = (room, p) => [p.x - room.dimensions_m.w / 2, p.y || 0, room.dimensions_m.d / 2 - p.z];
  function wallFacing(room, p) {
    const { w, d } = room.dimensions_m;
    const dist = { west: p.x, east: w - p.x, south: p.z, north: d - p.z };
    const k = Object.keys(dist).reduce((a, b) => dist[a] <= dist[b] ? a : b);
    // Rotación para que el frente del objeto mire hacia dentro de la zona
    return { wall: k, dist: dist[k], ry: { north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 }[k] };
  }

  // ---------- Piezas según lo que es cada objeto ----------
  function emojiSprite(emoji, size) {
    const tex = K.canvasTex(128, 128, g => { g.font = '96px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(emoji, 64, 70); });
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(size || 0.35, size || 0.35, 1);
    return sp;
  }
  const icon = o => { try { return rmEmoji(CUR_S, o); } catch (e) { return '❔'; } };
  // Peana del ambiente: madera, piedra, chapa o mármol
  function plinth(h, w) {
    w = w || 0.42;
    const d = CUR_TH.decor, m = d === 'tech' ? (K.pbr('metal_plate_02', [0.5, h], { color: '#9aa4ac' }) || metal('#59636b'))
      : d === 'stone' || d === 'calle' ? (K.pbr('large_sandstone_blocks', [0.4, h * 0.8], { color: '#d9c8a8' }) || K.M('#b9a98a', { roughness: 0.9 }))
      : d === 'museo' ? K.M('#e4dfd4', { roughness: 0.35 }) : wood('#6a4a30', [0.4, h]);
    const g = new T.Group();
    g.add(K.at(K.box(w, h - 0.05, w, m), 0, (h - 0.05) / 2, 0), K.at(K.box(w + 0.07, 0.05, w + 0.07, m), 0, h - 0.025, 0), K.at(K.box(w + 0.07, 0.06, w + 0.07, m), 0, 0.03, 0));
    return g;
  }
  function paper(color, w, h, lines) {
    const tex = K.canvasTex(256, Math.round(256 * h / w), (g, W, H) => {
      g.fillStyle = color; g.fillRect(0, 0, W, H); K.noise(g, W, H, 800, 0.05);
      g.strokeStyle = 'rgba(40,30,20,.35)'; g.lineWidth = 2;
      for (let i = 0; i < (lines || 7); i++) { const y = H * (0.18 + i * 0.1); g.beginPath(); g.moveTo(W * 0.12, y); g.lineTo(W * (0.5 + Math.random() * 0.38), y); g.stroke(); }
    });
    return new T.Mesh(new T.PlaneGeometry(w, h), K.M('#ffffff', { map: tex, roughness: 0.9, side: T.DoubleSide }));
  }
  const metal = c => K.M(c || '#5d6166', { metalness: 0.75, roughness: 0.38 });
  const brass = () => K.M('#b08d3c', { metalness: 0.85, roughness: 0.3 });
  const wood = (c, rep) => K.pbr('dark_wooden_planks', rep || [0.6, 0.6], { color: c || '#c09070' }) || K.M('#5b3a24', { roughness: 0.6 });

  // Cada regla: [expresión sobre nombre y aspecto, constructor, huella en el suelo para chocar]
  const KINDS = [
    [/\bpuerta|portal|portón|escotilla/, 'door'],
    [/estanter|librer[ií]a|vitrina|archivador|fichero|casillero/, 'shelf', [1.0, 0.4]],
    [/armario|taquilla|cuadro el[eé]ctrico|caja de fusibles/, 'cabinet', [0.9, 0.5]],
    [/catalejo|telescopio|anteojo/, 'scope'],
    [/buz[oó]n/, 'mailbox', [0.4, 0.4]],
    [/fuente|pila de agua/, 'fountain', [2.2, 2.2]],
    [/barca|bote|lancha|bal[sa]a/, 'boat', [2.4, 1.0]],
    [/puente/, 'bridge', [3, 1.4]],
    [/fachada/, 'facades'],
    [/caseta|cabina|garita|puesto/, 'booth', [1.6, 1.4]],
    [/palanca|interruptor|aguja/, 'lever', [0.4, 0.4]],
    [/mesa de control|consola|tablero|panel|teclado|cuadro de mandos|pupitre/, 'console', [1.4, 0.8]],
    [/mesa|escritorio|banco de trabajo|mostrador/, 'table', [1.4, 0.8]],
    [/reloj de (caja|pie|pared alto)|relojes de caja|reloj patr[oó]n de pie|gran reloj de pie|caja alta/, 'tallclock', [0.6, 0.45]],
    [/reloj/, 'clock'],
    [/pantalla|monitor|terminal|ordenador|computador|osciloscopio/, 'screen'],
    [/radio|grabadora|gram[oó]fono|transmisor|tocadiscos|altavoz|magnet[oó]fono/, 'radio'],
    [/l[aá]mpara|farol|flexo|linterna|vela|candil|foco/, 'lamp'],
    [/espejo/, 'mirror'],
    [/retrato|cuadro|pintura|l[aá]mina|póster|cartel|plano|mapa|tabl[oó]n|programa|diagrama|pizarra/, 'board'],
    [/libreta|libro|cuaderno|diario|carta|nota|hoja|sobre|catastro|registro|manual|bit[aá]cora|expediente|fotograf/, 'book'],
    [/cofre|ba[uú]l|caja fuerte|caja|maleta|malet[ií]n|cajón|caj[oó]n/, 'chest', [0.7, 0.45]],
    [/silla|sill[oó]n|taburete/, 'chair', [0.6, 0.6]],
    [/banco/, 'bench', [1.5, 0.5]],
    [/planta|maceta|[aá]rbol|flor/, 'plant', [0.5, 0.5]],
    [/estatua|figura|busto|escultura|mu[nñ]eco/, 'statue', [0.6, 0.6]],
    [/barril|bid[oó]n|tanque|dep[oó]sito|tambor|aceitera|botella|frasco|tubo de ensayo|vial/, 'vessel'],
    [/m[aá]quina|generador|motor|reactor|turbina|bomba|compresor|sintetizador/, 'machine', [1.4, 1.0]],
    [/nido|gaviota|p[aá]jaro|pluma/, 'small'],
  ];
  function kindOf(s, o) {
    const forced = ((s.ui.mesh3d || {})[o.object_id]);
    if (forced) return [forced, (KINDS.find(k => k[1] === forced) || [])[2]];
    const n = (o.name + ' ' + o.visual).toLowerCase(), nm = o.name.toLowerCase();
    const k = KINDS.find(k => k[0].test(nm)) || KINDS.find(k => k[0].test(n));
    if (k && k[1] === 'console' && o.position && o.position.y >= 1.25) { // un tablero a la altura de los ojos y junto a una pared es un panel de pared
      const room = s.rooms.find(r => r.room_id === o.room);
      if (room && room.dimensions_m && wallFacing(room, o.position).dist < 0.6) return ['panel', null];
    }
    if (k) return [k[1], k[2]];
    if (o.category !== 'exit' && o.position && o.position.y >= 1.1) { // algo sin pieza propia que cuelga de una pared: una placa con su icono
      const room = s.rooms.find(r => r.room_id === o.room);
      if (room && room.dimensions_m && wallFacing(room, o.position).dist < 0.6) return ['plaque', null];
    }
    return [o.category === 'exit' ? 'door' : 'pedestal', null];
  }
  // ---------- Modelos CC0 por temática (Poly Haven) ----------
  // mdl() usa el modelo si ya está cargado; si no, apunta que falta (goRoom lo carga y reconstruye) y usa la pieza simple.
  const GLB_OK = new Set(), GLB_BAD = new Set(), GLB_MISSING = new Set();
  let CUR_TH = {}, CUR_S = null;
  const tech = () => CUR_TH.decor === 'tech', stone = () => CUR_TH.decor === 'stone', train = () => CUR_TH.decor === 'train';
  function mdl(id, fb, o) {
    if (GLB_OK.has(id)) return K.model(id, fb, o);
    if (!GLB_BAD.has(id)) GLB_MISSING.add(id);
    return fb();
  }
  async function loadMissing() {
    const ids = [...GLB_MISSING]; GLB_MISSING.clear();
    if (!ids.length) return false;
    await K.withTimeout(Promise.all(ids.map(id => K.loadGLB(id).then(g => (g ? GLB_OK : GLB_BAD).add(id)))), 15000).catch(() => { });
    return ids.some(id => GLB_OK.has(id));
  }
  let HIT = null; // material invisible para ampliar la zona de toque
  const B = {
    door() { return K.P.door('#5b3b28'); },
    shelf() { return tech() ? mdl('steel_frame_shelves_01', () => K.P.bookshelfBox(), { h: 1.9 }) : K.model('wooden_bookshelf_worn', () => K.P.bookshelfBox(), { h: 1.9 }); },
    tallclock() { return mdl('vintage_grandfather_clock_01', () => K.at(K.box(0.5, 2, 0.35, wood('#5a3a22')), 0, 1, 0), { h: 2.05 }); },
    cabinet() {
      if (tech()) return mdl('metal_tool_chest', () => B.cabinetBox(), { h: 1.15 });
      return B.cabinetBox();
    },
    cabinetBox() {
      const g = new T.Group(), m = metal('#4b5560');
      g.add(K.at(K.box(0.9, 1.8, 0.45, m), 0, 0.9, 0));
      g.add(K.at(K.box(0.02, 1.6, 0.02, metal('#222')), 0, 0.95, 0.23));
      for (const x of [-0.12, 0.12]) g.add(K.at(K.box(0.03, 0.18, 0.04, brass()), x, 1.0, 0.25));
      return g;
    },
    scope(o) {
      if (/microscop/.test(o.name.toLowerCase())) return mdl('vintage_microscope', () => B.small(), { h: 0.4 });
      const g = new T.Group(), b = brass();
      for (let i = 0; i < 3; i++) { const l = K.cyl(0.015, 0.015, 1.25, K.M('#3a2a1a'), 6); l.position.set(Math.cos(i * 2.1) * 0.22, 0.6, Math.sin(i * 2.1) * 0.22); l.rotation.set(Math.sin(i * 2.1) * 0.18, 0, -Math.cos(i * 2.1) * 0.18); g.add(l); }
      const t = K.cyl(0.05, 0.035, 0.8, b, 16); t.rotation.x = Math.PI / 2 - 0.15; t.position.set(0, 1.25, -0.1); g.add(t);
      return g;
    },
    mailbox() {
      const g = new T.Group(), y = K.M('#e8b81e', { roughness: 0.45, metalness: 0.3 });
      g.add(K.at(K.box(0.42, 0.9, 0.36, y), 0, 0.45, 0), K.at(K.cyl(0.21, 0.21, 0.36, y, 20), 0, 0.9, 0));
      g.children[1].rotation.x = Math.PI / 2;
      g.add(K.at(K.box(0.26, 0.04, 0.02, K.M('#222')), 0, 0.72, 0.19));
      return g;
    },
    fountain() {
      const g = new T.Group(), st = K.pbr('stacked_stone_wall', [2, 0.4], { color: '#bbb' }) || K.M('#9a948a', { roughness: 0.9 });
      g.add(K.at(K.cyl(1.1, 1.15, 0.5, st, 32), 0, 0.25, 0));
      const water = new T.Mesh(new T.CircleGeometry(1.0, 32), K.M('#3a6f8f', { roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.85 }));
      water.rotation.x = -Math.PI / 2; water.position.y = 0.46; g.add(water);
      g.add(K.at(K.cyl(0.18, 0.25, 1.2, st, 16), 0, 0.8, 0), K.at(new T.Mesh(new T.SphereGeometry(0.22, 16, 12), st), 0, 1.5, 0));
      return g;
    },
    boat() {
      const g = new T.Group();
      ['#c0392b', '#2980b9', '#27ae60'].forEach((c, i) => {
        const h = new T.Mesh(new T.CylinderGeometry(0.42, 0.3, 2.0, 12, 1, true, 0, Math.PI), K.M(c, { roughness: 0.6, side: T.DoubleSide }));
        h.rotation.set(0, 0, Math.PI / 2); h.rotation.x = Math.PI / 2; h.rotation.z = Math.PI; h.position.set(0, 0.35, (i - 1) * 0.9); h.rotation.y = Math.PI / 2;
        h.castShadow = true; g.add(h);
      });
      return g;
    },
    bridge() {
      const g = new T.Group(), w = wood('#a07850', [2, 0.4]);
      for (let i = 0; i < 12; i++) g.add(K.at(K.box(1.3, 0.06, 0.24, w), 0, 0.5, -1.4 + i * 0.25));
      for (const x of [-0.65, 0.65]) { g.add(K.at(K.box(0.06, 0.9, 3, w), x, 0.95, 0)); g.add(K.at(K.box(0.12, 1.6, 0.12, w), x, 0.8, -1.5)); }
      return g;
    },
    facades() {
      const g = new T.Group(), cols = ['#c9a27e', '#b7c4a0', '#d8b4a0', '#a9b8c9'];
      for (let i = 0; i < 4; i++) {
        const f = K.box(2.2, 4.2, 0.3, K.pbr('painted_plaster_wall', [1, 2], { color: cols[i] }) || K.M(cols[i]));
        f.position.set(-3.6 + i * 2.4, 2.1, 0); g.add(f);
        for (const yy of [1.2, 2.9]) g.add(K.at(K.box(0.7, 0.9, 0.05, K.M('#2a3440', { roughness: 0.2, metalness: 0.3, emissive: '#ffcf80', emissiveIntensity: 0.25 })), -3.6 + i * 2.4, yy, 0.16));
      }
      return g;
    },
    booth() {
      const g = new T.Group(), w = wood('#9a8070', [1, 1]);
      g.add(K.at(K.box(1.6, 2.3, 1.4, w), 0, 1.15, 0));
      g.add(K.at(K.box(1.8, 0.1, 1.6, K.M('#5a2b2b')), 0, 2.35, 0));
      g.add(K.at(K.box(1.0, 0.6, 0.04, K.M('#1d2a33', { roughness: 0.1, metalness: 0.4 })), 0, 1.5, 0.71));
      for (let i = 0; i < 4; i++) g.add(K.at(K.box(0.06, 0.4, 0.06, i === 3 ? K.M('#b22222') : brass()), -0.45 + i * 0.3, 1.0, 0.75));
      return g;
    },
    lever() {
      const g = new T.Group();
      g.add(K.at(K.box(0.3, 0.12, 0.3, metal('#333')), 0, 0.06, 0));
      const h = K.cyl(0.025, 0.025, 0.9, metal('#7a4a2a'), 8); h.position.set(0, 0.5, 0); h.rotation.x = 0.3; g.add(h);
      g.add(K.at(new T.Mesh(new T.SphereGeometry(0.06, 12, 10), K.M('#b22222')), 0, 0.93, 0.13));
      return g;
    },
    console() {
      if (tech()) {
        const g = mdl('metal_office_desk', () => K.P.table(1.4, 0.8, 0.78, '#555b62'), { w: 1.4 });
        const box = new T.Box3().setFromObject(g), inst = mdl('vintage_spacecraft_instrument', () => B.screen(), { w: 0.7 });
        inst.position.y = box.max.y; g.add(inst);
        return g;
      }
      const g = K.P.table(1.4, 0.8, 0.85, '#6b4a32', 'WoodenTable_01', { w: 1.4 });
      const top = new T.Group(); top.position.y = 0.88; g.add(top);
      for (let i = 0; i < 6; i++) top.add(K.at(K.box(0.05, 0.08, 0.05, brass()), -0.5 + i * 0.2, 0.04, 0.15));
      for (let i = 0; i < 3; i++) { const d = K.cyl(0.06, 0.06, 0.05, brass(), 18); d.position.set(-0.2 + i * 0.16, 0.03, -0.15); top.add(d); }
      return g;
    },
    panel(o) {
      const g = new T.Group(), n = o.object_id.charCodeAt(o.object_id.length - 1);
      g.add(K.box(0.85, 0.6, 0.07, metal('#4a545c')), K.at(K.box(0.79, 0.54, 0.02, K.M('#20262b', { roughness: 0.6, metalness: 0.3 })), 0, 0, 0.035));
      g.add(K.at(K.box(0.3, 0.2, 0.012, K.M('#08140e', { emissive: n % 2 ? '#2bd67b' : '#ffb347', emissiveIntensity: 0.7 })), -0.2, 0.12, 0.05));
      for (let i = 0; i < 8; i++) g.add(K.at(K.box(0.035, 0.035, 0.02, K.M('#111', { emissive: ['#ff5a4d', '#3cff8f', '#ffd24d', '#4db8ff'][(i + n) % 4], emissiveIntensity: 1.1 })), 0.08 + (i % 4) * 0.08, 0.2 - (i >> 2) * 0.09, 0.05));
      for (let i = 0; i < 5; i++) { const k = K.cyl(0.028, 0.028, 0.03, brass(), 12); k.rotation.x = Math.PI / 2; k.position.set(-0.32 + i * 0.16, -0.14, 0.055); g.add(k); }
      return g;
    },
    table() { return tech() ? mdl('metal_office_desk', () => K.P.table(1.4, 0.8, 0.78, '#555b62'), { w: 1.4 }) : K.P.table(1.4, 0.8, 0.85, '#6b4a32', 'WoodenTable_01', { w: 1.4 }); },
    clock() { return K.P.clock('10:10'); },
    screen() {
      const g = new T.Group();
      g.add(K.at(K.box(0.6, 0.4, 0.05, K.M('#1a1a1a', { metalness: 0.4 })), 0, 0.3, 0));
      g.add(K.at(K.box(0.54, 0.34, 0.01, K.M('#0b2a1a', { emissive: '#2bd67b', emissiveIntensity: 0.6 })), 0, 0.3, 0.03));
      g.add(K.at(K.box(0.08, 0.1, 0.08, K.M('#222')), 0, 0.05, 0));
      return g;
    },
    radio(o) {
      if (!/altavoz/.test(o.name.toLowerCase())) return mdl('vintage_radio_transceiver', () => B.radioBox(), { w: 0.5 });
      return B.radioBox();
    },
    radioBox() {
      const g = new T.Group(), w = wood('#9a6a40', [0.4, 0.4]);
      g.add(K.at(K.box(0.5, 0.32, 0.28, w), 0, 0.16, 0));
      g.add(K.at(K.box(0.3, 0.2, 0.01, K.M('#3a3020', { roughness: 0.9 })), -0.06, 0.17, 0.145));
      for (const x of [0.15, 0.2]) { const k = K.cyl(0.025, 0.025, 0.03, brass(), 12); k.rotation.x = Math.PI / 2; k.position.set(x, 0.12, 0.15); g.add(k); }
      return g;
    },
    lamp(o) {
      const n = o.name.toLowerCase();
      if (/candel|vela|pebetero/.test(n)) return mdl('brass_candleholders', () => B.lantern(), { h: 0.45 });
      if (tech() && /l[aá]mpara|foco/.test(n)) return mdl('industrial_wall_lamp', () => B.lantern(), { h: 0.4 });
      if (!tech()) return mdl('vintage_oil_lamp', () => B.lantern(), { h: 0.42 });
      return B.lantern();
    },
    lantern() { return K.model('Lantern_01', () => K.at(K.box(0.14, 0.3, 0.14, brass()), 0, 0.15, 0), { h: 0.38 }); },
    mirror() { return K.model('ornate_mirror_01', () => K.box(0.6, 0.9, 0.04, K.M('#c8d2d8', { metalness: 1, roughness: 0.05 })), { back: true, h: 1.0, shadow: false }); },
    board(o) {
      const n = o.name.toLowerCase();
      if (/retrato|pintura|obra|cuadro(?! de)/.test(n)) return mdl('hanging_picture_frame_01', () => B.boardBox(o), { w: 0.8, back: true });
      return B.boardBox(o);
    },
    boardBox(o) { const p = paper(/azul/.test(o.visual) ? '#9fb8d0' : /corcho/.test(o.visual) ? '#b88a5a' : '#efe3c2', 0.7, 0.5); const f = new T.Group(); f.add(K.at(K.box(0.76, 0.56, 0.03, wood('#7a5530')), 0, 0, -0.02)); p.position.z = 0.0; f.add(p); return f; },
    book(o) {
      const g = new T.Group(), c = /azul/.test(o.visual) ? '#2c4a7a' : /verde/.test(o.visual) ? '#2c5a3a' : '#6a2c2c';
      g.add(K.at(K.box(0.26, 0.04, 0.34, K.M(c, { roughness: 0.8 })), 0, 0.02, 0));
      const p = paper('#f2e8cf', 0.24, 0.32, 6); p.rotation.x = -Math.PI / 2; p.position.y = 0.042; g.add(p);
      return g;
    },
    chest(o) {
      const n = o.name.toLowerCase();
      if (/maleta|malet[ií]n|equipaje/.test(n) || train()) return mdl('vintage_suitcase', () => K.P.chest(), { w: 0.65 });
      if (/cofre|ba[uú]l|arca/.test(n)) return mdl('treasure_chest', () => K.P.chest(), { w: 0.8 });
      return K.P.chest();
    },
    chair() { return K.P.chair('#6b2e2e'); },
    bench() {
      const g = new T.Group(), w = wood('#8a6a55', [1, 0.3]), ir = metal('#222');
      for (let i = 0; i < 4; i++) g.add(K.at(K.box(1.5, 0.04, 0.09, w), 0, 0.45, -0.18 + i * 0.12));
      for (const x of [-0.65, 0.65]) g.add(K.at(K.box(0.05, 0.45, 0.45, ir), x, 0.22, 0));
      return g;
    },
    plant() { return K.P.plant(); },
    statue(o) {
      const n = o.name.toLowerCase();
      if (/busto/.test(n) || !(stone() || /guardi[aá]n|estatua/.test(n))) {
        const g = new T.Group(), st = K.M('#c8c2b6', { roughness: 0.7 });
        g.add(K.at(K.box(0.45, 1.0, 0.45, st), 0, 0.5, 0));
        const b = mdl('marble_bust_01', () => K.at(new T.Mesh(new T.SphereGeometry(0.15, 16, 12), st), 0, 0.15, 0), { h: 0.55 }); b.position.y += 1.0; g.add(b);
        return g;
      }
      return mdl('gothic_statue', () => B.statueBox(), { h: 1.9 });
    },
    statueBox() {
      const g = new T.Group(), st = K.M('#c8c2b6', { roughness: 0.7 });
      g.add(K.at(K.box(0.5, 0.9, 0.5, st), 0, 0.45, 0), K.at(K.cyl(0.14, 0.2, 0.6, st, 16), 0, 1.2, 0), K.at(new T.Mesh(new T.SphereGeometry(0.13, 16, 12), st), 0, 1.6, 0));
      return g;
    },
    vessel(o) {
      const big = /barril|tanque|dep[oó]sito|tambor|bid[oó]n/.test(o.name.toLowerCase());
      if (!big && /vasija|jarr|[aá]nfora|urna|tarro/.test(o.name.toLowerCase())) return mdl('ceramic_vase_01', () => K.at(K.cyl(0.1, 0.14, 0.35, K.M('#a8643c')), 0, 0.17, 0), { h: 0.4 });
      return big ? K.at(K.cyl(0.3, 0.3, 0.9, metal('#6a4a2a'), 18), 0, 0.45, 0) : K.at(K.cyl(0.05, 0.07, 0.22, brass(), 14), 0, 0.11, 0);
    },
    machine() {
      const g = new T.Group(), m = metal('#55606a');
      g.add(K.at(K.box(1.4, 1.3, 1.0, m), 0, 0.65, 0));
      for (let i = 0; i < 3; i++) { const p = K.cyl(0.06, 0.06, 1.0, metal('#8a7a50'), 10); p.position.set(-0.5 + i * 0.5, 1.6, -0.3); g.add(p); }
      g.add(K.at(K.box(0.5, 0.3, 0.02, K.M('#102018', { emissive: '#ffb347', emissiveIntensity: 0.5 })), 0, 0.9, 0.51));
      return g;
    },
    // Lo que no tiene una pieza propia se muestra con su icono, para reconocerlo de un vistazo
    small(o) {
      const g = new T.Group(); g.add(K.at(K.cyl(0.13, 0.15, 0.03, brass(), 20), 0, 0.015, 0));
      const sp = emojiSprite(icon(o), 0.3); sp.position.y = 0.2; g.add(sp);
      return g;
    },
    plaque(o) {
      const g = new T.Group();
      g.add(K.at(K.box(0.44, 0.44, 0.03, wood('#5a3d28', [0.4, 0.4])), 0, 0, 0.015), K.at(K.box(0.38, 0.38, 0.012, K.M('#efe6d2', { roughness: 0.9 })), 0, 0, 0.034));
      const sp = emojiSprite(icon(o), 0.3); sp.position.set(0, 0, 0.07); g.add(sp);
      return g;
    },
    pedestal(o) {
      const g = plinth(0.85);
      const sp = emojiSprite(icon(o), 0.36); sp.position.y = 1.08; g.add(sp);
      return g;
    },
  };
  // Lo que se pone sobre una superficie lleva una base si no hay una mesa debajo
  const SMALL = ['book', 'radio', 'lamp', 'screen', 'clock', 'vessel', 'small', 'chest'];
  const FLOOR = ['tallclock', 'table', 'console', 'shelf', 'cabinet', 'booth', 'machine', 'bench', 'chair', 'plant', 'statue', 'fountain', 'boat', 'bridge', 'mailbox', 'lever', 'scope', 'pedestal', 'door', 'facades'];

  // ---------- Colocación sin superposiciones ----------
  // El diseño da un punto por objeto, pero no su tamaño. Aquí se mide cada pieza ya construida y se reparte la zona:
  // lo de pared se pega a su pared y se desliza por ella, lo de suelo se separa, lo pequeño sube a una mesa cercana
  // (o a un pedestal) y delante de cada puerta queda paso libre. Se calcula con todos los objetos de la zona,
  // también los que aún no se ven, para que nada se mueva cuando aparecen.
  const LAY = {}, FLAT = ['board', 'mirror', 'clock', 'panel', 'plaque'], NOTOP = ['console'];
  function layout(s, room) {
    const key = s.scenario_id + '/' + room.room_id + '/' + GLB_OK.size + '/' + (CUR_TH.decor || '');
    if (LAY[key]) return LAY[key];
    const { w: W, d: D, h: H } = room.dimensions_m, solids = [], kids = [], items = new Map(), b3 = new T.Box3();
    const axisOf = wall => wall === 'north' || wall === 'south' ? 'x' : 'z';
    const snap = it => { // pegado a su pared
      if (it.wall === 'north') it.z = -D / 2 + 0.02 - it.ez0; else if (it.wall === 'south') it.z = D / 2 - 0.02 - it.ez1;
      else if (it.wall === 'west') it.x = -W / 2 + 0.02 - it.ex0; else it.x = W / 2 - 0.02 - it.ex1;
    };
    for (const dr of room.doors || []) {
      const p = toW(room, dr.position), f = wallFacing(room, dr.position), ax = axisOf(f.wall);
      // La caja incluye el paso libre de delante (1,1 m)
      const it = { id: 'door:' + dr.door_id, fixed: true, wall: f.wall, x: p[0], z: p[2], y: 0, ry: f.ry, ey0: 0, ey1: 2.35 };
      const a = 0.72, dp = 1.1;
      if (ax === 'x') { it.ex0 = -a; it.ex1 = a; it.ez0 = f.wall === 'north' ? 0 : -dp; it.ez1 = f.wall === 'north' ? dp : 0; it.z = f.wall === 'north' ? -D / 2 + 0.02 : D / 2 - 0.02; it.x = Math.max(-W / 2 + a, Math.min(W / 2 - a, it.x)); }
      else { it.ez0 = -a; it.ez1 = a; it.ex0 = f.wall === 'west' ? 0 : -dp; it.ex1 = f.wall === 'west' ? dp : 0; it.x = f.wall === 'west' ? -W / 2 + 0.02 : W / 2 - 0.02; it.z = Math.max(-D / 2 + a, Math.min(D / 2 - a, it.z)); }
      solids.push(it); items.set(it.id, it);
    }
    (room.windows || []).forEach((wn, i) => { // ventanas del diseño: fijas, para que nada de pared las tape
      if (!wn.position || CUR_TH.outdoor) return;
      const p = toW(room, wn.position), f = wallFacing(room, wn.position), ax = axisOf(f.wall), a = 0.6;
      const it = { id: 'win:' + i, fixed: true, win: true, wall: f.wall, x: p[0], z: p[2], y: 0, ry: f.ry, ey0: 1.0, ey1: 2.1, ex0: -a, ex1: a, ez0: -a, ez1: a };
      if (ax === 'x') { it.ez0 = f.wall === 'north' ? 0 : -0.12; it.ez1 = f.wall === 'north' ? 0.12 : 0; it.z = f.wall === 'north' ? -D / 2 + 0.01 : D / 2 - 0.01; it.x = Math.max(-W / 2 + a, Math.min(W / 2 - a, it.x)); }
      else { it.ex0 = f.wall === 'west' ? 0 : -0.12; it.ex1 = f.wall === 'west' ? 0.12 : 0; it.x = f.wall === 'west' ? -W / 2 + 0.01 : W / 2 - 0.01; it.z = Math.max(-D / 2 + a, Math.min(D / 2 - a, it.z)); }
      if (solids.some(o => o.fixed && Math.abs(o.x - it.x) < 1.4 && Math.abs(o.z - it.z) < 1.4)) return; // no sobre una puerta
      solids.push(it); items.set(it.id, it);
    });
    const all = s.objects.filter(o => o.room === room.room_id && o.position);
    const kind = new Map(all.map(o => [o.object_id, kindOf(s, o)[0]]));
    for (const o of all) {
      const k = kind.get(o.object_id), m = (B[k] || B.pedestal)(o), p = toW(room, o.position), f = wallFacing(room, o.position);
      const flat = FLAT.includes(k), floor = FLOOR.includes(k);
      let y = floor ? 0 : p[1];
      const it = { id: o.object_id, o, kind: k, wall: f.wall, x: p[0], z: p[2] };
      it.onWall = (f.dist < 0.35 && (y > 0.5 || flat || k === 'cabinet' || k === 'shelf')) || (flat && f.dist < 1.6) || (k === 'door');
      it.wallBound = it.onWall || (floor && f.dist < 0.7);
      if (flat && it.onWall) y = Math.min(Math.max(y, 1.25), H - 0.6);
      if (flat && !it.onWall) { y = 1.3; it.easel = true; }
      it.ry = it.wallBound ? f.ry : f.dist > 1.2 ? Math.atan2(-p[0], -p[2]) : f.ry;
      if (!it.wallBound && !floor) it.ry = Math.round(it.ry / (Math.PI / 2)) * (Math.PI / 2);
      m.position.set(0, 0, 0); m.rotation.y = it.ry; m.updateMatrixWorld(true); b3.setFromObject(m);
      Object.assign(it, { ex0: b3.min.x, ex1: b3.max.x, ez0: b3.min.z, ez1: b3.max.z, ey0: b3.min.y, ey1: b3.max.y });
      if (SMALL.includes(k) && !flat) {
        if (it.onWall) it.ledge = true;
        else if (y > 0.25) it.small = true; // mesa cercana o pedestal: se decide abajo
        else y = 0;
      }
      it.y = y - (floor || it.small || y === 0 ? it.ey0 : 0); // apoyado en su base
      items.set(it.id, it);
    }
    // Lo pequeño sube a la mesa más cercana mientras quepa; el resto va en un pedestal propio
    const tables = [...items.values()].filter(t => t.kind === 'table' && !NOTOP.includes(t.kind));
    for (const t of tables) t.kids = [];
    for (const it of items.values()) {
      if (!it.small) { if (!it.fixed) solids.push(it); continue; }
      const near = tables.map(t => [Math.hypot(t.x - it.x, t.z - it.z), t]).filter(e => e[0] < 1.3).sort((a, b) => a[0] - b[0])[0];
      const t = near && near[1], cap = t && Math.max(1, Math.floor(Math.max(t.ex1 - t.ex0, t.ez1 - t.ez0) / 0.45));
      if (t && t.kids.length < cap) { t.kids.push(it); it.parent = t; kids.push(it); }
      else { it.stand = Math.max(0.75, Math.min(1.0, it.y)); it.y = it.stand - it.ey0; const r = 0.24; it.ex0 = Math.min(it.ex0, -r); it.ex1 = Math.max(it.ex1, r); it.ez0 = Math.min(it.ez0, -r); it.ez1 = Math.max(it.ez1, r); it.base0 = true; solids.push(it); }
    }
    for (const it of solids) if (it.easel) { it.base0 = true; const r = 0.2; it.ez0 = Math.min(it.ez0, -r); it.ez1 = Math.max(it.ez1, r); it.ex0 = Math.min(it.ex0, -r); it.ex1 = Math.max(it.ex1, r); }
    const y0 = it => it.base0 ? 0 : it.y + it.ey0, y1 = it => it.y + it.ey1;
    const clamp = it => {
      if (it.fixed) return;
      if (it.wallBound) snap(it);
      it.x = Math.max(-W / 2 + 0.02 - it.ex0, Math.min(W / 2 - 0.02 - it.ex1, it.x));
      it.z = Math.max(-D / 2 + 0.02 - it.ez0, Math.min(D / 2 - 0.02 - it.ez1, it.z));
    };
    const can = (it, ax) => !it.fixed && (!it.wallBound || axisOf(it.wall) === ax);
    solids.forEach(clamp);
    const G = 0.07; // separación mínima
    for (let n = 0; n < 120; n++) {
      let moved = false;
      for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
        const a = solids[i], b = solids[j];
        if (a.fixed && b.fixed) continue;
        if (y0(a) >= y1(b) - 0.02 || y0(b) >= y1(a) - 0.02) continue;
        const px = Math.min(a.x + a.ex1, b.x + b.ex1) - Math.max(a.x + a.ex0, b.x + b.ex0) + G;
        const pz = Math.min(a.z + a.ez1, b.z + b.ez1) - Math.max(a.z + a.ez0, b.z + b.ez0) + G;
        if (px <= 0 || pz <= 0) continue;
        const okx = can(a, 'x') || can(b, 'x'), okz = can(a, 'z') || can(b, 'z');
        const ax = okx && (!okz || px <= pz) ? 'x' : okz ? 'z' : null;
        if (!ax) continue;
        const pen = ax === 'x' ? px : pz, ca = (ax === 'x' ? a.x + (a.ex0 + a.ex1) / 2 : a.z + (a.ez0 + a.ez1) / 2), cb = (ax === 'x' ? b.x + (b.ex0 + b.ex1) / 2 : b.z + (b.ez0 + b.ez1) / 2);
        const dir = ca < cb || (ca === cb && i < j) ? -1 : 1, ma = can(a, ax), mb = can(b, ax), sh = ma && mb ? 0.5 : 1;
        if (ma) a[ax] += dir * pen * sh; if (mb) b[ax] -= dir * pen * sh;
        moved = true;
      }
      solids.forEach(clamp);
      if (!moved) break;
    }
    // Lo que siga pisándose (paredes llenas, rincones) se lleva al hueco libre más cercano; lo de pared puede cambiar de pared
    const hits = (a, b) => !(y0(a) >= y1(b) - 0.02 || y0(b) >= y1(a) - 0.02) && Math.min(a.x + a.ex1, b.x + b.ex1) - Math.max(a.x + a.ex0, b.x + b.ex0) > -G + 0.01 && Math.min(a.z + a.ez1, b.z + b.ez1) - Math.max(a.z + a.ez0, b.z + b.ez0) > -G + 0.01;
    const free = it => solids.every(o => o === it || !hits(it, o));
    const turn = it => { const e = [it.ez0, it.ez1, -it.ex1, -it.ex0]; it.ex0 = e[0]; it.ex1 = e[1]; it.ez0 = e[2]; it.ez1 = e[3]; it.ry += Math.PI / 2; };
    const WALLS = ['north', 'west', 'south', 'east']; // cada una, la anterior girada 90°
    const size = it => (it.ex1 - it.ex0) * (it.ez1 - it.ez0);
    for (let round = 0; round < 3; round++) {
      const stuck = solids.filter(it => !it.fixed && !free(it)).sort((a, b) => size(a) - size(b));
      if (!stuck.length) break;
      for (const it of stuck) {
        if (free(it)) continue;
        const ox = it.x, oz = it.z, keep = { x: it.x, z: it.z, wall: it.wall, ry: it.ry, e: [it.ex0, it.ex1, it.ez0, it.ez1] };
        let best = null;
        const tryAt = () => { clamp(it); if (free(it)) { const dd = Math.hypot(it.x - ox, it.z - oz); if (!best || dd < best.d) best = { d: dd, x: it.x, z: it.z, wall: it.wall, ry: it.ry, e: [it.ex0, it.ex1, it.ez0, it.ez1] }; } };
        if (it.wallBound) {
          for (let k = 0; k < 4; k++) {
            const len = axisOf(it.wall) === 'x' ? W : D;
            for (let t = -len / 2; t <= len / 2; t += 0.15) { if (axisOf(it.wall) === 'x') it.x = t; else it.z = t; tryAt(); }
            it.wall = WALLS[(WALLS.indexOf(it.wall) + 1) % 4]; turn(it);
          }
        } else for (let gx = -W / 2; gx <= W / 2; gx += 0.2) for (let gz = -D / 2; gz <= D / 2; gz += 0.2) { it.x = gx; it.z = gz; tryAt(); }
        const r = best || keep;
        it.x = r.x; it.z = r.z; it.wall = r.wall; it.ry = r.ry; [it.ex0, it.ex1, it.ez0, it.ez1] = r.e;
      }
    }
    // Si algo de pared solo choca ya con una ventana, la ventana (que es adorno) se quita
    for (const it of solids.filter(x => !x.fixed)) for (const wn of solids.filter(x => x.win)) if (hits(it, wn)) { solids.splice(solids.indexOf(wn), 1); items.delete(wn.id); }
    // Sobre cada mesa, sus piezas en fila a lo largo del tablero
    for (const t of tables) {
      const lx = t.ex1 - t.ex0 >= t.ez1 - t.ez0, len = (lx ? t.ex1 - t.ex0 : t.ez1 - t.ez0) * 0.8, n = t.kids.length;
      const cx = t.x + (t.ex0 + t.ex1) / 2, cz = t.z + (t.ez0 + t.ez1) / 2;
      t.kids.forEach((k, i) => { const off = n > 1 ? (i / (n - 1) - 0.5) * len : 0; k.x = cx + (lx ? off : 0) - (k.ex0 + k.ex1) / 2; k.z = cz + (lx ? 0 : off) - (k.ez0 + k.ez1) / 2; k.y = t.y + t.ey1 - k.ey0 + 0.005; k.ry = t.ry; });
    }
    const box = it => ({ id: it.id, x0: it.x + it.ex0, x1: it.x + it.ex1, z0: it.z + it.ez0, z1: it.z + it.ez1, y0: y0(it), y1: y1(it), parent: it.parent && it.parent.id, fixed: it.fixed });
    return (LAY[key] = { items, boxes: solids.concat(kids).map(box) });
  }
  // Cajas que se pisan en una zona (para las pruebas)
  function overlaps(L) {
    const out = [], b = L.boxes, e = 0.03;
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
      const p = b[i], q = b[j];
      if (p.fixed && q.fixed) continue;
      if (p.parent === q.id || q.parent === p.id) continue;
      if (p.x1 - e > q.x0 && q.x1 - e > p.x0 && p.z1 - e > q.z0 && q.z1 - e > p.z0 && p.y1 - e > q.y0 && q.y1 - e > p.y0) out.push(p.id + '×' + q.id);
    }
    return out;
  }

  // Exteriores: en lugar de paredes, una hilera de casas con ventanas encendidas
  function street(len) {
    const g = new T.Group(), cols = ['#c9a27e', '#b7c4a0', '#d8b4a0', '#a9b8c9', '#e0cf9f', '#c4a3b8'];
    let x = -len / 2, i = 0;
    while (x < len / 2 - 0.1) {
      const w = Math.min(len / 2 - x, 2.2 + ((i * 37) % 10) / 10), h = 4.5 + ((i * 53) % 25) / 10, c = cols[i % cols.length];
      const wall = K.pbr('painted_plaster_wall', [w / 2, h / 2], { color: c }) || K.M(c, { roughness: 0.9 });
      g.add(K.at(K.box(w, h, 0.4, wall), x + w / 2, h / 2, -0.2));
      const roof = K.box(w + 0.1, 0.25, 0.9, K.M('#7a3b2a', { roughness: 0.8 })); roof.position.set(x + w / 2, h, 0.05); roof.rotation.x = -0.35; g.add(roof);
      for (let fy = 1.3; fy < h - 0.8; fy += 1.5) for (let fx = x + 0.55; fx < x + w - 0.4; fx += 0.9) {
        const lit = ((i * 7 + fx * 3 + fy * 5) | 0) % 3 === 0;
        g.add(K.at(K.box(0.5, 0.75, 0.04, K.M(lit ? '#ffd38a' : '#26323d', lit ? { emissive: '#ffb84d', emissiveIntensity: 0.9 } : { roughness: 0.15, metalness: 0.4 })), fx + 0.25, fy, 0.01));
      }
      x += w; i++;
    }
    return g;
  }

  // Detalles de las paredes para que no se vean vacías: zócalo, paneles, tuberías o cuadros
  // Lámpara que corresponde a cada luz del diseño, según el ambiente
  function fixture(th, pos, H, color) {
    const glow = K.M('#fff5dd', { emissive: color, emissiveIntensity: 2 });
    const bulb = () => new T.Mesh(new T.SphereGeometry(0.07, 14, 10), glow);
    if (th.outdoor) { const m = mdl('street_lamp_01', () => null, { h: 3.4, shadow: false }); if (!m) return null; m.position.set(pos.x, 0, pos.z); return m; }
    const g = new T.Group(); g.position.set(pos.x, H, pos.z);
    if (th.decor === 'tech') { g.add(K.at(K.box(1.25, 0.06, 0.2, metal('#c9cfd4')), 0, -0.03, 0), K.at(K.box(1.15, 0.02, 0.14, glow), 0, -0.07, 0)); return g; }
    const id = th.decor === 'train' || th.decor === 'altillo' ? 'hanging_industrial_lamp' : th.decor === 'stone' ? null : 'Chandelier_01';
    const m = id && mdl(id, () => null, { h: id === 'Chandelier_01' ? 0.8 : 0.7, shadow: false });
    if (m) { const b = new T.Box3().setFromObject(m); m.position.y -= b.max.y; g.add(m); g.add(K.at(bulb(), 0, b.min.y - b.max.y + 0.12, 0)); }
    else { g.add(K.at(K.cyl(0.01, 0.01, 0.35, K.M('#222'), 6), 0, -0.17, 0), K.at(bulb(), 0, -0.38, 0)); }
    return g;
  }
  // Mobiliario de ambiente (no se toca): ocupa huecos libres de pared, rincones y suelo sin tapar nada del juego
  const FILL = {
    tech: [['utility_box_01', { h: 0.7 }, 'wall', 1.5, 2], ['korean_fire_extinguisher_01', { h: 0.55 }, 'wall', 0, 1], ['security_camera_01', { h: 0.28 }, 'wall', 2.1, 1], ['steel_frame_shelves_01', { h: 1.9 }, 'wall', 0, 1], ['metal_tool_chest', { h: 1.1 }, 'wall', 0, 1]],
    stone: [['stone_fire_pit', { w: 0.8 }, 'corner', 0, 2], ['ceramic_vase_01', { h: 0.55 }, 'corner', 0, 2], ['gothic_statue', { h: 1.9 }, 'wall', 0, 1]],
    train: [['vintage_suitcase', { w: 0.6 }, 'wall', 0, 2], ['wooden_crate_01', { w: 0.55 }, 'corner', 0, 1]],
    museo: [['marble_bust_01', { h: 0.6 }, 'plinth', 0, 2], ['hanging_picture_frame_01', { w: 0.9, back: true }, 'wall', 1.6, 3], ['potted_plant_01', { h: 1.1 }, 'corner', 0, 2]],
    calle: [['wooden_barrels_01', { w: 1.1 }, 'corner', 0, 2], ['wooden_crate_01', { w: 0.6 }, 'wall', 0, 2]],
    biblio: [['wooden_bookshelf_worn', { h: 1.9 }, 'wall', 0, 3], ['hanging_picture_frame_01', { w: 0.8, back: true }, 'wall', 1.6, 2], ['ArmChair_01', { h: 1.0 }, 'corner', 0, 2], ['ClassicConsole_01', { w: 1.1 }, 'wall', 0, 1]],
    casa: [['GothicCabinet_01', { h: 1.7 }, 'wall', 0, 1], ['ClassicConsole_01', { w: 1.1 }, 'wall', 0, 1], ['hanging_picture_frame_01', { w: 0.8, back: true }, 'wall', 1.6, 2], ['potted_plant_01', { h: 1.0 }, 'corner', 0, 1], ['ArmChair_01', { h: 1.0 }, 'corner', 0, 1]],
    altillo: [['wooden_barrels_01', { w: 1.0 }, 'corner', 0, 1], ['wooden_crate_01', { w: 0.6 }, 'corner', 0, 2], ['vintage_suitcase', { w: 0.6 }, 'wall', 0, 1]],
  };
  const ART = [['#f2c078', '#c9603a', '#3a4a6b'], ['#9cc7d8', '#4f8a6a', '#2f4a3a'], ['#e8d9b0', '#a8743c', '#4a2f25'], ['#c9b6e0', '#6a5a9a', '#2a2a4a']];
  function artwork(n, w, h) { // paisaje sencillo: cielo, sol y colinas
    const c = ART[n % ART.length];
    const tex = K.canvasTex(192, Math.round(192 * h / w), (g, W, H) => {
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, c[0]); gr.addColorStop(1, c[1]); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,245,210,.85)'; g.beginPath(); g.arc(W * (0.25 + 0.5 * ((n * 37) % 10) / 10), H * 0.35, H * 0.12, 0, 7); g.fill();
      for (let k = 0; k < 3; k++) { g.fillStyle = k === 2 ? c[2] : 'rgba(0,0,0,' + (0.12 + k * 0.1) + ')'; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 8) g.lineTo(x, H * (0.62 + k * 0.1) + Math.sin(x / (22 + k * 9) + n + k) * H * 0.07); g.lineTo(W, H); g.fill(); }
      K.noise(g, W, H, 500, 0.05);
    });
    return K.plane(w, h, tex, { roughness: 0.8 });
  }
  function furnish(scene, th, room, L, colliders) {
    const { w: W, d: D } = room.dimensions_m, used = [], b3 = new T.Box3();
    const list = FILL[th.decor] || FILL.casa;
    const hit = (a, g) => L.boxes.concat(used).some(b => a.x1 + g > b.x0 && b.x1 + g > a.x0 && a.z1 + g > b.z0 && b.z1 + g > a.z0 && a.y1 > b.y0 && b.y1 > a.y0);
    const WALL = { north: [0, 0, -1], west: [Math.PI / 2, -1, 0], south: [Math.PI, 0, 1], east: [-Math.PI / 2, 1, 0] };
    let seed = room.room_id.charCodeAt(room.room_id.length - 1) * 7 + Math.round(W * 10);
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    // Alfombra en casas y museos
    if (!th.outdoor && (th.decor === 'museo' || !th.decor) && W > 3.5 && D > 3.5) {
      const rug = new T.Mesh(new T.PlaneGeometry(Math.min(W - 1.6, 4), Math.min(D - 1.6, 3)), K.pbr('dirty_carpet', [2, 1.5], { color: th.decor === 'museo' ? '#7a2f35' : '#8a4a40' }) || K.M('#7a2f35', { roughness: 1 }));
      rug.rotation.x = -Math.PI / 2; rug.position.y = 0.012; rug.receiveShadow = true; scene.add(rug);
    }
    for (const [id, opt, where, y, count] of list) {
      const many = where === 'corner' ? count : count * Math.max(1, Math.round((W + D) / 7));
      for (let n = 0; n < many; n++) {
        const m = mdl(id, () => null, opt); if (!m) break;
        let placed = false;
        const spots = [];
        if (where === 'corner') for (const sx of [-1, 1]) for (const sz of [-1, 1]) spots.push([sx, sz]);
        else for (const wl of Object.keys(WALL)) { const len = wl === 'north' || wl === 'south' ? W : D; for (let t = -len / 2 + 0.5; t <= len / 2 - 0.5; t += 0.35) spots.push([wl, t]); }
        for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
        for (const sp of spots) {
          let ry, x, z;
          if (where === 'corner') { ry = Math.atan2(-sp[0], -sp[1]); m.rotation.y = ry; m.position.set(0, 0, 0); m.updateMatrixWorld(true); b3.setFromObject(m); x = sp[0] * (W / 2 - 0.12) - (sp[0] > 0 ? b3.max.x : b3.min.x); z = sp[1] * (D / 2 - 0.12) - (sp[1] > 0 ? b3.max.z : b3.min.z); }
          else {
            const [r, nx, nz] = WALL[sp[0]]; ry = r; m.rotation.y = ry; m.position.set(0, 0, 0); m.updateMatrixWorld(true); b3.setFromObject(m);
            const off = where === 'plinth' ? 0.25 : 0.03;
            x = nx ? nx * (W / 2 - off) - (nx > 0 ? b3.max.x : b3.min.x) : sp[1]; z = nz ? nz * (D / 2 - off) - (nz > 0 ? b3.max.z : b3.min.z) : sp[1];
          }
          const py = where === 'plinth' ? 1.0 : y;
          const box = { x0: x + b3.min.x, x1: x + b3.max.x, z0: z + b3.min.z, z1: z + b3.max.z, y0: where === 'plinth' ? 0 : py + b3.min.y, y1: py + b3.max.y };
          if (box.x0 < -W / 2 || box.x1 > W / 2 || box.z0 < -D / 2 || box.z1 > D / 2 || hit(box, y > 0.5 ? 0.25 : 0.35)) continue;
          m.position.set(x, py, z); scene.add(m); used.push(box); placed = true;
          if (id === 'hanging_picture_frame_01') { const sz = b3.getSize(new T.Vector3()), a = artwork(used.length + seed, Math.max(sz.x, sz.z) * 0.72, sz.y * 0.72); a.position.set(0, (b3.min.y + b3.max.y) / 2, 0.045); const hd = new T.Group(); hd.add(a); hd.position.set(x, py, z); hd.rotation.y = ry; scene.add(hd); }
          if (where === 'plinth') scene.add(K.at(K.box(0.42, 1.0, 0.42, K.M('#d8d2c6', { roughness: 0.6 })), (box.x0 + box.x1) / 2, 0.5, (box.z0 + box.z1) / 2));
          if (id === 'stone_fire_pit') { const fl = new T.Mesh(new T.ConeGeometry(0.16, 0.42, 10), K.M('#ffb040', { emissive: '#ff7a1a', emissiveIntensity: 2.2, transparent: true, opacity: 0.9 })); fl.position.set((box.x0 + box.x1) / 2, box.y1 + 0.12, (box.z0 + box.z1) / 2); scene.add(fl); }
          if (box.y0 < 0.6) colliders.push({ x: (box.x0 + box.x1) / 2, z: (box.z0 + box.z1) / 2, w: Math.max(0.2, box.x1 - box.x0 - 0.1), d: Math.max(0.2, box.z1 - box.z0 - 0.1) });
          break;
        }
        if (!placed) break;
      }
    }
    return used;
  }
  function decorate(scene, th, W, D, H, boxes) {
    const v = new T.Vector3(), busy = (g, px, py) => { v.set(px, py, 0.1); g.updateMatrixWorld(true); g.localToWorld(v); return (boxes || []).some(b => v.x > b.x0 - 0.5 && v.x < b.x1 + 0.5 && v.z > b.z0 - 0.5 && v.z < b.z1 + 0.5 && py > b.y0 - 0.35 && py < b.y1 + 0.35); };
    const walls = [[W, 0, -D / 2, 0], [W, 0, D / 2, Math.PI], [D, -W / 2, 0, Math.PI / 2], [D, W / 2, 0, -Math.PI / 2]];
    for (const [len, x, z, ry] of walls) {
      const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
      if (th.decor === 'tech') {
        g.add(K.at(K.box(len, 0.9, 0.03, K.pbr('metal_plate_02', [len / 1.2, 0.75], { color: '#8d979f' }) || K.M('#3d464e', { metalness: 0.5, roughness: 0.45 })), 0, 0.45, 0.02));
        g.add(K.at(K.cyl(0.04, 0.04, len, metal('#7d868d'), 10), 0, H - 0.25, 0.12)); g.children[1].rotation.z = Math.PI / 2;
        for (let px = -len / 2 + 0.9; px < len / 2 - 0.5; px += 1.6) {
          if (busy(g, px, 1.75)) continue;
          g.add(K.at(K.box(0.7, 0.45, 0.04, K.M('#59636b', { metalness: 0.6, roughness: 0.35 })), px, 1.75, 0.03));
          g.add(K.at(K.box(0.08, 0.03, 0.02, K.M('#111', { emissive: (px * 10 | 0) % 2 ? '#3cff8f' : '#ffb84d', emissiveIntensity: 1.2 })), px + 0.25, 1.9, 0.06));
        }
      } else if (th.decor === 'train') { // portaequipajes de latón a lo largo del coche
        const r = K.cyl(0.018, 0.018, len, brass(), 8); r.rotation.z = Math.PI / 2; r.position.set(0, H - 0.55, 0.22); g.add(r);
        for (let px = -len / 2 + 0.4; px < len / 2; px += 1.2) g.add(K.at(K.box(0.02, 0.02, 0.22, brass()), px, H - 0.55, 0.11));
      } else if (!th.decor || th.decor === 'museo' || th.decor === 'biblio') {
        g.add(K.at(K.box(len, 0.06, 0.03, K.M('#3b2a1f', { roughness: 0.6 })), 0, 0.95, 0.02));
      }
    }
  }

  // ---------- Construcción de una zona ----------
  function build(s, c, room, role) {
    const th = themeFor(s, room), { w: W, d: D, h: H } = room.dimensions_m;
    CUR_TH = th; CUR_S = s;
    const scene = new T.Scene();
    scene.background = new T.Color(th.sky || th.fog);
    scene.fog = new T.Fog(th.fog, Math.max(W, D) * 0.6, Math.max(W, D) * 1.8 + 6);
    const mat = (id, rep, tint, alt) => K.pbr(id, rep, tint ? { color: tint } : {}) || K.M(alt || '#8a7a6a', { roughness: 0.85 });
    const floor = new T.Mesh(new T.PlaneGeometry(W, D), mat(th.floor, [W / (th.floorRep || 2.5), D / (th.floorRep || 2.5)], th.floorTint, '#6b4a32'));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    if (!th.outdoor) {
      const ceil = new T.Mesh(new T.PlaneGeometry(W, D), mat(th.ceil, [W / 3, D / 3], th.ceilTint || '#f2ece2', '#ddd'));
      ceil.rotation.x = Math.PI / 2; ceil.position.y = H; scene.add(ceil);
    }
    const wallH = th.outdoor ? Math.max(H, 4) : H;
    for (const [len, x, z, ry] of [[W, 0, -D / 2, 0], [W, 0, D / 2, Math.PI], [D, -W / 2, 0, Math.PI / 2], [D, W / 2, 0, -Math.PI / 2]]) {
      if (th.outdoor) { const f = street(len); f.position.set(x, 0, z); f.rotation.y = ry; scene.add(f); continue; }
      const m = new T.Mesh(new T.PlaneGeometry(len, wallH), mat(th.wall, [len / (th.wallRep || 3), wallH / (th.wallRep || 2.5)], th.wallTint, '#c9b48f'));
      m.position.set(x, wallH / 2, z); m.rotation.y = ry; m.receiveShadow = true; scene.add(m);
      if (!th.outdoor) { const b = K.box(len, 0.14, 0.03, K.M('#2b1d14', { roughness: 0.6 })); b.position.set(x * 0.998, 0.07, z * 0.998); b.rotation.y = ry; scene.add(b); }
    }
    if (th.outdoor) { // estrellas
      const g = new T.BufferGeometry(), pts = [];
      for (let i = 0; i < 400; i++) { const a = Math.random() * Math.PI * 2, e = 0.15 + Math.random() * 1.2, r = 40; pts.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
      g.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
      scene.add(new T.Points(g, new T.PointsMaterial({ color: '#ffffff', size: 0.15, fog: false })));
    }

    // Luces del diseño (como mucho tres; la primera da sombras)
    const hemi = new T.HemisphereLight('#ffffff', '#3a2a1a', (th.outdoor ? 0.35 : 0.5) * (th.dim || 1)); scene.add(hemi);
    const lights = (room.lighting || []).slice(0, 3);
    if (!lights.length) lights.push({ position: { x: W / 2, y: H - 0.4, z: D / 2 }, color: th.light, intensity: 0.8 });
    lights.forEach((l, i) => {
      const pl = new T.PointLight(l.color || th.light, (10 + 30 * Math.min(1, l.intensity || 0.6) * Math.max(1, Math.max(W, D) / 8)) * (th.dim || 1), Math.max(W, D) * 1.6, 1.4);
      const p = toW(room, l.position); pl.position.set(p[0], Math.min(p[1], (th.outdoor ? 6 : H) - 0.3), p[2]);
      if (i === 0) { pl.castShadow = true; pl.shadow.mapSize.set(1024, 1024); pl.shadow.bias = -0.002; }
      scene.add(pl);
      const fx = fixture(th, pl.position, H, l.color || th.light);
      if (fx) scene.add(fx);
    });

    // Puertas y objetos, ya repartidos por layout()
    const interact = [], colliders = [], byId = {}, anims = [], L = layout(s, room);
    HIT = HIT || new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
    for (const dr of room.doors || []) {
      const m = B.door(), it = L.items.get('door:' + dr.door_id);
      m.position.set(it.x, 0, it.z); m.rotation.y = it.ry;
      const open = (dr.opens_when || []).every(tk => c.T.has(tk));
      const dk = room.room_id + dr.door_id, was = doorWas[dk];
      doorWas[dk] = open;
      if (open && was === false) {
        const pv = m.userData.pivot; pv.rotation.y = 0;
        anims.push({ d: 1.3, f: k => { pv.rotation.y = -1.35 * (1 - Math.pow(1 - k, 3)); } });
        sfx('door');
      } else if (open) m.userData.pivot.rotation.y = -1.35;
      scene.add(m);
      const label = dr.to === 'EXIT' ? 'Salida' : 'Puerta a ' + ((s.rooms.find(r => r.room_id === dr.to) || {}).name || 'otra zona');
      K.tag(m, 'door:' + dr.door_id, label); interact.push(m);
      byId['door:' + dr.door_id] = { door: dr, mesh: m };
    }
    const prop = K.M('#4a3a2c', { roughness: 0.7 });
    for (const o of Rooms.objectsIn(s, c, room.room_id)) {
      const it = L.items.get(o.object_id);
      if (!it) continue;
      const m = (B[it.kind] || B.pedestal)(o);
      m.position.set(it.x, it.y, it.z); m.rotation.y = it.ry;
      scene.add(m);
      const cx = it.x + (it.ex0 + it.ex1) / 2, cz = it.z + (it.ez0 + it.ez1) / 2;
      if (it.stand) { // pedestal propio
        const st = plinth(it.stand);
        st.position.set(it.x, 0, it.z); scene.add(st); K.tag(st, o.object_id, o.name); interact.push(st);
      }
      if (it.easel) { // caballete para lo plano que no está en una pared
        const st = new T.Group(), yb = it.y + it.ey0;
        st.add(K.at(K.box(0.05, yb + 0.1, 0.05, prop), 0, (yb + 0.1) / 2, -0.05), K.at(K.box(0.5, 0.04, 0.3, prop), 0, 0.02, 0), K.at(K.box(0.5, 0.03, 0.08, prop), 0, yb - 0.015, 0));
        st.position.set(it.x, 0, it.z); st.rotation.y = it.ry; scene.add(st);
      }
      if (it.ledge) { // repisa bajo lo pequeño que cuelga de una pared
        const lg = K.box(Math.max(0.3, it.ex1 - it.ex0 + 0.1), 0.03, Math.max(0.2, it.ez1 - it.ez0 + 0.06), prop);
        lg.position.set(cx, it.y + it.ey0 - 0.016, cz); scene.add(lg);
      }
      // Zona de toque: una caja invisible del tamaño de la pieza (más generosa en lo pequeño), para que también
      // lo fino o con huecos (un catalejo, una estantería) responda al tocarlo
      {
        const pad = it.ex1 - it.ex0 < 0.5 && it.ez1 - it.ez0 < 0.5 ? 0.12 : 0;
        const hb = new T.Mesh(new T.BoxGeometry(Math.max(0.42, it.ex1 - it.ex0 + pad), Math.max(0.4, it.ey1 - it.ey0 + pad), Math.max(pad ? 0.42 : 0.1, it.ez1 - it.ez0 + pad)), HIT);
        hb.position.set(cx, it.y + (it.ey0 + it.ey1) / 2, cz); scene.add(hb); K.tag(hb, o.object_id, o.name); interact.push(hb);
      }
      K.tag(m, o.object_id, o.name); interact.push(m);
      const base = it.base0 ? 0 : it.y + it.ey0;
      if (base < 0.7 && !it.parent && it.kind !== 'door') colliders.push({ x: cx, z: cz, w: Math.max(0.2, it.ex1 - it.ex0 - 0.1), d: Math.max(0.2, it.ez1 - it.ez0 - 0.1) });
      byId[o.object_id] = { o, mesh: m, it, c: new T.Vector3(cx, it.y + (it.ey0 + it.ey1) / 2, cz), top: it.y + it.ey1 };
    }
    for (const it of L.items.values()) if (it.win) { // ventana con marco y noche fuera
      const g = new T.Group(), fr = K.M('#3b2a1f', { roughness: 0.6 });
      g.add(K.at(K.box(1.2, 1.1, 0.04, K.M('#0c1626', { roughness: 0.15, metalness: 0.4, emissive: '#1b2f55', emissiveIntensity: 0.5 })), 0, 1.55, 0.02));
      g.add(K.at(K.box(1.3, 0.07, 0.1, fr), 0, 2.12, 0.05), K.at(K.box(1.3, 0.09, 0.14, fr), 0, 0.98, 0.07), K.at(K.box(0.07, 1.2, 0.1, fr), -0.62, 1.55, 0.05), K.at(K.box(0.07, 1.2, 0.1, fr), 0.62, 1.55, 0.05), K.at(K.box(0.04, 1.1, 0.06, fr), 0, 1.55, 0.05));
      g.position.set(it.x, 0, it.z); g.rotation.y = it.ry; scene.add(g);
    }
    const extra = furnish(scene, th, room, L, colliders);
    if (!th.outdoor) decorate(scene, th, W, D, H, L.boxes.concat(extra));
    // Luz ambiental con HDRI
    const hdr = K.hdr(th.hdri);
    if (hdr && R) {
      R.pmrem = R.pmrem || new T.PMREMGenerator(R.renderer);
      R.envs = R.envs || {};
      R.envs[th.hdri] = R.envs[th.hdri] || R.pmrem.fromEquirectangular(hdr).texture;
      scene.environment = R.envs[th.hdri];
      hemi.intensity *= 0.5;
      scene.traverse(x => { if (x.isMesh) for (const mm of [].concat(x.material)) if ('envMapIntensity' in mm) mm.envMapIntensity = th.outdoor ? 0.25 : 0.4; });
    }
    const markers = new T.Group(); scene.add(markers);
    return { scene, interact, colliders, byId, markers, room, th, W, D, anims };
  }

  // Signos de "aquí hay algo nuevo" encima de los objetos
  function burst(mesh) {
    const box = new T.Box3().setFromObject(mesh), cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, top = box.max.y;
    const g = new T.Group(), mat = new T.SpriteMaterial({ color: 0xffd36b, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
    const parts = [];
    for (let i = 0; i < 26; i++) {
      const sp = new T.Sprite(mat.clone()); sp.scale.setScalar(0.06 + Math.random() * 0.06);
      const a = Math.random() * Math.PI * 2, r = 0.1 + Math.random() * 0.35;
      sp.position.set(cx + Math.cos(a) * r, top * 0.6 + Math.random() * 0.3, cz + Math.sin(a) * r);
      parts.push({ sp, vy: 0.6 + Math.random() * 1.1, a }); g.add(sp);
    }
    const light = new T.PointLight(0xffc86b, 0, 4); light.position.set(cx, top + 0.3, cz); g.add(light);
    R.scene.add(g);
    R.anims.push({ d: 1.8, f: k => {
      light.intensity = 6 * Math.sin(Math.PI * Math.min(1, k * 1.6));
      for (const p of parts) { p.sp.position.y += p.vy * 0.016; p.sp.position.x += Math.cos(p.a) * 0.004; p.sp.position.z += Math.sin(p.a) * 0.004; p.sp.material.opacity = 1 - k; }
      if (k >= 1) R.scene.remove(g);
    } });
  }
  // Acertijos recién resueltos: sonido, aviso y destello en sus objetos si están en esta zona
  function solvedFx(s, st) {
    const fresh = Object.keys(st.solved || {}).filter(id => !solvedSeen.has(id));
    fresh.forEach(id => solvedSeen.add(id));
    // La primera vez en cada partida solo se toma nota de lo ya resuelto
    if (solvedFx.primed !== st.startedAt) { solvedFx.primed = st.startedAt; return; }
    for (const id of fresh) {
      const p = s.puzzles.find(x => x.puzzle_id === id); if (!p) continue;
      sfx('solve'); vibrate(80); msg('✅ ' + p.name + (p.on_solve && p.on_solve.message ? '. ' + p.on_solve.message : ''), 5000);
      const ids = new Set((p.required_objects || []).concat(s.objects.filter(o => o.puzzle === id).map(o => o.object_id)));
      ids.forEach(o => fxQueue.push(o));
    }
  }
  function flushFx() {
    while (fxQueue.length) { const id = fxQueue.shift(), b = R.byId[id]; if (b && b.mesh) burst(b.mesh); }
  }
  function refreshMarkers(s, st, c, role) {
    R.markers.clear();
    for (const id in R.byId) {
      const b = R.byId[id];
      if (!b.o) continue;
      const fresh = Rooms.nextAction(s, c, b.o, role) >= 0 || Rooms.cluesAt(s, c, st, b.o, role).length;
      if (!fresh) continue;
      const box = new T.Box3().setFromObject(b.mesh), sp = emojiSprite('❗', 0.32);
      sp.position.set((box.min.x + box.max.x) / 2, box.max.y + 0.3, (box.min.z + box.max.z) / 2);
      R.markers.add(sp);
    }
  }

  // ---------- Interfaz ----------
  function hud() {
    let el = document.getElementById('e3');
    if (el) el.remove();
    el = document.createElement('div');
    el.id = 'e3';
    el.innerHTML = '<div class="e3-top"><button class="e3-btn" data-act="r3Exit" aria-label="Salir del 3D">✕</button><div class="e3-title"><b id="e3Name"></b><span id="e3Time"></span></div>' +
      '<button class="e3-btn" data-act="r3Notes" aria-label="Pistas y objetivos">📓</button><button class="e3-btn" data-act="call" aria-label="Llamar">📞</button></div>' +
      '<div id="e3Danger" class="e3-danger"></div><div class="e3-cross"></div><button id="e3Prompt" class="e3-prompt" data-act="r3Use" hidden></button>' +
      '<div id="r3Bar" class="r3-bar"></div>' +
      '<div id="e3Joy" class="e3-joy"><div class="e3-knob"></div></div><div id="e3Hint" class="e3-hint">Arrastra para mirar · usa el círculo para caminar · toca los objetos (❗ = algo nuevo)</div>' +
      '<div id="e3Msg" class="e3-msg" hidden></div><canvas id="r3Map" class="r3-map" width="84" height="84" aria-hidden="true"></canvas>';
    document.body.appendChild(el);
    return el;
  }
  function msg(t, ms) {
    const el = document.getElementById('e3Msg');
    if (!el) return;
    el.textContent = t; el.hidden = false;
    clearTimeout(msg.tm); msg.tm = setTimeout(() => { el.hidden = true; }, ms || 3000);
  }
  function onResize() {
    if (!R) return;
    R.camera.aspect = innerWidth / innerHeight; R.camera.updateProjectionMatrix();
    R.renderer.setSize(innerWidth, innerHeight);
  }
  function bindControls(canvas) {
    const joyEl = document.getElementById('e3Joy'), knob = joyEl.firstChild;
    const inJoyZone = (x, y) => x < innerWidth * 0.45 && y > innerHeight * 0.55;
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' && joy.id === null && inJoyZone(e.clientX, e.clientY)) {
        joy.id = e.pointerId; joy.x0 = e.clientX; joy.y0 = e.clientY; joy.dx = joy.dy = 0;
        joyEl.style.left = (e.clientX - 60) + 'px'; joyEl.style.top = (e.clientY - 60) + 'px'; joyEl.classList.add('on');
        return;
      }
      if (drag.id === null) { drag.id = e.pointerId; drag.x = e.clientX; drag.y = e.clientY; drag.t = performance.now(); drag.moved = 0; }
    });
    canvas.addEventListener('pointermove', e => {
      if (e.pointerId === joy.id) {
        let dx = e.clientX - joy.x0, dy = e.clientY - joy.y0; const l = Math.hypot(dx, dy);
        if (l > 50) { dx *= 50 / l; dy *= 50 / l; }
        joy.dx = dx / 50; joy.dy = dy / 50; knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      } else if (e.pointerId === drag.id) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
        look.yaw -= dx * 0.0045; look.pitch = Math.max(-1.2, Math.min(1.2, look.pitch - dy * 0.0045));
      }
    });
    const up = e => {
      if (e.pointerId === joy.id) { joy.id = null; joy.dx = joy.dy = 0; knob.style.transform = ''; joyEl.classList.remove('on'); }
      else if (e.pointerId === drag.id) {
        drag.id = null;
        // Se abre en el click que llega tras el toque, para que ese click no cierre la ficha recién abierta
        if (e.type === 'pointerup' && drag.moved < 14 && performance.now() - drag.t < 450) { const x = e.clientX, y = e.clientY; clearTimeout(drag.tap); drag.tap = setTimeout(() => { drag.tap = 0; tapAt(x, y); }, 450); }
      }
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('click', e => { if (drag.tap) { clearTimeout(drag.tap); drag.tap = 0; tapAt(e.clientX, e.clientY); } });
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  }
  function kd(e) { keys[e.key.toLowerCase()] = true; }
  function ku(e) { keys[e.key.toLowerCase()] = false; }
  function pick(x, y, loose) {
    const rc = new T.Raycaster(), v = new T.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    rc.setFromCamera(v, R.camera);
    const hit = rc.intersectObjects(R.interact, true)[0];
    if (hit) return { id: hit.object.userData.id, label: hit.object.userData.label, dist: hit.distance };
    if (!loose) return null;
    // Toque impreciso: lo interactivo más cercano al dedo (hasta 56 px) que esté delante y a la vista
    let best = null, bd = 56;
    for (const id in R.byId) {
      const b = R.byId[id]; if (!b.c) continue;
      const q = b.c.clone().project(R.camera); if (q.z > 1) continue;
      const d = Math.hypot((q.x + 1) / 2 * innerWidth - x, (1 - q.y) / 2 * innerHeight - y), dist = b.c.distanceTo(R.camera.position);
      if (d < bd && dist < 4.2) { bd = d; best = { id, label: b.o.name, dist }; }
    }
    return best;
  }
  function tapAt(x, y) {
    if (document.getElementById('sheet')) return;
    const h = pick(x, y, true);
    if (!h) return;
    if (h.dist > 4.2) return msg('Acércate más para examinar: ' + h.label);
    interact(h.id);
  }
  function interact(id) {
    if (String(id).startsWith('door:')) {
      const b = R.byId[id], st = rmState(), s = rmScenario(st), c = rmCompute(st), role = myRole();
      const to = b.door.to;
      if (to === 'EXIT') return msg(Rooms.won(s, c) ? '¡Salieron!' : 'La salida sigue cerrada. Completen los objetivos.');
      const mine = Rooms.myRooms(s, c, role);
      if (mine.find(r => r.room_id === to)) return goRoom(to);
      const target = s.rooms.find(r => r.room_id === to);
      return msg(target && !target.access[role] ? 'Esa zona es de ' + partnerName() + '. Tú no puedes entrar.' : 'Esta puerta todavía está cerrada.');
    }
    return ACTS.rmObj({ dataset: { v: id } });
  }
  function move(dt) {
    if (R.over) return;
    let f = 0, sd = 0;
    if (keys.w || keys.arrowup) f += 1; if (keys.s || keys.arrowdown) f -= 1;
    if (keys.a || keys.arrowleft) sd -= 1; if (keys.d || keys.arrowright) sd += 1;
    f -= joy.dy; sd += joy.dx;
    const l = Math.hypot(f, sd);
    if (l > 1) { f /= l; sd /= l; }
    const sp = 2.3 * dt, cam = R.camera.position;
    const nx = cam.x + (-Math.sin(look.yaw) * f + Math.cos(look.yaw) * sd) * sp;
    const nz = cam.z + (-Math.cos(look.yaw) * f - Math.sin(look.yaw) * sd) * sp;
    const lx = R.W / 2 - 0.35, lz = R.D / 2 - 0.35, r = 0.3;
    const blocked = (x, z) => R.colliders.some(b => Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r);
    if (!blocked(nx, cam.z)) cam.x = Math.max(-lx, Math.min(lx, nx));
    if (!blocked(cam.x, nz)) cam.z = Math.max(-lz, Math.min(lz, nz));
    R.bob = (R.bob || 0) + l * dt * 9;
    cam.y = 1.6 + (l > 0.05 ? Math.sin(R.bob) * 0.025 : 0);
    R.camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
  }
  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (!R || !R.scene) return;
    const dt = Math.min(0.05, (t - (lastT || t)) / 1000); lastT = t;
    move(dt);
    if (R.anims && R.anims.length) R.anims = R.anims.filter(a => { a.t = (a.t || 0) + dt; const k = Math.min(1, a.t / a.d); a.f(k); return k < 1; });
    quality(dt);
    R.markers.children.forEach((m, i) => { m.position.y += Math.sin(t / 300 + i) * 0.0015; });
    if (t - (R.pt || 0) > 150) {
      R.pt = t;
      const h = pick(innerWidth / 2, innerHeight / 2), pr = document.getElementById('e3Prompt');
      if (pr) { if (h && h.dist < 4.2) { pr.textContent = '👆 ' + h.label; pr.dataset.v = h.id; pr.hidden = false; } else pr.hidden = true; }
      minimap();
    }
    R.renderer.render(R.scene, R.camera);
  }
  // Calidad automática: mide los primeros segundos y, si va lento, quita sombras y baja la resolución
  const Q = { t: 0, n: 0, level: (() => { try { return +localStorage.getItem('r3q') || 0; } catch (e) { return 0; } })() };
  function applyQuality() {
    if (!R) return;
    R.renderer.setPixelRatio(Q.level >= 2 ? 0.75 : Q.level >= 1 ? 1 : Math.min(devicePixelRatio || 1, 1.5));
    R.renderer.setSize(innerWidth, innerHeight);
    if (R.scene) R.scene.traverse(o => { if (o.isLight && o.castShadow && Q.level >= 1) o.castShadow = false; });
    R.renderer.shadowMap.needsUpdate = true;
  }
  function quality(dt) {
    if (Q.level >= 2 || !dt) return;
    Q.t += dt; Q.n++;
    if (Q.t < 3) return;
    const fps = Q.n / Q.t; Q.t = 0; Q.n = 0;
    if (fps < 24) { Q.level++; try { localStorage.setItem('r3q', Q.level); } catch (e) { } applyQuality(); }
  }
  // Minimapa de la zona: paredes, puertas, objetos (dorados si tienen ❗) y tú con tu dirección
  function minimap() {
    const cv = document.getElementById('r3Map'); if (!cv || !R.room) return;
    const { w, d } = R.room.dimensions_m, S2 = 84, k = S2 / Math.max(w, d), ox = (S2 - w * k) / 2, oz = (S2 - d * k) / 2;
    const g = cv.getContext('2d'); g.clearRect(0, 0, S2, S2);
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(ox, oz, w * k, d * k);
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1.5; g.strokeRect(ox, oz, w * k, d * k);
    const P = (x, z) => [ox + (x + w / 2) * k, oz + (z + d / 2) * k];
    const hot = R.markers.children.map(m => m.position);
    for (const id in R.byId) {
      const b = R.byId[id], q = b.mesh.position, [x, y] = P(q.x, q.z);
      const isHot = hot.some(h => Math.abs(h.x - q.x) < 0.6 && Math.abs(h.z - q.z) < 0.6);
      g.fillStyle = b.door ? '#7fd1ff' : isHot ? '#ffcc33' : 'rgba(255,255,255,.55)';
      g.beginPath(); g.arc(x, y, b.door ? 3.2 : isHot ? 3 : 2, 0, 7); g.fill();
    }
    const [px, pz] = P(R.camera.position.x, R.camera.position.z);
    g.save(); g.translate(px, pz); g.rotate(-look.yaw); g.fillStyle = '#ff5a7a';
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 4); g.lineTo(-4, 4); g.closePath(); g.fill(); g.restore();
  }
  ACTS.r3Snd = () => {
    SND.mute = !SND.mute; try { localStorage.setItem('r3mute', SND.mute ? '1' : '0'); } catch (e) { }
    if (SND.mute) ambientStop(); else if (R && R.th) ambient(R.th);
    hudTick();
  };
  // Barra inferior: votaciones abiertas y otras zonas
  function hudTick() {
    const st = rmState();
    if (!R || !st.startedAt || !window.ROOMS_DATA[st.id]) return api.close();
    const s = rmScenario(st), c = rmCompute(st), role = myRole();
    const n = document.getElementById('e3Name'), tm = document.getElementById('e3Time'), bar = document.getElementById('r3Bar'), dg = document.getElementById('e3Danger');
    if (!n) return;
    n.textContent = R.room.name;
    const e = Rooms.elapsed(st), left = s.fail_condition.minutes * 60000 - e;
    tm.textContent = st.paused ? '⏸ Pausa' : st.noTimer ? E.mmss(e) : E.mmss(Math.max(0, left));
    tm.className = !st.noTimer && left < 120000 ? 'urgent' : '';
    dg.textContent = s.objectives.filter(o => o.required && Rooms.objectiveDone(s, c, o.objective_id)).length + ' de ' + s.objectives.filter(o => o.required).length + ' objetivos';
    const votes = s.puzzles.filter(p => p.answer.type === 'decision' && p.validation.input_by.includes(role) && Rooms.puzzleStatus(s, c, st, p).status === 'ready');
    const rooms = Rooms.myRooms(s, c, role);
    const h = votes.map(p => '<button class="e3-pill" data-act="r3Vote" data-v="' + p.puzzle_id + '">🗳️ ' + esc(p.name) + '</button>').join('') +
      (rooms.length > 1 ? '<button class="e3-pill" data-act="r3Rooms">🗺️ Zonas (' + rooms.length + ')</button>' : '') +
      (Rooms.helpClues(s, c, role).length ? '<button class="e3-pill" data-act="r3Notes">💡 Ayuda</button>' : '') +
 '<button class="e3-pill" data-act="r3List">📋 Objetos</button>' +
      '<button class="e3-pill" data-act="r3Snd" aria-label="Sonido">' + (SND.mute ? '🔇' : '🔊') + '</button>' +
      '<div style="flex-basis:100%;display:flex;gap:6px;justify-content:center">' + rmPingButtons('e3-pill e3-ping') + '</div>';
    if (bar.innerHTML !== h) bar.innerHTML = h;
  }

  function startPos(room) {
    // Un punto despejado cerca del centro: primero se busca con 1,1 m libres alrededor y, si no hay, con menos
    const { w, d } = room.dimensions_m;
    let best = null;
    for (const mg of [1.1, 0.8, 0.55, 0.35]) {
      const free = (x, z) => R.colliders.every(b => Math.abs(x - b.x) > b.w / 2 + mg || Math.abs(z - b.z) > b.d / 2 + mg);
      let bs = -1e9; const wm = Math.min(mg, 0.8);
      for (let gx = -w / 2 + wm; gx <= w / 2 - wm; gx += 0.3) for (let gz = -d / 2 + wm; gz <= d / 2 - wm; gz += 0.3) {
        if (!free(gx, gz)) continue;
        const near = Math.min(3, ...Object.values(R.byId).map(b => Math.hypot(b.mesh.position.x - gx, b.mesh.position.z - gz)));
        const score = -Math.abs(gx) * 0.6 - Math.abs(gz - d * 0.15) * 0.6 + near;
        if (score > bs) { bs = score; best = { x: gx, z: gz, yaw: 0 }; }
      }
      if (best) break;
    }
    best = best || { x: 0, z: 0, yaw: 0 };
    // Mirar hacia donde hay más objetos a la vista y no contra una pared cercana
    const objs = Object.values(R.byId).map(b => b.mesh.position);
    let by = -1e9;
    for (let i = 0; i < 16; i++) {
      const yaw = i * Math.PI / 8, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      let sc = 0;
      for (const q of objs) {
        const dx = q.x - best.x, dz = q.z - best.z, dist = Math.hypot(dx, dz);
        if (dist < 0.9) continue;
        const cos = (dx * fx + dz * fz) / dist;
        // En vertical el móvil ve unos ±20°: cuenta sobre todo lo que cae en pantalla
        if (cos > 0.93) sc += 1.5; else if (cos > 0.75) sc += 0.4;
      }
      // Distancia a la pared en esa dirección
      const tx = fx > 0 ? (w / 2 - best.x) / fx : fx < 0 ? (-w / 2 - best.x) / fx : 1e9;
      const tz = fz > 0 ? (d / 2 - best.z) / fz : fz < 0 ? (-d / 2 - best.z) / fz : 1e9;
      const wd = Math.min(tx, tz); sc += Math.min(wd, 6) * 0.15 - (wd < 1.6 ? 2 : 0) + (i === 0 ? 0.2 : 0);
      if (sc > by) { by = sc; best.yaw = yaw; }
    }
    return best;
  }
  function signature(s, st, c, role) {
    return R.roomId + '|' + Rooms.objectsIn(s, c, R.roomId).map(o => o.object_id + ':' + c.obj.get(o.object_id)).join(',') + '|' + (R.room.doors || []).map(d => (d.opens_when || []).every(t => c.T.has(t)) ? 1 : 0).join('');
  }
  async function goRoom(id, keepCam) {
    const st = rmState(), s = rmScenario(st), c = rmCompute(st), role = myRole();
    const room = s.rooms.find(r => r.room_id === id);
    if (!room || !room.dimensions_m) return;
    const th = themeFor(s, room);
    msg('Entrando en ' + room.name + '…', 8000);
    await K.withTimeout(Promise.all([K.loadPBR(th.floor), K.loadPBR(th.wall), th.ceil ? K.loadPBR(th.ceil) : null, K.loadHDR(th.hdri), K.loadPBR('dark_wooden_planks'), K.loadPBR(th.decor === 'tech' ? 'metal_plate_02' : th.outdoor ? 'painted_plaster_wall' : 'dirty_carpet'),
      ...['wooden_bookshelf_worn', 'WoodenTable_01', 'Lantern_01', 'GreenChair_01', 'potted_plant_01', 'ornate_mirror_01'].map(K.loadGLB)].filter(Boolean)), 20000);
    if (!R) return;
    RM.room = id; rmSave(); rmWhere(null);
    Object.assign(R, build(s, c, room, role));
    // Si la zona pidió modelos que aún no estaban, se cargan y se arma otra vez con ellos
    if (await loadMissing() && R) Object.assign(R, build(s, c, room, role));
    if (!R) return;
    R.roomId = id;
    if (!keepCam) { const p = startPos(room); R.camera.position.set(p.x, 1.6, p.z); look.yaw = p.yaw; look.pitch = 0; }
    if (Q.level) applyQuality();
    R.renderer.shadowMap.needsUpdate = true;
    if (!SND.amb || SND.ambRoom !== id) { ambient(R.th); SND.ambRoom = id; }
    sig = signature(s, st, c, role);
    solvedFx(s, st); flushFx();
    refreshMarkers(s, st, c, role);
    hudTick();
    msg(room.name + '. ' + (room.view[role] || room.description), 6000);
  }

  ACTS.r3Exit = () => { RM3.left = true; api.close(); };
  ACTS.r3Use = el => { if (el.dataset.v && !document.getElementById('sheet')) interact(el.dataset.v); };
  // Lista de lo que hay en la zona: otra forma de llegar a cada objeto sin apuntar
  ACTS.r3List = () => {
    const st = rmState(), s = rmScenario(st), c = rmCompute(st), role = myRole();
    const objs = Rooms.objectsIn(s, c, R.roomId).filter(o => o.category !== 'decorative' || Rooms.cluesAt(s, c, st, o, role).length);
    openSheet('<h2>📋 En ' + esc(R.room.name) + '</h2><div class="rgrid">' + objs.map(o => {
      const mark = Rooms.nextAction(s, c, o, role) >= 0 || Rooms.cluesAt(s, c, st, o, role).length ? ' new' : '';
      return '<button class="rtile' + mark + '" data-act="r3Pick" data-v="' + o.object_id + '"><span class="e">' + rmEmoji(s, o) + '</span><span class="n">' + esc(o.name) + '</span></button>';
    }).join('') + '</div><button class="btn block" data-act="closeSheet" style="margin-top:12px">Cerrar</button>');
  };
  // Elegir en la lista te lleva junto al objeto, te gira hacia él y abre su ficha
  function faceObject(b) {
    const cam = R.camera.position, far = Math.hypot(b.c.x - cam.x, b.c.z - cam.z);
    if (far > 2.6 || far < 0.7) {
      const free = (x, z) => R.colliders.every(k => Math.abs(x - k.x) > k.w / 2 + 0.32 || Math.abs(z - k.z) > k.d / 2 + 0.32);
      let best = null, bs = 1e9;
      for (let gx = -R.W / 2 + 0.4; gx <= R.W / 2 - 0.4; gx += 0.2) for (let gz = -R.D / 2 + 0.4; gz <= R.D / 2 - 0.4; gz += 0.2) {
        const dd = Math.hypot(b.c.x - gx, b.c.z - gz);
        if (dd < 1.1 || dd > 2.4 || !free(gx, gz)) continue;
        const sc = Math.hypot(cam.x - gx, cam.z - gz) + Math.abs(dd - 1.7);
        if (sc < bs) { bs = sc; best = [gx, gz]; }
      }
      if (best) { cam.x = best[0]; cam.z = best[1]; }
    }
    look.yaw = Math.atan2(-(b.c.x - cam.x), -(b.c.z - cam.z));
    look.pitch = Math.max(-0.9, Math.min(0.6, Math.atan2(b.c.y - 1.6, Math.hypot(b.c.x - cam.x, b.c.z - cam.z))));
  }
  ACTS.r3Pick = el => {
    const id = el.dataset.v, b = R && R.byId[id];
    closeSheet();
    if (b && b.c) faceObject(b);
    setTimeout(() => interact(id), 60);
  };
  ACTS.r3Notes = () => {
    const st = rmState(), s = rmScenario(st), c = rmCompute(st), role = myRole();
    const mine = Rooms.myClues(s, st, role), inv = Rooms.inventory(s, c, role), help = Rooms.helpClues(s, c, role);
    openSheet('<h2>📓 Tus pistas</h2>' + (mine.length ? mine.map(k => '<div class="n" style="border-bottom:1px solid var(--line);padding:8px 0">' + esc(k.content) + ' <button class="iconbtn sm" data-act="rmSpeak" data-v="' + k.clue_id + '" aria-label="Escuchar">🔊</button></div>').join('') : '<p class="muted">Todavía no tienes pistas. Toca los objetos con ❗.</p>') +
      (inv.length ? '<h2 style="margin-top:14px">🎒 Llevas</h2><div class="chips">' + inv.map(o => '<span class="chip">' + rmEmoji(s, o) + ' ' + esc(o.name) + '</span>').join('') + '</div>' : '') +
      (help.length ? '<h2 style="margin-top:14px">💡 Ayuda</h2>' + help.map(k => '<p>' + esc(k.content) + '</p>').join('') : '') +
      '<h2 style="margin-top:14px">🎯 Objetivos</h2>' + s.objectives.map(o => '<div class="small" style="padding:3px 0">' + (Rooms.objectiveDone(s, c, o.objective_id) ? '✅' : '⬜') + ' ' + esc(o.text) + '</div>').join('') +
      '<div class="grid2" style="margin-top:12px"><button class="btn" data-act="rmPause">⏸ Pausa</button><button class="btn" data-act="closeSheet">Cerrar</button></div>');
  };
  ACTS.r3Vote = el => { const st = rmState(), s = rmScenario(st), p = s.puzzles.find(x => x.puzzle_id === el.dataset.v); openSheet(rmVoteCard(s, st, p, myRole()) + '<button class="btn block" data-act="closeSheet">Cerrar</button>'); };
  ACTS.r3Rooms = () => {
    const st = rmState(), s = rmScenario(st), c = rmCompute(st);
    openSheet('<h2>🗺️ ¿A qué zona vas?</h2><div class="chips">' + Rooms.myRooms(s, c, myRole()).map(r => '<button class="chip' + (r.room_id === R.roomId ? ' on' : '') + '" data-act="r3Go" data-v="' + r.room_id + '">' + ((s.ui.rooms || {})[r.room_id] || '🚪') + ' ' + esc(r.name) + '</button>').join('') + '</div>');
  };
  ACTS.r3Go = el => { closeSheet(); return goRoom(el.dataset.v); };

  const api = {
    active: false,
    async open() {
      if (api.active) return;
      if (typeof Esc3D === 'undefined') throw new Error('Falta el motor 3D');
      api.active = true;
      const el = hud();
      el.classList.add('loading');
      msg('Cargando el escenario en 3D…', 30000);
      try {
        await Esc3D.kit().loadThree();
        K = Esc3D.kit(); T = K.T;
        await K.withTimeout(K.loadExtras(), 8000);
      } catch (e) { api.close(); throw e; }
      K = Esc3D.kit();
      el.classList.remove('loading');
      const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
      renderer.setSize(innerWidth, innerHeight);
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
      renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.domElement.className = 'e3-canvas';
      el.prepend(renderer.domElement);
      R = { renderer, camera: new T.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 80), markers: new T.Group(), interact: [], colliders: [], byId: {}, W: 8, D: 8 };
      bindControls(renderer.domElement);
      window.addEventListener('resize', onResize);
      const st = rmState(), s = rmScenario(st), c = rmCompute(st), role = myRole();
      const rooms = Rooms.myRooms(s, c, role);
      const start = (rooms.find(r => r.room_id === RM.room) || rooms.find(r => r.room_id === s.players_data[role === 'A' ? 'player_a' : 'player_b'].initial_location) || rooms[0] || {}).room_id;
      await goRoom(start);
      lastT = 0; raf = requestAnimationFrame(frame);
      clearInterval(api.tick); api.tick = setInterval(hudTick, 500);
    },
    close() {
      api.active = false;
      cancelAnimationFrame(raf); clearInterval(api.tick); ambientStop(); SND.ambRoom = null;
      window.removeEventListener('resize', onResize); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
      if (R && R.renderer) R.renderer.dispose();
      R = null;
      const el = document.getElementById('e3'); if (el) el.remove();
      render();
    },
    // Cada cambio del documento de la pareja: puertas, objetos que aparecen y marcas ❗
    onCouple() {
      if (!api.active || !R || !R.scene) return;
      const st = rmState();
      if (!st.startedAt || !window.ROOMS_DATA[st.id]) return api.close();
      const s = rmScenario(st), c = rmCompute(st), role = myRole();
      if (Rooms.won(s, c)) { msg('🎉 ¡Lo lograron juntos!', 5000); setTimeout(() => api.active && api.close(), 3000); return; }
      const now = signature(s, st, c, role);
      if (now !== sig) { const keep = R.roomId; goRoom(keep, true); return; }
      solvedFx(s, st); flushFx();
      refreshMarkers(s, st, c, role);
    },
  };
  api._interact = id => interact(id);
  api._boot = async () => { await Esc3D.kit().loadThree(); K = Esc3D.kit(); T = K.T; await K.withTimeout(K.loadExtras(), 8000); K = Esc3D.kit(); };
  // Recorre todas las zonas de un escenario y devuelve lo que se pisa o se sale de la zona
  api._audit = async s => {
    const out = {};
    for (const room of s.rooms) {
      if (!room.dimensions_m) continue;
      CUR_TH = themeFor(s, room); CUR_S = s;
      layout(s, room); await loadMissing();
      const L = layout(s, room), { w, d } = room.dimensions_m;
      const bad = overlaps(L).concat(L.boxes.filter(b => b.x0 < -w / 2 - 0.01 || b.x1 > w / 2 + 0.01 || b.z0 < -d / 2 - 0.01 || b.z1 > d / 2 + 0.01).map(b => b.id + ' fuera'));
      if (bad.length) out[room.room_id] = bad;
    }
    return out;
  };
  api._view = (x, z, yaw, pitch) => { if (R) { if (x !== null) { R.camera.position.x = x; R.camera.position.z = z; } look.yaw = yaw === null ? look.yaw : yaw; look.pitch = pitch || 0; } };
  api._go = id => goRoom(id);
  api._boxes = async (s, id) => { const room = s.rooms.find(r => r.room_id === id); CUR_TH = themeFor(s, room); CUR_S = s; layout(s, room); await loadMissing(); return layout(s, room).boxes; };
  // Vista de maqueta desde fuera y arriba (techo y paredes se ven por detrás), para revisar cada zona entera
  api._over = (on, k) => { R.over = on; if (on) { const m = Math.max(R.W, R.D); R.scene.fog = null; R.camera.position.set(R.W * 0.5 * (k || 1) + 0.6, R.room.dimensions_m.h + m * 0.75, R.D * 0.5 + 0.6); R.camera.lookAt(0, 0.6, 0); } };
  api._turn = d => { look.yaw += d; };
  api._info = () => R && { room: R.roomId, objects: Object.keys(R.byId), calls: R.renderer.info.render.calls };
  return api;
})();

ACTS.r3Open = async () => {
  if (RM3.opening) return;
  RM3.opening = true; RM3.left = false;
  try { await Rooms3D.open(); }
  catch (e) { // sin 3D en este móvil: queda la vista de lista para no dejar la partida a medias
    console.warn(e); S.no3d = true; toast('Este móvil no pudo abrir el 3D. Se muestra la vista simple.'); render();
  } finally { RM3.opening = false; }
};
