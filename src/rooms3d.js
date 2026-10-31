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
    altillo: { floor: 'dark_wooden_planks', wall: 'dark_wooden_planks', ceil: 'roof_planks', hdri: 'lythwood_room', light: '#ffe2bd', fog: '#1d140e', wallTint: '#e0d2c4', ceilTint: '#b8a898' },
    biblioteca: { floor: 'dirty_carpet', wall: 'decrepit_wallpaper', ceil: 'rectangular_parquet', hdri: 'lythwood_room', light: '#ffd9a0', fog: '#141812', wallTint: '#b8c4b0', floorTint: '#b05058' },
    piedra: { floor: 'stacked_stone_wall', wall: 'stacked_stone_wall', ceil: 'stacked_stone_wall', hdri: 'lythwood_room', light: '#ffc98a', fog: '#120e0a', floorTint: '#9a8e80' },
    madera: { floor: 'dark_wooden_planks', wall: 'wood_trunk_wall', ceil: 'roof_planks', hdri: 'snowy_forest', light: '#ffe0b0', fog: '#1a1410' },
    tecnica: { floor: 'rectangular_parquet', wall: 'painted_plaster_wall', ceil: 'painted_plaster_wall', hdri: 'lythwood_room', light: '#e8f2ff', fog: '#10151a', wallTint: '#8e9ba4', floorTint: '#5e656c', ceilTint: '#9aa3aa', decor: 'tech', dim: 0.7 },
    calle: { floor: 'stacked_stone_wall', wall: 'painted_plaster_wall', outdoor: true, hdri: 'snowy_forest', light: '#ffc46b', fog: '#0d1424', sky: '#0d1424', wallTint: '#d9c7a8', floorTint: '#c9c2b8', floorRep: 1.2 },
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
    if (k) return [k[1], k[2]];
    return [o.category === 'exit' ? 'door' : 'pedestal', null];
  }
  const B = {
    door() { return K.P.door('#5b3b28'); },
    shelf() { return K.model('wooden_bookshelf_worn', () => K.P.bookshelfBox(), { h: 1.9 }); },
    cabinet() {
      const g = new T.Group(), m = metal('#4b5560');
      g.add(K.at(K.box(0.9, 1.8, 0.45, m), 0, 0.9, 0));
      g.add(K.at(K.box(0.02, 1.6, 0.02, metal('#222')), 0, 0.95, 0.23));
      for (const x of [-0.12, 0.12]) g.add(K.at(K.box(0.03, 0.18, 0.04, brass()), x, 1.0, 0.25));
      return g;
    },
    scope() {
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
      const g = K.P.table(1.4, 0.8, 0.85, '#6b4a32', 'WoodenTable_01', { w: 1.4 });
      const top = new T.Group(); top.position.y = 0.88; g.add(top);
      for (let i = 0; i < 6; i++) top.add(K.at(K.box(0.05, 0.08, 0.05, brass()), -0.5 + i * 0.2, 0.04, 0.15));
      for (let i = 0; i < 3; i++) { const d = K.cyl(0.06, 0.06, 0.05, brass(), 18); d.position.set(-0.2 + i * 0.16, 0.03, -0.15); top.add(d); }
      return g;
    },
    table() { return K.P.table(1.4, 0.8, 0.85, '#6b4a32', 'WoodenTable_01', { w: 1.4 }); },
    clock() { return K.P.clock('10:10'); },
    screen() {
      const g = new T.Group();
      g.add(K.at(K.box(0.6, 0.4, 0.05, K.M('#1a1a1a', { metalness: 0.4 })), 0, 0.3, 0));
      g.add(K.at(K.box(0.54, 0.34, 0.01, K.M('#0b2a1a', { emissive: '#2bd67b', emissiveIntensity: 0.6 })), 0, 0.3, 0.03));
      g.add(K.at(K.box(0.08, 0.1, 0.08, K.M('#222')), 0, 0.05, 0));
      return g;
    },
    radio() {
      const g = new T.Group(), w = wood('#9a6a40', [0.4, 0.4]);
      g.add(K.at(K.box(0.5, 0.32, 0.28, w), 0, 0.16, 0));
      g.add(K.at(K.box(0.3, 0.2, 0.01, K.M('#3a3020', { roughness: 0.9 })), -0.06, 0.17, 0.145));
      for (const x of [0.15, 0.2]) { const k = K.cyl(0.025, 0.025, 0.03, brass(), 12); k.rotation.x = Math.PI / 2; k.position.set(x, 0.12, 0.15); g.add(k); }
      return g;
    },
    lamp() { return K.model('Lantern_01', () => K.at(K.box(0.14, 0.3, 0.14, brass()), 0, 0.15, 0), { h: 0.38 }); },
    mirror() { return K.model('ornate_mirror_01', () => K.box(0.6, 0.9, 0.04, K.M('#c8d2d8', { metalness: 1, roughness: 0.05 })), { back: true, h: 1.0, shadow: false }); },
    board(o) { const p = paper(/azul/.test(o.visual) ? '#9fb8d0' : /corcho/.test(o.visual) ? '#b88a5a' : '#efe3c2', 0.7, 0.5); const f = new T.Group(); f.add(K.at(K.box(0.76, 0.56, 0.03, wood('#7a5530')), 0, 0, -0.02)); p.position.z = 0.0; f.add(p); return f; },
    book(o) {
      const g = new T.Group(), c = /azul/.test(o.visual) ? '#2c4a7a' : /verde/.test(o.visual) ? '#2c5a3a' : '#6a2c2c';
      g.add(K.at(K.box(0.26, 0.04, 0.34, K.M(c, { roughness: 0.8 })), 0, 0.02, 0));
      const p = paper('#f2e8cf', 0.24, 0.32, 6); p.rotation.x = -Math.PI / 2; p.position.y = 0.042; g.add(p);
      return g;
    },
    chest() { return K.P.chest(); },
    chair() { return K.P.chair('#6b2e2e'); },
    bench() {
      const g = new T.Group(), w = wood('#8a6a55', [1, 0.3]), ir = metal('#222');
      for (let i = 0; i < 4; i++) g.add(K.at(K.box(1.5, 0.04, 0.09, w), 0, 0.45, -0.18 + i * 0.12));
      for (const x of [-0.65, 0.65]) g.add(K.at(K.box(0.05, 0.45, 0.45, ir), x, 0.22, 0));
      return g;
    },
    plant() { return K.P.plant(); },
    statue() {
      const g = new T.Group(), st = K.M('#c8c2b6', { roughness: 0.7 });
      g.add(K.at(K.box(0.5, 0.9, 0.5, st), 0, 0.45, 0), K.at(K.cyl(0.14, 0.2, 0.6, st, 16), 0, 1.2, 0), K.at(new T.Mesh(new T.SphereGeometry(0.13, 16, 12), st), 0, 1.6, 0));
      return g;
    },
    vessel(o) {
      const big = /barril|tanque|dep[oó]sito|tambor|bid[oó]n/.test(o.name.toLowerCase());
      return big ? K.at(K.cyl(0.3, 0.3, 0.9, metal('#6a4a2a'), 18), 0, 0.45, 0) : K.at(K.cyl(0.05, 0.07, 0.22, brass(), 14), 0, 0.11, 0);
    },
    machine() {
      const g = new T.Group(), m = metal('#55606a');
      g.add(K.at(K.box(1.4, 1.3, 1.0, m), 0, 0.65, 0));
      for (let i = 0; i < 3; i++) { const p = K.cyl(0.06, 0.06, 1.0, metal('#8a7a50'), 10); p.position.set(-0.5 + i * 0.5, 1.6, -0.3); g.add(p); }
      g.add(K.at(K.box(0.5, 0.3, 0.02, K.M('#102018', { emissive: '#ffb347', emissiveIntensity: 0.5 })), 0, 0.9, 0.51));
      return g;
    },
    small() { return K.at(new T.Mesh(new T.SphereGeometry(0.12, 12, 10), K.M('#8a6a45', { roughness: 0.9 })), 0, 0.08, 0); },
    pedestal() { return K.at(K.cyl(0.22, 0.26, 0.9, K.M('#7a6a5a', { roughness: 0.7 }), 16), 0, 0.45, 0); },
  };
  // Lo que se pone sobre una superficie lleva una base si no hay una mesa debajo
  const SMALL = ['book', 'radio', 'lamp', 'screen', 'clock', 'vessel', 'small', 'chest'];
  const FLOOR = ['table', 'console', 'shelf', 'cabinet', 'booth', 'machine', 'bench', 'chair', 'plant', 'statue', 'fountain', 'boat', 'bridge', 'mailbox', 'lever', 'scope', 'pedestal', 'door', 'facades'];

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
  function decorate(scene, th, W, D, H) {
    const walls = [[W, 0, -D / 2, 0], [W, 0, D / 2, Math.PI], [D, -W / 2, 0, Math.PI / 2], [D, W / 2, 0, -Math.PI / 2]];
    for (const [len, x, z, ry] of walls) {
      const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
      if (th.decor === 'tech') {
        g.add(K.at(K.box(len, 0.9, 0.03, K.M('#3d464e', { metalness: 0.5, roughness: 0.45 })), 0, 0.45, 0.02));
        g.add(K.at(K.cyl(0.04, 0.04, len, metal('#7d868d'), 10), 0, H - 0.25, 0.12)); g.children[1].rotation.z = Math.PI / 2;
        for (let px = -len / 2 + 0.9; px < len / 2 - 0.5; px += 1.6) {
          g.add(K.at(K.box(0.7, 0.45, 0.04, K.M('#59636b', { metalness: 0.6, roughness: 0.35 })), px, 1.75, 0.03));
          g.add(K.at(K.box(0.08, 0.03, 0.02, K.M('#111', { emissive: (px * 10 | 0) % 2 ? '#3cff8f' : '#ffb84d', emissiveIntensity: 1.2 })), px + 0.25, 1.9, 0.06));
        }
      } else if (th.decor !== 'none') {
        g.add(K.at(K.box(len, 0.06, 0.03, K.M('#3b2a1f', { roughness: 0.6 })), 0, 0.95, 0.02));
      }
    }
  }

  // ---------- Construcción de una zona ----------
  function build(s, c, room, role) {
    const th = themeFor(s, room), { w: W, d: D, h: H } = room.dimensions_m;
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
      const m = new T.Mesh(new T.PlaneGeometry(len, wallH), mat(th.wall, [len / 3, wallH / 2.5], th.wallTint, '#c9b48f'));
      m.position.set(x, wallH / 2, z); m.rotation.y = ry; m.receiveShadow = true; scene.add(m);
      if (!th.outdoor) { const b = K.box(len, 0.14, 0.03, K.M('#2b1d14', { roughness: 0.6 })); b.position.set(x * 0.998, 0.07, z * 0.998); b.rotation.y = ry; scene.add(b); }
    }
    if (!th.outdoor) decorate(scene, th, W, D, H);
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
      if (!th.outdoor) { const b = new T.Mesh(new T.SphereGeometry(0.08, 14, 10), K.M('#fff5dd', { emissive: l.color || th.light, emissiveIntensity: 2 })); b.position.copy(pl.position); scene.add(b); }
    });

    // Puertas del diseño
    const interact = [], colliders = [], byId = {};
    for (const dr of room.doors || []) {
      const m = B.door(), p = toW(room, dr.position), f = wallFacing(room, dr.position);
      m.position.set(p[0], 0, p[2]); m.rotation.y = f.ry;
      const open = (dr.opens_when || []).every(tk => c.T.has(tk));
      if (open) m.userData.pivot.rotation.y = -1.35;
      scene.add(m);
      const label = dr.to === 'EXIT' ? 'Salida' : 'Puerta a ' + ((s.rooms.find(r => r.room_id === dr.to) || {}).name || 'otra zona');
      K.tag(m, 'door:' + dr.door_id, label); interact.push(m);
      byId['door:' + dr.door_id] = { door: dr, mesh: m };
    }
    // Objetos visibles para este jugador
    const objs = Rooms.objectsIn(s, c, room.room_id);
    const tables = objs.filter(o => ['table', 'console'].includes(kindOf(s, o)[0]));
    for (const o of objs) {
      if (!o.position) continue;
      const [kind, foot] = kindOf(s, o);
      const m = (B[kind] || B.pedestal)(o);
      const p = toW(room, o.position), f = wallFacing(room, o.position);
      // Los muebles van siempre en el suelo; la altura del diseño es la de su superficie de trabajo
      let y = FLOOR.includes(kind) ? 0 : p[1];
      const onWall = f.dist < 0.35 && (y > 0.5 || ['board', 'mirror', 'clock', 'cabinet', 'shelf'].includes(kind));
      if (['board', 'mirror', 'clock'].includes(kind) && !onWall && y < 0.5) y = 1.4;
      if (SMALL.includes(kind) && y > 0.25 && !onWall) {
        const near = tables.some(t => t !== o && Math.hypot(t.position.x - o.position.x, t.position.z - o.position.z) < 1.0);
        if (!near) { const st = K.at(K.cyl(0.2, 0.24, y, K.M('#5a4636', { roughness: 0.7 }), 14), p[0], y / 2, p[2]); scene.add(st); }
        if (near) y = Math.max(y, 0.88);
      }
      // Lo que va en una pared se pega a ella; lo demás mira hacia el centro
      let ry = f.ry;
      if (!onWall && f.dist > 1.2) ry = Math.atan2(-p[0], -p[2]);
      m.position.set(p[0], y, p[2]); m.rotation.y = ry;
      if (kind === 'door' && o.category === 'exit') m.position.y = 0;
      scene.add(m);
      K.tag(m, o.object_id, o.name); interact.push(m);
      if (foot && FLOOR.includes(kind)) colliders.push({ x: p[0], z: p[2], w: Math.abs(Math.sin(ry)) > 0.5 ? foot[1] : foot[0], d: Math.abs(Math.sin(ry)) > 0.5 ? foot[0] : foot[1] });
      byId[o.object_id] = { o, mesh: m, top: y + (m.userData.h || 0) };
    }
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
    return { scene, interact, colliders, byId, markers, room, th, W, D };
  }

  // Signos de "aquí hay algo nuevo" encima de los objetos
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
      '<div id="e3Danger" class="e3-danger"></div><div class="e3-cross"></div><div id="e3Prompt" class="e3-prompt" hidden></div>' +
      '<div id="r3Bar" class="r3-bar"></div>' +
      '<div id="e3Joy" class="e3-joy"><div class="e3-knob"></div></div><div id="e3Hint" class="e3-hint">Arrastra para mirar · usa el círculo para caminar · toca los objetos (❗ = algo nuevo)</div>' +
      '<div id="e3Msg" class="e3-msg" hidden></div>';
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
  function pick(x, y) {
    const rc = new T.Raycaster(), v = new T.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    rc.setFromCamera(v, R.camera);
    const hit = rc.intersectObjects(R.interact, true)[0];
    return hit ? { id: hit.object.userData.id, label: hit.object.userData.label, dist: hit.distance } : null;
  }
  function tapAt(x, y) {
    if (document.getElementById('sheet')) return;
    const h = pick(x, y);
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
    R.markers.children.forEach((m, i) => { m.position.y += Math.sin(t / 300 + i) * 0.0015; });
    if (t - (R.pt || 0) > 150) {
      R.pt = t;
      const h = pick(innerWidth / 2, innerHeight / 2), pr = document.getElementById('e3Prompt');
      if (pr) { if (h && h.dist < 4.2) { pr.textContent = '👆 ' + h.label; pr.hidden = false; } else pr.hidden = true; }
    }
    R.renderer.render(R.scene, R.camera);
  }
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
      (Rooms.helpClues(s, c, role).length ? '<button class="e3-pill" data-act="r3Notes">💡 Ayuda</button>' : '');
    if (bar.innerHTML !== h) bar.innerHTML = h;
  }

  function startPos(room) {
    // El punto libre más cercano al sur del centro, mirando hacia el norte (lejos de muebles y paredes)
    const { w, d } = room.dimensions_m, free = (x, z) => R.colliders.every(b => Math.abs(x - b.x) > b.w / 2 + 0.6 || Math.abs(z - b.z) > b.d / 2 + 0.6);
    let best = { x: 0, z: d / 2 - 1, yaw: 0 }, bs = -1e9;
    for (let gx = -w / 2 + 0.8; gx <= w / 2 - 0.8; gx += 0.4) for (let gz = -d / 2 + 0.8; gz <= d / 2 - 0.8; gz += 0.4) {
      if (!free(gx, gz)) continue;
      const score = -Math.abs(gx) - Math.abs(gz - d * 0.22) + Math.min(...Object.values(R.byId).map(b => Math.hypot(b.mesh.position.x - gx, b.mesh.position.z - gz)), 3);
      if (score > bs) { bs = score; best = { x: gx, z: gz, yaw: 0 }; }
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
    await K.withTimeout(Promise.all([K.loadPBR(th.floor), K.loadPBR(th.wall), th.ceil ? K.loadPBR(th.ceil) : null, K.loadHDR(th.hdri),
      ...['wooden_bookshelf_worn', 'WoodenTable_01', 'Lantern_01', 'GreenChair_01', 'potted_plant_01', 'ornate_mirror_01'].map(K.loadGLB)].filter(Boolean)), 20000);
    if (!R) return;
    RM.room = id; rmSave();
    Object.assign(R, build(s, c, room, role));
    R.roomId = id;
    if (!keepCam) { const p = startPos(room); R.camera.position.set(p.x, 1.6, p.z); look.yaw = p.yaw; look.pitch = 0; }
    R.renderer.shadowMap.needsUpdate = true;
    sig = signature(s, st, c, role);
    refreshMarkers(s, st, c, role);
    hudTick();
    msg(room.name + '. ' + (room.view[role] || room.description), 6000);
  }

  ACTS.r3Exit = () => api.close();
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
      cancelAnimationFrame(raf); clearInterval(api.tick);
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
      refreshMarkers(s, st, c, role);
    },
  };
  api._interact = id => interact(id);
  api._view = (x, z, yaw, pitch) => { if (R) { if (x !== null) { R.camera.position.x = x; R.camera.position.z = z; } look.yaw = yaw === null ? look.yaw : yaw; look.pitch = pitch || 0; } };
  api._turn = d => { look.yaw += d; };
  api._info = () => R && { room: R.roomId, objects: Object.keys(R.byId), calls: R.renderer.info.render.calls };
  return api;
})();

ACTS.r3Open = async () => { try { await Rooms3D.open(); } catch (e) { toast(e.message); } };
