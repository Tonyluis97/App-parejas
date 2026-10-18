// Escape 3D "Sin salida": juego en primera persona con three.js.
// Cada jugador recorre su propia habitación; las pistas de una sirven en la otra, así que deben hablar.
// El estado compartido vive en couple.escape3 = { level, levelAt, startedAt, A, B, fails, wonAt }.
'use strict';

const Esc3D = (function () {
  let T = null;                 // módulo three
  let R = null;                 // renderer, escena, cámara y demás del nivel actual
  let state = null, side = 'A', builtLevel = -1, pendingLevel = -1, raf = 0, tick = 0, lastT = 0, failGuard = 0, advGuard = 0;
  const keys = {};
  const look = { yaw: 0, pitch: 0 };
  const joy = { id: null, x0: 0, y0: 0, dx: 0, dy: 0 };
  const drag = { id: null, x: 0, y: 0, sx: 0, sy: 0, t: 0, moved: 0 };

  async function loadThree() {
    if (T) return T;
    const urls = ['./vendor/three.module.min.js', 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js'];
    for (const u of urls) {
      try { T = await import(u); return T; } catch (e) { console.warn('three no cargó desde', u); }
    }
    throw new Error('No se pudo cargar el motor 3D. Revisa tu conexión.');
  }

  // ---------- Texturas, muebles y luz de Poly Haven (CC0) ----------
  // Están en web/assets. Si algo no carga (sin internet o en la versión de un solo archivo),
  // se usan las texturas dibujadas en canvas y los muebles hechos con primitivas.
  const ASSETS = './assets/';
  const LEVEL_ASSETS = {
    espera: { tex: ['herringbone_parquet', 'painted_plaster_wall', 'dark_wooden_planks'], glb: ['GreenChair_01', 'CoffeeTable_01', 'potted_plant_01', 'sofa_02', 'ornate_mirror_01', 'throw_pillows_01'], hdri: 'lythwood_room' },
    biblioteca: { tex: ['decrepit_wallpaper', 'dirty_carpet', 'rectangular_parquet', 'dark_wooden_planks'], glb: ['wooden_bookshelf_worn', 'book_encyclopedia_set_01', 'WoodenTable_01', 'WoodenChair_01', 'Chandelier_01', 'ArmChair_01', 'wooden_stool_01'], hdri: 'lythwood_room' },
    cabana: { tex: ['wood_trunk_wall', 'roof_planks', 'dark_wooden_planks', 'stacked_stone_wall'], glb: ['scandinavian_masonry_heater', 'WoodenTable_03', 'Rockingchair_01', 'wooden_stool_01', 'Lantern_01', 'wooden_crate_01'], hdri: 'snowy_forest' },
  };
  const texCache = {}, glbCache = {}, hdrCache = {};
  let X = null; // cargadores de three/examples
  async function loadExtras() {
    if (X) return X;
    const [g, r] = await Promise.all([import('./vendor/GLTFLoader.js'), import('./vendor/RGBELoader.js')]);
    X = { gltf: new g.GLTFLoader(), rgbe: new r.RGBELoader(), tex: new T.TextureLoader() };
    return X;
  }
  const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
  // Cada carga se hace una vez; el resultado queda en p.v para usarlo sin await al construir la sala
  function cached(cache, id, fn) {
    if (!cache[id]) { const p = fn(); p.then(v => { p.v = v; }); cache[id] = p; }
    return cache[id];
  }
  function loadPBR(id) {
    return cached(texCache, id, () => Promise.all(['diff', 'nor', 'arm'].map(k => new Promise(res => X.tex.load(ASSETS + 'tex/' + id + '_' + k + '.jpg', t => res(t), undefined, () => res(null)))))
        .then(([map, nor, arm]) => {
          if (!map) return null;
          map.colorSpace = T.SRGBColorSpace;
          return { map, nor, arm };
        }));
  }
  function loadGLB(id) {
    return cached(glbCache, id, () => new Promise(res => X.gltf.load(ASSETS + 'models/' + id + '.glb', g => res(g.scene), undefined, () => res(null))));
  }
  function loadHDR(id) {
    return cached(hdrCache, id, () => new Promise(res => X.rgbe.load(ASSETS + 'hdri/' + id + '_1k.hdr', t => res(t), undefined, () => res(null))));
  }
  // Espera lo que necesita la sala (como mucho unos segundos; lo que falte se dibuja a mano)
  async function preloadLevel(level) {
    const A = LEVEL_ASSETS[E.ESC3.levels[level].id] || LEVEL_ASSETS.cabana;
    try { await withTimeout(loadExtras(), 8000); } catch (e) { console.warn('sin cargadores 3D', e); }
    if (!X) return;
    await withTimeout(Promise.all([...A.tex.map(loadPBR), ...A.glb.map(loadGLB), loadHDR(A.hdri)]), 25000);
  }
  const ready = (cache, id) => cache[id] && cache[id].v;
  // Material PBR con color, relieve y rugosidad/oclusión (mapa ARM: R=oclusión, G=rugosidad; son materiales no metálicos)
  function pbr(id, rep, o) {
    const t = ready(texCache, id);
    if (!t) return null;
    const cl = tx => { if (!tx) return null; const c = tx.clone(); c.wrapS = c.wrapT = T.RepeatWrapping; c.repeat.set(rep[0], rep[1]); c.anisotropy = 4; c.needsUpdate = true; return c; };
    const arm = cl(t.arm);
    return new T.MeshStandardMaterial(Object.assign({ map: cl(t.map), normalMap: cl(t.nor), aoMap: arm, roughnessMap: arm, roughness: 1, metalness: 0 }, o || {}));
  }
  // Mueble glTF a escala real, apoyado en el suelo y centrado; o la versión con primitivas
  function model(id, fallback, o) {
    const src = ready(glbCache, id);
    if (!src) return fallback();
    o = o || {};
    const m = src.clone(true);
    if (o.flip) m.rotation.z = Math.PI;
    const b = new T.Box3().setFromObject(m), sz = b.getSize(new T.Vector3());
    let k = o.scale || 1;
    if (o.h) k = o.h / sz.y; else if (o.w) k = o.w / Math.max(sz.x, sz.z);
    m.scale.setScalar(k);
    m.position.set(-(b.min.x + sz.x / 2) * k, -b.min.y * k, -(b.min.z + sz.z / 2) * k);
    if (o.back) m.position.z = -b.min.z * k; // pegado a la pared (para cuadros y espejos)
    m.traverse(c => { if (c.isMesh) { c.castShadow = o.shadow !== false; c.receiveShadow = true; } });
    const g = new T.Group(); g.add(m);
    return g;
  }

  // ---------- Texturas dibujadas en canvas ----------
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    draw(g, w, h);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }
  function noise(g, w, h, amount, alpha) {
    for (let i = 0; i < amount; i++) {
      g.fillStyle = (Math.random() < 0.5 ? 'rgba(0,0,0,' : 'rgba(255,255,255,') + (Math.random() * alpha) + ')';
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.max(0, ((n >> 16) & 255) * f)), gg = Math.min(255, Math.max(0, ((n >> 8) & 255) * f)), b = Math.min(255, Math.max(0, (n & 255) * f));
    return 'rgb(' + (r | 0) + ',' + (gg | 0) + ',' + (b | 0) + ')';
  }
  const TEX = {
    planks(base, rep) {
      return canvasTex(512, 512, (g, w, h) => {
        const rows = 8, rh = h / rows;
        for (let r = 0; r < rows; r++) {
          let x = -Math.random() * 200;
          while (x < w) {
            const len = 180 + Math.random() * 220;
            g.fillStyle = shade(base, 0.8 + Math.random() * 0.35);
            g.fillRect(x, r * rh, len, rh);
            g.strokeStyle = 'rgba(0,0,0,.08)';
            for (let k = 0; k < 6; k++) { g.beginPath(); const yy = r * rh + Math.random() * rh; g.moveTo(x, yy); g.bezierCurveTo(x + len * .3, yy + 4, x + len * .6, yy - 4, x + len, yy); g.stroke(); }
            g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, r * rh, 2, rh);
            x += len;
          }
          g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, r * rh, w, 2);
        }
        noise(g, w, h, 4000, 0.06);
      }, rep);
    },
    wallpaper(base, accent, rep) {
      return canvasTex(256, 256, (g, w, h) => {
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        g.fillStyle = accent;
        for (let i = 0; i < 4; i++) g.fillRect(i * 64 + 26, 0, 12, h);
        g.globalAlpha = 0.35;
        for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) { g.beginPath(); g.ellipse(x + 32, y + 32, 7, 13, 0, 0, Math.PI * 2); g.fill(); }
        g.globalAlpha = 1;
        noise(g, w, h, 2500, 0.05);
      }, rep);
    },
    logs(rep) {
      return canvasTex(512, 512, (g, w, h) => {
        const n = 7, lh = h / n;
        for (let i = 0; i < n; i++) {
          const grd = g.createLinearGradient(0, i * lh, 0, (i + 1) * lh);
          grd.addColorStop(0, '#5a3b22'); grd.addColorStop(0.5, '#8a5f3a'); grd.addColorStop(1, '#4a2f1a');
          g.fillStyle = grd; g.fillRect(0, i * lh, w, lh);
          g.strokeStyle = 'rgba(30,15,5,.35)';
          for (let k = 0; k < 10; k++) { g.beginPath(); const yy = i * lh + 6 + Math.random() * (lh - 12); g.moveTo(0, yy); g.lineTo(w, yy + (Math.random() * 6 - 3)); g.stroke(); }
        }
        noise(g, w, h, 5000, 0.08);
      }, rep);
    },
    ice(cracks, rep) {
      return canvasTex(512, 512, (g, w, h) => {
        const grd = g.createLinearGradient(0, 0, w, h);
        grd.addColorStop(0, '#86aec2'); grd.addColorStop(1, '#5f8aa2');
        g.fillStyle = grd; g.fillRect(0, 0, w, h);
        // Nubes de escarcha y burbujas atrapadas en el hielo
        for (let i = 0; i < 60; i++) {
          const x = Math.random() * w, y = Math.random() * h, r = 20 + Math.random() * 90;
          const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(235,248,255,' + (0.05 + Math.random() * 0.12) + ')'); rg.addColorStop(1, 'rgba(235,248,255,0)');
          g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
        }
        g.fillStyle = 'rgba(255,255,255,.35)';
        for (let i = 0; i < 300; i++) { g.beginPath(); g.arc(Math.random() * w, Math.random() * h, Math.random() * 1.6, 0, Math.PI * 2); g.fill(); }
        g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1;
        for (let i = 0; i < 40; i++) { g.beginPath(); g.moveTo(Math.random() * w, Math.random() * h); g.lineTo(Math.random() * w, Math.random() * h); g.stroke(); }
        g.strokeStyle = 'rgba(225,242,252,.45)'; g.lineWidth = 1.2;
        for (let i = 0; i < cracks; i++) {
          let x = Math.random() * w, y = Math.random() * h;
          g.beginPath(); g.moveTo(x, y);
          for (let k = 0; k < 8; k++) { x += Math.random() * 60 - 30; y += Math.random() * 60 - 30; g.lineTo(x, y); }
          g.stroke();
        }
      }, rep);
    },
    plaster(base, rep) {
      return canvasTex(256, 256, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); noise(g, w, h, 6000, 0.05); }, rep);
    },
    carpet(base, border, rep) {
      return canvasTex(256, 256, (g, w, h) => {
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        g.strokeStyle = border; g.lineWidth = 10; g.strokeRect(14, 14, w - 28, h - 28);
        g.lineWidth = 3; g.strokeRect(36, 36, w - 72, h - 72);
        noise(g, w, h, 8000, 0.08);
      }, rep);
    },
  };

  // ---------- Piezas 3D ----------
  function M(color, o) { return new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0.05 }, o || {})); }
  function box(w, h, d, mat) { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.castShadow = true; m.receiveShadow = true; return m; }
  function cyl(rt, rb, h, mat, seg) { const m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg || 20), mat); m.castShadow = true; m.receiveShadow = true; return m; }
  function at(o, x, y, z, ry) { o.position.set(x, y, z); if (ry) o.rotation.y = ry; return o; }
  function tag(o, id, label) { o.userData.id = id; o.userData.label = label; o.traverse(c => { c.userData.id = id; c.userData.label = label; }); return o; }
  function plane(w, h, tex, o) { const m = new T.Mesh(new T.PlaneGeometry(w, h), M('#ffffff', Object.assign({ map: tex, roughness: 0.6 }, o || {}))); m.receiveShadow = true; return m; }

  const P = {
    door(color) {
      const g = new T.Group();
      const frameM = pbr('dark_wooden_planks', [0.3, 1.5], { color: '#8a6a55' }) || M('#3b2a1f', { roughness: 0.6 });
      g.add(at(box(0.12, 2.25, 0.16, frameM), -0.56, 1.12, 0), at(box(0.12, 2.25, 0.16, frameM), 0.56, 1.12, 0), at(box(1.24, 0.12, 0.16, frameM), 0, 2.25, 0));
      const pivot = new T.Group(); pivot.position.set(-0.5, 0, 0.02);
      const wood = pbr('dark_wooden_planks', [1, 2]);
      const panel = box(1.0, 2.15, 0.06, wood || M(color || '#6b4a32', { roughness: 0.55 }));
      panel.position.set(0.5, 1.08, 0);
      const inset = wood ? pbr('dark_wooden_planks', [0.6, 0.6], { color: '#b8a090' }) : M(shade(color || '#6b4a32', 0.8), {});
      for (const yy of [0.6, 1.55]) { const p = box(0.7, 0.7, 0.02, inset); p.position.set(0.5, yy, 0.04); pivot.add(p); }
      const knob = new T.Mesh(new T.SphereGeometry(0.045, 16, 12), M('#d4af37', { metalness: 0.9, roughness: 0.25 }));
      knob.position.set(0.88, 1.05, 0.07);
      pivot.add(panel, knob);
      g.add(pivot);
      g.userData.pivot = pivot;
      return g;
    },
    chair(color, id) {
      return model(id || 'GreenChair_01', () => P.chairBox(color));
    },
    chairBox(color) {
      const g = new T.Group(), m = M(color, { roughness: 0.85 }), leg = M('#2b2b2b', { metalness: 0.6, roughness: 0.4 });
      g.add(at(box(0.5, 0.08, 0.5, m), 0, 0.46, 0), at(box(0.5, 0.55, 0.07, m), 0, 0.76, -0.22));
      for (const [x, z] of [[-0.21, -0.21], [0.21, -0.21], [-0.21, 0.21], [0.21, 0.21]]) g.add(at(cyl(0.02, 0.02, 0.46, leg, 8), x, 0.23, z));
      return g;
    },
    table(w, d, h, color, id, o) {
      if (id) return model(id, () => P.table(w, d, h, color), o);
      const g = new T.Group(), m = M(color || '#5b3a24', { roughness: 0.5 });
      g.add(at(box(w, 0.06, d, m), 0, h, 0));
      for (const [x, z] of [[-w / 2 + 0.06, -d / 2 + 0.06], [w / 2 - 0.06, -d / 2 + 0.06], [-w / 2 + 0.06, d / 2 - 0.06], [w / 2 - 0.06, d / 2 - 0.06]]) g.add(at(box(0.06, h, 0.06, m), x, h / 2, z));
      return g;
    },
    plant() {
      return model('potted_plant_01', P.plantBox, { h: 1.25 });
    },
    plantBox() {
      const g = new T.Group();
      g.add(at(cyl(0.2, 0.15, 0.4, M('#9a5b3c', { roughness: 0.9 })), 0, 0.2, 0));
      const leaf = M('#2f7d43', { roughness: 0.8 });
      for (let i = 0; i < 9; i++) { const s = new T.Mesh(new T.SphereGeometry(0.16 + Math.random() * 0.1, 10, 8), leaf); s.position.set(Math.random() * 0.3 - 0.15, 0.55 + Math.random() * 0.45, Math.random() * 0.3 - 0.15); s.castShadow = true; g.add(s); }
      return g;
    },
    bookshelf() {
      if (!ready(glbCache, 'wooden_bookshelf_worn')) return P.bookshelfBox();
      const g = model('wooden_bookshelf_worn', null, { h: 2.2 });
      // Llena los estantes con tomos de enciclopedia
      for (let i = 0; i < 5; i++) {
        for (const x of [-0.31, 0.31]) { const b = model('book_encyclopedia_set_01', () => new T.Group(), { shadow: false }); b.position.set(x + (i % 2 ? 0.03 : -0.03), 0.09 + i * 0.41, 0); g.add(b); }
      }
      return g;
    },
    bookshelfBox() {
      const g = new T.Group(), wood = M('#4a2f1d', { roughness: 0.6 });
      g.add(at(box(1.6, 2.2, 0.06, wood), 0, 1.1, -0.17), at(box(0.06, 2.2, 0.4, wood), -0.8, 1.1, 0), at(box(0.06, 2.2, 0.4, wood), 0.8, 1.1, 0));
      const cols = ['#8e2b2b', '#2b4a8e', '#2e6b3a', '#b88a1e', '#5a2b6e', '#333333', '#a0522d'];
      for (let sh = 0; sh < 5; sh++) {
        const y = 0.06 + sh * 0.5;
        g.add(at(box(1.6, 0.04, 0.4, wood), 0, y, 0));
        let x = -0.74;
        while (x < 0.7) {
          const bw = 0.04 + Math.random() * 0.05, bh = 0.28 + Math.random() * 0.14;
          g.add(at(box(bw, bh, 0.26, M(cols[(Math.random() * cols.length) | 0], { roughness: 0.8 })), x + bw / 2, y + 0.02 + bh / 2, 0.02));
          x += bw + 0.005;
        }
      }
      return g;
    },
    sofa(color) {
      if (!ready(glbCache, 'sofa_02')) return P.sofaBox(color);
      const g = model('sofa_02', null, { w: 1.9 });
      const pil = model('throw_pillows_01', () => new T.Group(), { w: 1.2 });
      pil.position.set(0, 0.36, -0.12); g.add(pil);
      return g;
    },
    sofaBox(color) {
      const g = new T.Group(), m = M(color, { roughness: 0.95 });
      g.add(at(box(1.9, 0.42, 0.85, m), 0, 0.21, 0), at(box(1.9, 0.6, 0.2, m), 0, 0.6, -0.33), at(box(0.2, 0.55, 0.85, m), -0.85, 0.42, 0), at(box(0.2, 0.55, 0.85, m), 0.85, 0.42, 0));
      return g;
    },
    radiator() {
      const g = new T.Group(), m = M('#d9d4cc', { metalness: 0.5, roughness: 0.4 });
      for (let i = 0; i < 9; i++) g.add(at(box(0.07, 0.6, 0.12, m), -0.4 + i * 0.1, 0.45, 0));
      return g;
    },
    framed(w, h, tex, frame) {
      const g = new T.Group();
      g.add(at(box(w + 0.12, h + 0.12, 0.05, M(frame || '#3d2716', { roughness: 0.4 })), 0, 0, 0));
      const p = plane(w, h, tex); p.position.z = 0.03; g.add(p);
      return g;
    },
    clock(time) {
      const [hh, mm] = time.split(':').map(Number);
      const tex = canvasTex(256, 256, (g, w) => {
        g.fillStyle = '#f7f1e3'; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#2b1d14'; g.lineWidth = 8; g.stroke();
        g.fillStyle = '#2b1d14'; g.font = 'bold 26px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
        for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI * 2 - Math.PI / 2; g.fillText(String(i), 128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96); }
        const hand = (ang, len, wd) => { g.lineWidth = wd; g.lineCap = 'round'; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(ang) * len, 128 + Math.sin(ang) * len); g.stroke(); };
        hand(((hh % 12) + mm / 60) / 12 * Math.PI * 2 - Math.PI / 2, 55, 9);
        hand(mm / 60 * Math.PI * 2 - Math.PI / 2, 85, 5);
        g.beginPath(); g.arc(128, 128, 8, 0, Math.PI * 2); g.fill();
      });
      const g = new T.Group();
      g.add(cyl(0.34, 0.34, 0.06, M('#3d2716', { roughness: 0.4 }), 32));
      g.children[0].rotation.x = Math.PI / 2;
      const face = new T.Mesh(new T.CircleGeometry(0.3, 32), M('#ffffff', { map: tex, roughness: 0.5 }));
      face.position.z = 0.035; g.add(face);
      return g;
    },
    safe() {
      const g = new T.Group(), m = M('#2f3a33', { metalness: 0.8, roughness: 0.38 });
      g.add(at(box(0.7, 0.7, 0.6, m), 0, 0.35, 0));
      const dial = cyl(0.1, 0.1, 0.04, M('#c0c0c0', { metalness: 0.9, roughness: 0.2 }), 24); dial.rotation.x = Math.PI / 2; dial.position.set(0, 0.4, 0.31); g.add(dial);
      const handle = box(0.2, 0.04, 0.04, M('#c0c0c0', { metalness: 0.9, roughness: 0.2 })); handle.position.set(0, 0.2, 0.32); g.add(handle);
      return g;
    },
    switches() {
      const tex = canvasTex(256, 128, (g, w, h) => {
        g.fillStyle = '#efe9dd'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#8a7f6e'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
        for (let i = 0; i < 4; i++) { g.fillStyle = '#d6cfc0'; g.fillRect(24 + i * 56, 30, 40, 68); g.fillStyle = '#9a8f7c'; g.fillRect(34 + i * 56, 44, 20, 26); }
      });
      return plane(0.6, 0.3, tex);
    },
    lampsPainting(pattern) {
      const tex = canvasTex(400, 300, (g, w, h) => {
        const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#1b1f3a'); grd.addColorStop(1, '#3a2b4f');
        g.fillStyle = grd; g.fillRect(0, 0, w, h);
        pattern.forEach((on, i) => {
          const x = 60 + i * 93;
          g.strokeStyle = '#9a8f7c'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 110); g.stroke();
          if (on) { const r = g.createRadialGradient(x, 150, 5, x, 150, 70); r.addColorStop(0, 'rgba(255,230,150,.95)'); r.addColorStop(1, 'rgba(255,200,80,0)'); g.fillStyle = r; g.fillRect(x - 70, 80, 140, 140); }
          g.fillStyle = on ? '#ffe9a8' : '#4a4a55'; g.beginPath(); g.ellipse(x, 150, 24, 32, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#6b6b6b'; g.fillRect(x - 12, 112, 24, 14);
        });
        g.fillStyle = 'rgba(255,255,255,.7)'; g.font = 'italic 20px Georgia'; g.fillText('«Nocturno», anónimo', 20, h - 16);
      });
      return P.framed(1.1, 0.82, tex, '#6b4a1e');
    },
    wallText(text, color) {
      const tex = canvasTex(1024, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = color || 'rgba(140,20,20,.9)'; g.font = 'bold 150px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.save(); g.translate(w / 2, h / 2); g.rotate(-0.03); g.fillText(text, 0, 0); g.restore();
        for (let i = 0; i < 40; i++) { g.fillRect(w / 2 - 400 + Math.random() * 800, h / 2 + 50 + Math.random() * 60, 3, 8 + Math.random() * 30); }
      });
      const m = new T.Mesh(new T.PlaneGeometry(2.4, 0.6), new T.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9 }));
      return m;
    },
    cipherWheel(shift) {
      const tex = canvasTex(512, 512, (g, w) => {
        const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        g.fillStyle = '#e8d9b5'; g.beginPath(); g.arc(256, 256, 250, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#c9b48a'; g.beginPath(); g.arc(256, 256, 175, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#3b2a1f'; g.font = 'bold 30px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
        for (let i = 0; i < 26; i++) {
          const a = i / 26 * Math.PI * 2 - Math.PI / 2;
          g.fillText(A[i], 256 + Math.cos(a) * 215, 256 + Math.sin(a) * 215);
          g.fillText(A[(i + 26 - shift) % 26], 256 + Math.cos(a) * 145, 256 + Math.sin(a) * 145);
        }
        g.font = 'bold 34px Georgia'; g.fillText('−' + shift, 256, 236); g.font = '22px Georgia'; g.fillText('afuera → adentro', 256, 276);
      });
      const g = new T.Group();
      const disc = new T.Mesh(new T.CircleGeometry(0.32, 48), M('#ffffff', { map: tex, roughness: 0.6 }));
      g.add(disc);
      return g;
    },
    lectern() {
      const g = new T.Group(), m = pbr('dark_wooden_planks', [0.5, 1]) || M('#4a2f1d', { roughness: 0.6 });
      g.add(at(box(0.5, 1.0, 0.4, m), 0, 0.5, 0));
      const top = box(0.6, 0.05, 0.5, m); top.position.set(0, 1.05, 0); top.rotation.x = -0.4; g.add(top);
      return g;
    },
    gramophone() {
      const g = new T.Group();
      g.add(at(box(0.5, 0.25, 0.5, pbr('dark_wooden_planks', [0.5, 0.3], { color: '#c09070' }) || M('#5a3a22', { roughness: 0.5 })), 0, 0.85, 0));
      const disc = cyl(0.2, 0.2, 0.01, M('#111111', { roughness: 0.3 }), 32); disc.position.set(0, 0.98, 0); g.add(disc);
      const horn = new T.Mesh(new T.ConeGeometry(0.28, 0.6, 24, 1, true), M('#c9a227', { metalness: 0.85, roughness: 0.3, side: T.DoubleSide }));
      horn.position.set(0.12, 1.35, -0.05); horn.rotation.z = -0.9; g.add(horn);
      g.add(P.table(0.6, 0.6, 0.72, '#3b2a1f'));
      if (ready(glbCache, 'wooden_stool_01')) { g.children.pop(); const st = model('wooden_stool_01', null, { h: 0.72 }); g.add(st); }
      return g;
    },
    chandelier() {
      return model('Chandelier_01', P.chandelierBox, { flip: true, scale: 1.2 });
    },
    chandelierBox() {
      const g = new T.Group(), gold = M('#c9a227', { metalness: 0.85, roughness: 0.3 });
      g.add(at(cyl(0.02, 0.02, 0.8, gold, 8), 0, 0.4, 0));
      const ring = new T.Mesh(new T.TorusGeometry(0.45, 0.025, 8, 32), gold); ring.rotation.x = Math.PI / 2; ring.position.y = 0.8; g.add(ring);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const b = new T.Mesh(new T.SphereGeometry(0.05, 10, 8), M('#fff2c4', { emissive: '#ffcc66', emissiveIntensity: 1.2 })); b.position.set(Math.cos(a) * 0.45, 0.86, Math.sin(a) * 0.45); g.add(b); }
      return g;
    },
    fireplace() {
      return model('scandinavian_masonry_heater', P.fireplaceBox, { h: 2.1 });
    },
    fireplaceBox() {
      const g = new T.Group(), stone = pbr('stacked_stone_wall', [2, 1.5]) || M('#6e6a66', { roughness: 0.95 });
      g.add(at(box(1.6, 1.2, 0.5, stone), 0, 0.6, 0), at(box(1.8, 0.12, 0.6, M('#4a3a2c')), 0, 1.26, 0));
      g.add(at(box(0.9, 0.7, 0.3, M('#151515', { roughness: 1 })), 0, 0.4, 0.12));
      return g;
    },
    morseLamp() {
      const g = new T.Group();
      g.add(at(cyl(0.12, 0.16, 0.06, M('#2b2b2b', { metalness: 0.5 })), 0, 0.03, 0), at(cyl(0.015, 0.015, 0.5, M('#2b2b2b', { metalness: 0.5 }), 8), 0, 0.3, 0));
      const bulb = new T.Mesh(new T.SphereGeometry(0.1, 16, 12), M('#fff6d8', { emissive: '#ffd27a', emissiveIntensity: 0 }));
      bulb.position.y = 0.62; g.add(bulb);
      const shadeM = new T.Mesh(new T.ConeGeometry(0.2, 0.18, 20, 1, true), M('#7a1f1f', { side: T.DoubleSide }));
      shadeM.position.y = 0.72; g.add(shadeM);
      const light = new T.PointLight('#ffd27a', 0, 4);
      light.position.y = 0.62; g.add(light);
      g.userData.bulb = bulb; g.userData.light = light;
      return g;
    },
    morseChart() {
      const tex = canvasTex(512, 640, (g, w, h) => {
        g.fillStyle = '#efe6cf'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#2b1d14'; g.font = 'bold 34px Georgia'; g.textAlign = 'center'; g.fillText('CÓDIGO MORSE', w / 2, 46);
        g.font = '15px Georgia'; g.fillText('· = destello corto     — = destello largo', w / 2, 74);
        const L = Object.keys(window.Engine ? {} : {});
        const map = { A: '·—', B: '—···', C: '—·—·', D: '—··', E: '·', F: '··—·', G: '——·', H: '····', I: '··', J: '·———', K: '—·—', L: '·—··', M: '——', N: '—·', O: '———', P: '·——·', Q: '——·—', R: '·—·', S: '···', T: '—', U: '··—', V: '···—', W: '·——', X: '—··—', Y: '—·——', Z: '——··' };
        g.textAlign = 'left'; g.font = 'bold 26px "Courier New", monospace';
        Object.keys(map).forEach((k, i) => { const col = i < 13 ? 0 : 1, row = i % 13; g.fillText(k + '  ' + map[k], 50 + col * 240, 120 + row * 39); });
        noise(g, w, h, 3000, 0.05);
        void L;
      });
      return P.framed(0.8, 1.0, tex, '#4a3a2c');
    },
    crackDrawing(pattern) {
      const tex = canvasTex(400, 400, (g, w, h) => {
        g.fillStyle = '#f4efe2'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#2b1d14'; g.lineWidth = 3;
        for (let i = 0; i < 9; i++) {
          const x = 40 + (i % 3) * 110, y = 40 + ((i / 3) | 0) * 110;
          g.strokeRect(x, y, 100, 100);
          if (pattern[i]) { g.beginPath(); g.moveTo(x + 15, y + 20); g.lineTo(x + 45, y + 55); g.lineTo(x + 30, y + 75); g.lineTo(x + 70, y + 85); g.moveTo(x + 45, y + 55); g.lineTo(x + 85, y + 30); g.stroke(); }
        }
        g.font = 'italic 18px Georgia'; g.fillStyle = '#6b5a48'; g.fillText('«Por donde cruje, se pisa»', 80, 385);
      });
      return P.framed(0.7, 0.7, tex, '#4a3a2c');
    },
    iceGrid() {
      const g = new T.Group();
      for (let i = 0; i < 9; i++) {
        const t = box(0.5, 0.04, 0.5, M('#bfe3f2', { roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.9 }));
        t.position.set(((i % 3) - 1) * 0.55, 0.02, (((i / 3) | 0) - 1) * 0.55); g.add(t);
      }
      return g;
    },
    window(night) {
      const tex = canvasTex(256, 256, (g, w, h) => {
        const grd = g.createLinearGradient(0, 0, 0, h);
        if (night) { grd.addColorStop(0, '#0b1d33'); grd.addColorStop(1, '#2d4f6e'); } else { grd.addColorStop(0, '#9fc6e8'); grd.addColorStop(1, '#e6f0f7'); }
        g.fillStyle = grd; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(255,255,255,.9)';
        for (let i = 0; i < 120; i++) { g.beginPath(); g.arc(Math.random() * w, Math.random() * h, Math.random() * 2.2, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#f5f8fb'; g.fillRect(0, h - 40, w, 40);
      });
      const g = P.framed(1.0, 0.9, tex, '#e8e2d6');
      g.add(at(box(0.04, 0.9, 0.04, M('#e8e2d6')), 0, 0, 0.05), at(box(1.0, 0.04, 0.04, M('#e8e2d6')), 0, 0, 0.05));
      return g;
    },
    magazine(color) {
      const g = new T.Group();
      for (let i = 0; i < 3; i++) { const b = box(0.24, 0.012, 0.32, M(['#c0392b', '#2980b9', '#f1c40f'][i] || color)); b.position.set(i * 0.03, i * 0.013, i * 0.02); b.rotation.y = i * 0.2; g.add(b); }
      return g;
    },
    rug(tex) { const m = plane(2.4, 1.6, tex); m.rotation.x = -Math.PI / 2; m.position.y = 0.005; return m; },
    // Texto en un papel o placa (las pistas que aparecen al abrir cerraduras)
    textTex(lines, o) {
      o = o || {};
      const w = o.w || 512, h = o.h || 512;
      return canvasTex(w, h, (g) => {
        if (o.bg !== null) { g.fillStyle = o.bg || '#efe6cf'; g.fillRect(0, 0, w, h); }
        if (o.bg !== null) noise(g, w, h, 1500, 0.05);
        g.fillStyle = o.ink || '#2b1d14'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const fs = o.size || 46;
        g.font = (o.font || 'bold ' + fs + 'px Georgia');
        lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * fs * 1.3));
      });
    },
    note(lines, w, h, o) {
      const m = new T.Mesh(new T.PlaneGeometry(w, h), M('#ffffff', { map: P.textTex(lines, Object.assign({ w: 512, h: Math.round(512 * h / w) }, o)), roughness: 0.9, transparent: o && o.bg === null }));
      m.receiveShadow = true;
      return m;
    },
    floorNote(lines, o) { const m = P.note(lines, 0.3, 0.22, o); m.rotation.x = -Math.PI / 2; m.position.y = 0.004; return m; },
    lockBox(color) {
      const g = new T.Group();
      g.add(box(0.2, 0.26, 0.07, M(color || '#555555', { metalness: 0.8, roughness: 0.35 })));
      const sh = new T.Mesh(new T.TorusGeometry(0.06, 0.014, 8, 16, Math.PI), M('#c0c0c0', { metalness: 0.9, roughness: 0.25 }));
      sh.position.y = 0.13; g.add(sh);
      return g;
    },
    briefcase() {
      const g = new T.Group(), lea = M('#3b2416', { roughness: 0.6 }), gold = M('#c9a227', { metalness: 0.9, roughness: 0.3 });
      g.add(at(box(0.5, 0.36, 0.13, lea), 0, 0.18, 0));
      const hd = new T.Mesh(new T.TorusGeometry(0.06, 0.012, 8, 16, Math.PI), lea); hd.position.y = 0.37; g.add(hd);
      g.add(at(box(0.06, 0.04, 0.02, gold), -0.15, 0.3, 0.07), at(box(0.06, 0.04, 0.02, gold), 0.15, 0.3, 0.07), at(box(0.12, 0.05, 0.02, gold), 0, 0.3, 0.07));
      return g;
    },
    symbolPanel(text, bg, ink) {
      const g = new T.Group();
      g.add(box(0.36, 0.24, 0.04, M('#d9d4cc', { metalness: 0.4, roughness: 0.4 })));
      const p = P.note([text], 0.3, 0.17, { bg: bg || '#1d2a22', ink: ink || '#9cf0b4', size: 120, font: 'bold 120px sans-serif' }); p.position.z = 0.021; g.add(p);
      return g;
    },
    colorLock(cols) {
      const g = P.lockBox('#6b5a2e');
      cols.forEach((c, i) => { const d = new T.Mesh(new T.CircleGeometry(0.022, 16), M(c, { roughness: 0.4 })); d.position.set(-0.066 + i * 0.044, -0.02, 0.036); g.add(d); });
      return g;
    },
    candles(lit) {
      const g = new T.Group();
      g.add(P.table(0.9, 0.4, 0.8, '#3b2a1f'));
      const wax = M('#efe6d0', { roughness: 0.6 });
      g.userData.flames = [];
      for (let i = 0; i < 4; i++) {
        const x = -0.3 + i * 0.2;
        g.add(at(cyl(0.035, 0.04, 0.22, wax, 12), x, 0.94, 0), at(cyl(0.06, 0.06, 0.02, M('#c9a227', { metalness: 0.9, roughness: 0.3 }), 16), x, 0.84, 0));
        const f = new T.Mesh(new T.SphereGeometry(0.022, 10, 8), M('#ffd27a', { emissive: '#ffb347', emissiveIntensity: 3 }));
        f.scale.y = 1.8; f.position.set(x, 1.08, 0); f.visible = !!(lit && lit[i]); g.add(f); g.userData.flames.push(f);
      }
      return g;
    },
    chest(symbols) {
      const g = new T.Group(), wood = pbr('dark_wooden_planks', [0.6, 0.4], { color: '#c09070' }) || M('#5a3a22', { roughness: 0.6 });
      g.add(at(box(0.7, 0.32, 0.42, wood), 0, 0.16, 0));
      const lid = box(0.72, 0.06, 0.44, wood); lid.position.y = 0.35; g.add(lid);
      if (symbols) { const p = P.note([symbols], 0.4, 0.14, { bg: '#e8d9b5', size: 90, font: 'bold 90px serif' }); p.position.set(0, 0.17, 0.212); g.add(p); }
      return g;
    },
    tiles(color) {
      const g = new T.Group();
      for (let i = 0; i < 9; i++) {
        const t = box(0.5, 0.04, 0.5, M(color, { roughness: 0.5 }));
        t.position.set(((i % 3) - 1) * 0.55, 0.02, (((i / 3) | 0) - 1) * 0.55); g.add(t);
      }
      return g;
    },
    lanterns(lit) {
      const g = new T.Group();
      g.userData.bulbs = [];
      for (let i = 0; i < 4; i++) {
        const x = -0.75 + i * 0.5;
        g.add(at(box(0.04, 0.04, 0.2, M('#2b2b2b', { metalness: 0.6 })), x, 0.42, 0.1));
        const l = model('Lantern_01', () => at(box(0.12, 0.28, 0.1, M('#3a3020', { metalness: 0.6 })), 0, 0.14, 0), { scale: 1.3 });
        l.position.set(x, 0, 0.18); g.add(l);
        const b = new T.Mesh(new T.SphereGeometry(0.03, 10, 8), M('#fff2c4', { emissive: '#ffcc66', emissiveIntensity: 3 }));
        b.position.set(x, 0.14, 0.18); b.visible = !!(lit && lit[i]); g.add(b); g.userData.bulbs.push(b);
      }
      return g;
    },
    stars() {
      const tex = canvasTex(512, 512, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        const rg = g.createRadialGradient(256, 256, 20, 256, 256, 250); rg.addColorStop(0, 'rgba(255,220,150,.35)'); rg.addColorStop(1, 'rgba(255,220,150,0)');
        g.fillStyle = rg; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(20,12,6,.85)';
        for (let i = 0; i < 9; i++) if ([1, 3, 4, 5, 7].includes(i)) {
          const x = 106 + (i % 3) * 150, y = 106 + ((i / 3) | 0) * 150;
          g.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 18 : 44, a = k / 10 * Math.PI * 2 - Math.PI / 2; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.fill();
        }
      });
      return new T.Mesh(new T.PlaneGeometry(1.2, 1.2), new T.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1 }));
    },
    fish() {
      const tex = canvasTex(512, 512, (g, w, h) => {
        g.fillStyle = '#5f8aa2'; g.fillRect(0, 0, w, h);
        const fishAt = (x, y, c, r) => { g.save(); g.translate(x, y); g.rotate(r); g.fillStyle = c; g.beginPath(); g.ellipse(0, 0, 34, 16, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(-28, 0); g.lineTo(-52, -16); g.lineTo(-52, 16); g.fill(); g.restore(); };
        const list = [].concat(Array(4).fill('#c0392b'), ['#2471a3'], Array(6).fill('#d4ac0d'));
        list.forEach((c, i) => fishAt(70 + (i % 4) * 120, 90 + ((i / 4) | 0) * 150 + (i % 2) * 30, c, (i * 1.7) % 1 - 0.5));
        g.fillStyle = 'rgba(230,245,255,.35)'; g.fillRect(0, 0, w, h);
      });
      const m = new T.Mesh(new T.PlaneGeometry(1.2, 1.2), new T.MeshPhysicalMaterial({ map: tex, roughness: 0.2, clearcoat: 1 }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.006; m.receiveShadow = true;
      return m;
    },
  };

  // ---------- Salas ----------
  // Cada objeto: { id, label, build(), pos:[x,y,z], ry, solid:[w,d], clue|lock|info }
  function levelDef(level, sd) {
    const L = E.ESC3.levels[level], C = L.clues, ST = L[sd].steps;
    const objs = [];
    const add = o => objs.push(o);
    // Cerradura del paso n (el nombre sale del motor) y lo que aparece al abrirla
    const lock = (n, o) => add(Object.assign({ id: n ? 'lock' + (n + 1) : 'lock', label: ST[n].lock, lock: true, step: n }, o));
    const reveal = (n, o) => add(Object.assign({ id: 'rev' + (n + 1), label: ST[n].revealLabel, reveal: n, after: n + 1 }, o));
    if (L.id === 'espera') {
      add({ id: 'door', label: 'Puerta', build: () => P.door('#5b3b28'), pos: [0, 0, -3.95], door: true });
      for (let i = 0; i < 4; i++) add({ id: 'chair' + i, build: () => P.chair(sd === 'A' ? '#7a2e2e' : '#2e4f7a'), pos: [-3.4, 0, -2.0 + i * 0.75], ry: Math.PI / 2, solid: [0.6, 0.6] });
      add({ id: 'table', build: () => P.table(1.0, 0.6, 0.42, '#6b4a32', 'CoffeeTable_01', { scale: 0.8 }), pos: [-2.3, 0, -0.85], ry: Math.PI / 2, solid: [1.2, 0.75] });
      add({ id: 'mirror', build: () => model('ornate_mirror_01', () => new T.Group(), { back: true, scale: 1.3, shadow: false }), pos: [3.99, 1.15, -2.2], ry: -Math.PI / 2 });
      add({ id: 'mags', label: 'Revistas', build: () => P.magazine(), pos: [-2.3, 0.42, -0.85], info: sd === 'A' ? 'Una revista vieja abierta en una página subrayada: «Todo lo que necesitas saber está en la otra sala. Hablen.»' : 'Una revista con un crucigrama a medias. En el margen alguien escribió: «Las luces nunca mienten».' });
      add({ id: 'plant', build: () => P.plant(), pos: [3.4, 0, -3.4], solid: [0.5, 0.5] });
      add({ id: 'radiator', label: 'Radiador', build: () => P.radiator(), pos: [3.92, 0, 0.5], ry: -Math.PI / 2, info: 'El radiador quema al tocarlo. Cada minuto hace más calor.' });
      add({ id: 'sofa', build: () => P.sofa(sd === 'A' ? '#5a2b2b' : '#2b3f5a'), pos: [1.5, 0, 3.4], ry: Math.PI, solid: [1.9, 0.85] });
      if (sd === 'A') {
        lock(0, { build: () => P.safe(), pos: [2.6, 0, -3.5], solid: [0.7, 0.6] });
        reveal(0, { build: () => { const n = P.floorNote(['★ = 2', '● = 6', '▲ = 9'], { size: 90 }); n.position.y = 0; return n; }, pos: [2.6, 0.705, -3.45] });
        lock(1, { build: () => P.briefcase(), pos: [0.2, 0, 3.45], ry: 0.2, solid: [0.5, 0.2] });
        reveal(1, { build: () => P.floorNote(['Rojo = O', 'Azul = R', 'Amarillo = M', 'Verde = A'], { size: 64 }), pos: [0.75, 0, 2.95], ry: 0.3 });
        lock(2, { build: () => P.lockBox('#555555'), pos: [0.38, 1.05, -3.85] });
        add({ id: 'clue', label: 'Cuadro «Nocturno»', build: () => P.lampsPainting(C.A.lamps), pos: [-3.95, 1.7, 1.6], ry: Math.PI / 2, clue: 'Un cuadro con cuatro lámparas colgando. De izquierda a derecha: ' + C.A.lamps.map(v => v ? 'encendida' : 'apagada').join(', ') + '.' });
      } else {
        lock(0, { build: () => P.switches(), pos: [1.3, 1.3, -3.97] });
        reveal(0, { build: () => P.note(['SILLAS · REVISTAS', '· LÁMPARAS DEL CUADRO', '(en la otra sala)'], 0.6, 0.45, { bg: null, ink: 'rgba(170,20,40,.95)', size: 40, font: 'bold 40px "Courier New", monospace' }), pos: [3.93, 1.65, -2.2], ry: -Math.PI / 2 });
        lock(1, { build: () => P.symbolPanel('▲ ★ ●'), pos: [-1.4, 1.45, -3.96] });
        reveal(1, { build: () => P.note(['lámparas encendidas', 'del cuadro de tu pareja', '× sillas de tu sala'], 0.34, 0.26, { size: 38 }), pos: [-1.4, 1.1, -3.975] });
        lock(2, { build: () => P.colorLock(['#2c6fd1', '#c0392b', '#e5c02a', '#2e9c4f']), pos: [0.38, 1.05, -3.85] });
        add({ id: 'clue', label: 'Reloj de pared', build: () => P.clock(C.B.clock), pos: [-3.95, 2.0, 1.6], ry: Math.PI / 2, clue: 'El reloj está detenido. Marca exactamente las ' + C.B.clock + '.' });
      }
    } else if (L.id === 'biblioteca') {
      // Muebles pegados al techo (al revés)
      const H = 3.2;
      add({ id: 'shelf1', build: () => P.bookshelf(), pos: [-3.75, H, -1], ry: Math.PI / 2, flip: true });
      add({ id: 'shelf2', build: () => P.bookshelf(), pos: [3.75, H, 1], ry: -Math.PI / 2, flip: true });
      add({ id: 'ctable', build: () => P.table(1.4, 0.8, 0.75, '#4a2f1d', 'WoodenTable_01'), pos: [0.6, H, 1.5], flip: true });
      add({ id: 'cchair', build: () => P.chair('#6b2e2e', 'WoodenChair_01'), pos: [0.6, H, 2.3], ry: Math.PI, flip: true });
      add({ id: 'carm', build: () => model('ArmChair_01', () => new T.Group()), pos: [-2.6, H, -3.1], ry: 0.5, flip: true });
      add({ id: 'chand', label: 'Lámpara de araña', build: () => P.chandelier(), pos: [0, 0, 0], info: 'La lámpara de araña está en el suelo, apuntando hacia arriba. Aquí todo está al revés.' });
      add({ id: 'door', label: 'Puerta', build: () => P.door('#3b2a1f'), pos: [0, 0, -3.95], door: true });
      lock(0, { build: () => P.lockBox('#b08d2e'), pos: [0.35, 1.05, -3.85] });
      if (sd === 'A') {
        add({ id: 'lect', build: () => P.lectern(), pos: [-2, 0, 2.6], solid: [0.5, 0.4] });
        reveal(0, { build: () => P.floorNote(['♦ = 7   ♥ = 1', '♠ = 8   ♣ = 4'], { size: 64 }), pos: [0.9, 0, -1.4], ry: 0.4 });
        lock(1, { build: () => P.candles(), pos: [2.8, 0, -3.3], solid: [0.9, 0.4], candles: true, answerLit: ST[1].answer });
        reveal(1, { build: () => P.stars(), pos: [2.8, 2.0, -3.97] });
        lock(2, { build: () => P.lockBox('#6b4a1e'), pos: [-2, 0.62, 2.37], ry: Math.PI });
        add({ id: 'clue', label: 'Rueda de cifrado', build: () => P.cipherWheel(C.A.shift), pos: [-2, 1.12, 2.5], ry: 0, clue: 'Una rueda de cifrado. Cada letra de afuera corresponde a la letra que está ' + C.A.shift + ' lugares antes en el abecedario (D→A, E→B…).', tilt: -0.4 });
        add({ id: 'note', label: 'Nota', build: () => box(0.2, 0.01, 0.28, M('#f2e8cf')), pos: [-2, 1.13, 2.75], info: 'Una nota: «Las palabras escritas con sangre no se leen: se descifran».' });
      } else {
        add({ id: 'clue', label: 'Pared escrita', build: () => P.wallText(C.B.cipher), pos: [-3.96, 1.7, 0.6], ry: Math.PI / 2, clue: 'En la pared, pintado en rojo: «' + C.B.cipher + '».' });
        add({ id: 'gram', label: 'Gramófono', build: () => P.gramophone(), pos: [2.6, 0, 2.6], solid: [0.6, 0.6], riddle: C.B.riddle, clue: 'El gramófono repite una voz: «' + C.B.riddle + '»' });
        reveal(0, { build: () => P.floorNote(['𝄽   ♪   ♪   𝄽'], { size: 80, font: 'bold 80px serif' }), pos: [-2.4, 0, 1.6], ry: -0.3 });
        lock(1, { build: () => P.chest('♦ ♥ ♠ ♣'), pos: [1.5, 0, 3.55], solid: [0.7, 0.42] });
        reveal(1, { build: () => P.floorNote(['12 · 9 · 2 · 18 · 15'], { size: 60 }), pos: [1.5, 0.385, 3.55] });
        lock(2, { build: () => P.tiles('#6b4a32'), pos: [-1.6, 0, -1.8] });
      }
    } else {
      add({ id: 'door', label: 'Puerta', build: () => P.door('#4a3020'), pos: [0, 0, -3.95], door: true });
      const heater = !!ready(glbCache, 'scandinavian_masonry_heater');
      add({ id: 'fire', label: 'Chimenea apagada', build: () => P.fireplace(), pos: [heater ? 3.3 : 3.7, 0, 0], ry: -Math.PI / 2, solid: heater ? [1.2, 1.1] : [0.5, 1.6], info: 'La chimenea está helada. Ni una brasa.' });
      add({ id: 'win', label: 'Ventana', build: () => P.window(true), pos: [-3.96, 1.6, -1.5], ry: Math.PI / 2, info: 'Afuera nieva sin parar. El lago está congelado.' });
      add({ id: 'rugc', build: () => P.rug(TEX.carpet('#7a2e2e', '#d9b36a', [1, 1])), pos: [1.2, 0, 2.4] });
      add({ id: 'rock', build: () => model('Rockingchair_01', () => new T.Group()), pos: [1.4, 0, 2.5], ry: Math.PI / 2 + 0.3, solid: [0.7, 0.85] });
      const crate = () => model('wooden_crate_01', () => P.chest());
      if (sd === 'A') {
        add({ id: 'crate', build: crate, pos: [-3.3, 0, -3.5], ry: 0.15, solid: [0.85, 0.45] });
        add({ id: 'lantern', build: () => model('Lantern_01', () => new T.Group(), { scale: 1.3 }), pos: [-3.1, 0.35, -3.45] });
      } else {
        lock(1, { build: crate, pos: [-3.3, 0, -3.5], ry: 0.15, solid: [0.85, 0.45] });
        reveal(1, { build: () => P.floorNote(['S · N · O', 'N=1 E=2 S=3 O=4'], { size: 60 }), pos: [-3.3, 0.36, -3.5], ry: 0.15 });
      }
      const lt = ready(glbCache, 'WoodenTable_03') ? 0.83 * 0.75 : 0.72;
      if (sd === 'A') {
        add({ id: 'clue', label: 'Lámpara que parpadea', build: () => P.morseLamp(), pos: [-2.6, lt + 0.01, 2.6], morse: true, clue: 'La lámpara parpadea siempre con el mismo ritmo, se apaga un rato y vuelve a empezar.' });
        add({ id: 'ltable', build: () => P.table(0.6, 0.6, 0.72, '#4a3020', 'WoodenTable_03', { scale: 0.75 }), pos: [-2.6, 0, 2.6], solid: [1.0, 0.45] });
        add({ id: 'stool', build: () => model('wooden_stool_01', () => new T.Group()), pos: [-1.6, 0, 2.1], solid: [0.4, 0.4] });
        lock(0, { build: () => P.iceGrid(), pos: [1.6, 0, -2.2] });
        reveal(0, { build: () => P.fish(), pos: [1.6, 0, -0.6] });
        lock(1, { build: () => P.lanterns(), pos: [2.0, 1.6, -3.98], lanterns: true, answerLit: ST[1].answer });
        reveal(1, { build: () => P.floorNote(['«Lo contrario', 'del frío»'], { size: 64 }), pos: [-2.25, lt + 0.002, 2.45], ry: 0.2 });
        lock(2, { build: () => P.lockBox('#555555'), pos: [0.38, 1.05, -3.85] });
      } else {
        add({ id: 'clue', label: 'Tabla Morse', build: () => P.morseChart(), pos: [-3.95, 1.6, 1.6], ry: Math.PI / 2, clue: 'Una tabla con el código Morse: cada letra es una serie de destellos cortos (·) y largos (—).' });
        add({ id: 'clue2', label: 'Dibujo de baldosas', build: () => P.crackDrawing(C.B.pattern), pos: [2.0, 1.6, 3.96], ry: Math.PI, clue: 'Un dibujo de 9 baldosas. Las agrietadas son: ' + C.B.pattern.map((v, i) => v ? (['arriba izquierda', 'arriba centro', 'arriba derecha', 'centro izquierda', 'centro', 'centro derecha', 'abajo izquierda', 'abajo centro', 'abajo derecha'][i]) : null).filter(Boolean).join(', ') + '.' });
        lock(0, { build: () => P.lockBox('#555555'), pos: [0.38, 1.05, -3.85] });
        reveal(0, { build: () => P.note(['Mapa del lago', '💡  💡  ⚫  💡'], 0.6, 0.45, { size: 56 }), pos: [-1.5, 1.6, -3.97] });
        lock(2, { build: () => P.lockBox('#8a6d2e'), pos: [-0.38, 1.05, -3.85] });
      }
    }
    return objs;
  }

  function theme(level) {
    const id = E.ESC3.levels[level].id;
    if (id === 'espera') return { pbr: { wall: ['painted_plaster_wall', [3, 1.2], '#e6d3ad'], floor: ['herringbone_parquet', [3, 3], null, { roughness: 4 }], ceil: ['painted_plaster_wall', [2, 2], '#fff6ea'] }, hdri: 'lythwood_room', wall: TEX.wallpaper('#c9b48f', '#b39a70', [4, 1.2]), floor: TEX.planks('#8a5a34', [3, 3]), ceil: TEX.plaster('#efe9df', [2, 2]), light: '#ffe2b8', fog: '#2a1d14', amb: 0.55 };
    if (id === 'biblioteca') return { pbr: { wall: ['decrepit_wallpaper', [3, 1.2], '#b8c4b0'], floor: ['dirty_carpet', [2, 2], '#b05058'], ceil: ['rectangular_parquet', [3, 3]] }, hdri: 'lythwood_room', wall: TEX.wallpaper('#3f4f45', '#33423a', [4, 1.2]), floor: TEX.carpet('#5a1e24', '#c9a227', [2, 2]), ceil: TEX.planks('#5a3a22', [3, 3]), light: '#ffd9a0', fog: '#141812', amb: 0.45 };
    return { pbr: { wall: ['wood_trunk_wall', [2.5, 1]], ceil: ['roof_planks', [2, 2]] }, hdri: 'snowy_forest', wall: TEX.logs([3, 1]), floor: TEX.ice(6, [2, 2]), ceil: TEX.logs([3, 2]), light: '#cfe6ff', fog: '#9fb7c9', amb: 0.6, icy: true };
  }

  // ---------- Construcción de la escena ----------
  function build(level) {
    const th = theme(level);
    const scene = new T.Scene();
    scene.background = new T.Color(th.fog);
    scene.fog = new T.Fog(th.fog, 6, 16);
    const W = 8, D = 8, H = 3.2;
    const P3 = k => { const d = th.pbr[k]; return d && pbr(d[0], d[1], Object.assign(d[2] ? { color: d[2] } : {}, d[3])); };
    const floorM = th.icy ? new T.MeshPhysicalMaterial({ map: th.floor, roughness: 0.35, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12 }) : P3('floor') || M('#ffffff', { map: th.floor, roughness: 0.7 });
    const floor = new T.Mesh(new T.PlaneGeometry(W, D), floorM);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const ceil = new T.Mesh(new T.PlaneGeometry(W, D), P3('ceil') || M('#ffffff', { map: th.ceil, roughness: 0.9 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = H; scene.add(ceil);
    const wallM = P3('wall') || M('#ffffff', { map: th.wall, roughness: 0.85 });
    const walls = [[0, H / 2, -D / 2, 0], [0, H / 2, D / 2, Math.PI], [-W / 2, H / 2, 0, Math.PI / 2], [W / 2, H / 2, 0, -Math.PI / 2]];
    const wallMeshes = [];
    for (const [x, y, z, ry] of walls) { const w = new T.Mesh(new T.PlaneGeometry(W, H), wallM); w.position.set(x, y, z); w.rotation.y = ry; w.receiveShadow = true; scene.add(w); wallMeshes.push(w); }
    const base = M('#2b1d14', { roughness: 0.6 });
    for (const [x, z, ry] of [[0, -D / 2 + 0.01, 0], [0, D / 2 - 0.01, Math.PI], [-W / 2 + 0.01, 0, Math.PI / 2], [W / 2 - 0.01, 0, -Math.PI / 2]]) { const b = box(W, 0.14, 0.03, base); b.position.set(x, 0.07, z); b.rotation.y = ry; scene.add(b); }

    const hemi = new T.HemisphereLight('#ffffff', '#3a2a1a', th.amb); scene.add(hemi);
    const main = new T.PointLight(th.light, 28, 14, 1.6);
    main.position.set(0, H - 0.65, 0.5); main.castShadow = true; main.shadow.mapSize.set(1024, 1024); main.shadow.bias = -0.002;
    scene.add(main);
    const bulb = new T.Mesh(new T.SphereGeometry(0.09, 16, 12), M('#fff5dd', { emissive: th.light, emissiveIntensity: 2 }));
    bulb.position.copy(main.position); scene.add(bulb);
    scene.add(at(cyl(0.008, 0.008, 0.62, M('#222'), 6), 0, H - 0.31, 0.5));

    const objs = levelDef(level, side), interact = [], colliders = [];
    const byId = {};
    for (const o of objs) {
      const m = o.build();
      m.position.set(o.pos[0], o.pos[1], o.pos[2]);
      if (o.ry) m.rotation.y = o.ry;
      if (o.tilt) m.rotation.x = o.tilt;
      if (o.flip) { m.rotation.z = Math.PI; }
      scene.add(m);
      if (o.label) { tag(m, o.id, o.label); interact.push(m); }
      if (o.solid) colliders.push({ x: o.pos[0], z: o.pos[2], w: o.ry && Math.abs(Math.sin(o.ry)) > 0.5 ? o.solid[1] : o.solid[0], d: o.ry && Math.abs(Math.sin(o.ry)) > 0.5 ? o.solid[0] : o.solid[1] });
      byId[o.id] = { def: o, mesh: m };
    }
    // Luz ambiental con un HDRI: reflejos y sombras suaves como en una foto
    const hdr = ready(hdrCache, th.hdri);
    if (hdr && R) {
      R.pmrem = R.pmrem || new T.PMREMGenerator(R.renderer);
      R.envs = R.envs || {};
      R.envs[th.hdri] = R.envs[th.hdri] || R.pmrem.fromEquirectangular(hdr).texture;
      scene.environment = R.envs[th.hdri];
      hemi.intensity = th.amb * 0.4;
      scene.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if ('envMapIntensity' in m) m.envMapIntensity = th.icy ? 0.7 : 0.45; });
      floor.material.envMapIntensity = th.icy ? 0.3 : 0.18; // el suelo refleja menos las ventanas del HDRI
    }
    const camera = new T.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 40);
    camera.position.set(0, 1.6, 2.6);
    look.yaw = 0; look.pitch = 0;
    return { scene, camera, interact, colliders, byId, main, hemi, wallMeshes, floor, th, morseT: 0, morseSeq: buildMorse(E.ESC3.levels[level].clues.A && E.ESC3.levels[level].clues.A.morse) };
  }

  function buildMorse(word) {
    if (!word) return null;
    const U = 320, seq = [];
    E.morse(word).forEach((code, li) => {
      if (li) seq.push([0, U * 3]);
      code.split('').forEach((c, ci) => { if (ci) seq.push([0, U]); seq.push([1, c === '.' ? U : U * 3]); });
    });
    seq.push([0, U * 7]);
    return { seq, total: seq.reduce((a, b) => a + b[1], 0) };
  }
  function morseOn(m, t) {
    let x = t % m.total;
    for (const [on, d] of m.seq) { if (x < d) return !!on; x -= d; }
    return false;
  }

  // ---------- Interfaz superpuesta ----------
  function hud() {
    let el = document.getElementById('e3');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'e3';
    el.innerHTML = '<div class="e3-top"><button class="e3-btn" data-act="e3Exit" aria-label="Salir">✕</button><div class="e3-title"><b id="e3Name"></b><span id="e3Time"></span></div>' +
      '<button class="e3-btn" data-act="e3Notes" aria-label="Notas">📓</button><button class="e3-btn" data-act="call" aria-label="Llamar">📞</button></div>' +
      '<div id="e3Danger" class="e3-danger"></div><div class="e3-cross"></div><div id="e3Prompt" class="e3-prompt" hidden></div>' +
      '<div id="e3Joy" class="e3-joy"><div class="e3-knob"></div></div><div id="e3Hint" class="e3-hint">Arrastra para mirar · usa el círculo para caminar · toca los objetos</div>' +
      '<div id="e3Msg" class="e3-msg" hidden></div>';
    document.body.appendChild(el);
    return el;
  }

  function onResize() {
    if (!R) return;
    R.camera.aspect = innerWidth / innerHeight; R.camera.updateProjectionMatrix();
    R.renderer.setSize(innerWidth, innerHeight);
  }

  // ---------- Controles ----------
  function bindControls(canvas) {
    const joyEl = document.getElementById('e3Joy'), knob = joyEl.firstChild;
    const inJoyZone = (x, y) => x < innerWidth * 0.45 && y > innerHeight * 0.55;
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      if (e.pointerType !== 'mouse' && joy.id === null && inJoyZone(e.clientX, e.clientY)) {
        joy.id = e.pointerId; joy.x0 = e.clientX; joy.y0 = e.clientY; joy.dx = joy.dy = 0;
        joyEl.style.left = (e.clientX - 60) + 'px'; joyEl.style.top = (e.clientY - 60) + 'px'; joyEl.classList.add('on');
        return;
      }
      if (drag.id === null) { drag.id = e.pointerId; drag.x = drag.sx = e.clientX; drag.y = drag.sy = e.clientY; drag.t = performance.now(); drag.moved = 0; }
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
        if (e.type === 'pointerup' && drag.moved < 14 && performance.now() - drag.t < 450) {
          // Se abre en el "click" que el móvil manda justo después del toque: si se abriera ya,
          // ese click caería sobre la hoja recién abierta y la cerraría al instante.
          const x = e.clientX, y = e.clientY;
          clearTimeout(drag.tap); drag.tap = setTimeout(() => { drag.tap = 0; tapAt(x, y); }, 450);
        }
      }
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('click', e => { if (drag.tap) { clearTimeout(drag.tap); drag.tap = 0; tapAt(e.clientX, e.clientY); } });
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  }
  function kd(e) { keys[e.key.toLowerCase()] = true; }
  function ku(e) { keys[e.key.toLowerCase()] = false; }

  const ray = () => new T.Raycaster();
  function pick(x, y) {
    const rc = ray(), v = new T.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    rc.setFromCamera(v, R.camera);
    const hit = rc.intersectObjects(R.interact, true).find(h => visibleNow(h.object));
    return hit ? { id: hit.object.userData.id, label: hit.object.userData.label, dist: hit.distance } : null;
  }
  function visibleNow(o) { for (; o; o = o.parent) if (!o.visible) return false; return true; }
  // Lo que aparece al abrir cerraduras y las velas/faroles que se encienden
  function syncProgress() {
    if (!R || !R.byId) return;
    const done = E.esc3Progress(state, side);
    for (const id in R.byId) {
      const { def, mesh } = R.byId[id];
      if (def.after !== undefined) mesh.visible = done >= def.after;
      const lit = def.lock && done > def.step;
      if (def.candles) mesh.userData.flames.forEach((f, i) => { f.visible = lit && !!def.answerLit[i]; });
      if (def.lanterns) mesh.userData.bulbs.forEach((b, i) => { b.visible = lit && !!def.answerLit[i]; });
    }
  }
  function tapAt(x, y) {
    if (document.getElementById('sheet')) return;
    const h = pick(x, y);
    if (!h) return;
    if (h.dist > 4) { msg('Acércate más para examinar: ' + h.label); return; }
    interactWith(h.id);
  }

  function msg(t, ms) {
    const el = document.getElementById('e3Msg');
    if (!el) return;
    el.textContent = t; el.hidden = false;
    clearTimeout(msg.tm); msg.tm = setTimeout(() => { el.hidden = true; }, ms || 2600);
  }

  // ---------- Bucle ----------
  function move(dt) {
    let f = 0, s = 0;
    if (keys.w || keys.arrowup) f += 1; if (keys.s || keys.arrowdown) f -= 1;
    if (keys.a || keys.arrowleft) s -= 1; if (keys.d || keys.arrowright) s += 1;
    f -= joy.dy; s += joy.dx;
    const l = Math.hypot(f, s);
    if (l > 1) { f /= l; s /= l; }
    const sp = 2.1 * dt, c = R.camera.position;
    const nx = c.x + (-Math.sin(look.yaw) * f + Math.cos(look.yaw) * s) * sp;
    const nz = c.z + (-Math.cos(look.yaw) * f - Math.sin(look.yaw) * s) * sp;
    const lim = 3.65, r = 0.3;
    const blocked = (x, z) => R.colliders.some(b => Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r);
    if (!blocked(nx, c.z)) c.x = Math.max(-lim, Math.min(lim, nx));
    if (!blocked(c.x, nz)) c.z = Math.max(-lim, Math.min(lim, nz));
    // Pasos: leve balanceo al caminar
    R.bob = (R.bob || 0) + l * dt * 9;
    c.y = 1.6 + (l > 0.05 ? Math.sin(R.bob) * 0.025 : 0);
    R.camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (!R) return;
    const dt = Math.min(0.05, (t - (lastT || t)) / 1000); lastT = t;
    move(dt);
    const { L, rem, frac } = timing();
    // Peligro de la sala
    if (L.danger === 'calor') { R.main.color.setRGB(1, 0.85 - frac * 0.45, 0.7 - frac * 0.55); R.scene.fog.color.setRGB(0.16 + frac * 0.35, 0.11, 0.08); R.scene.background.copy(R.scene.fog.color); }
    if (L.danger === 'gravedad' && rem !== null && rem < 60000) { const k = (60000 - rem) / 60000 * 0.02; R.camera.position.x += (Math.random() - 0.5) * k; }
    if (L.danger === 'hielo' && rem !== null && rem < 90000) { const k = (90000 - rem) / 90000 * 0.015; R.camera.position.y += (Math.random() - 0.5) * k; }
    // Luz Morse
    const lamp = R.byId.clue && R.byId.clue.def.morse ? R.byId.clue.mesh : null;
    if (lamp && R.morseSeq) { const on = morseOn(R.morseSeq, t); lamp.userData.bulb.material.emissiveIntensity = on ? 3 : 0.05; lamp.userData.light.intensity = on ? 6 : 0; }
    // Puerta abierta si resolvieron su lado
    const door = R.byId.door && R.byId.door.mesh.userData.pivot;
    if (door) {
      const target = state[side] ? -1.35 : 0, d = target - door.rotation.y;
      if (Math.abs(d) > 0.002) { door.rotation.y += d * Math.min(1, dt * 3); R.renderer.shadowMap.needsUpdate = true; }
    }
    // Indicador de objeto al frente
    if (t - (R.pt || 0) > 150) {
      R.pt = t;
      const h = pick(innerWidth / 2, innerHeight / 2), pr = document.getElementById('e3Prompt');
      if (pr) { if (h && h.dist < 4) { pr.textContent = '👆 ' + h.label; pr.hidden = false; } else pr.hidden = true; }
    }
    const dn = E.esc3Progress(state, side);
    if (dn !== R.prog) { R.prog = dn; syncProgress(); R.renderer.shadowMap.needsUpdate = true; }
    R.renderer.render(R.scene, R.camera);
  }

  function timing() {
    const L = E.ESC3.levels[state.level || 0];
    const rem = E.esc3Remaining(state, Date.now());
    return { L, rem, frac: rem === null ? 0 : 1 - Math.max(0, rem) / (L.mins * 60000) };
  }
  // El reloj va aparte del dibujo: aunque el móvil vaya lento, el tiempo se cumple igual
  function hudTick() {
    if (!R) return;
    const { L, rem, frac } = timing();
    const n = document.getElementById('e3Name'), tm = document.getElementById('e3Time'), dg = document.getElementById('e3Danger');
    if (!n) return;
    n.textContent = 'Sala ' + ((state.level || 0) + 1) + ' de 3 · ' + L.name;
    tm.textContent = rem === null ? '' : E.mmss(Math.max(0, rem));
    tm.className = rem !== null && rem < 60000 ? 'urgent' : '';
    const temp = Math.round(24 + frac * 36);
    dg.textContent = L.danger === 'calor' ? '🌡️ ' + temp + ' °C' : L.danger === 'gravedad' ? (rem < 60000 ? '⚠️ ¡La gravedad está volviendo!' : '🙃 Gravedad invertida') : (rem < 90000 ? '🧊 ¡El hielo se está rompiendo!' : '🧊 El hielo cruje');
    dg.textContent += state[side] ? ' · ✅ Tu puerta está abierta' : ' · 🔒 ' + E.esc3Progress(state, side) + '/' + L[side].steps.length;
    // Se acabó el tiempo: reinicia la sala (una sola vez por intento)
    if (rem !== null && rem <= 0 && !E.esc3LevelDone(state) && failGuard !== state.levelAt) {
      failGuard = state.levelAt;
      const next = E.esc3Fail(state, Date.now());
      Sync.patchCouple(S.code, { escape3: next }).catch(() => { });
    }
  }

  // ---------- Interacción ----------
  function interactWith(id) {
    const o = R.byId[id];
    if (!o) return;
    const d = o.def, L = E.ESC3.levels[state.level], p = L[side], done = E.esc3Progress(state, side);
    if (!visibleNow(o.mesh)) return;
    if (d.door) {
      if (state[side]) return msg('Tu puerta está abierta. Esperen a que la otra también se abra.');
      const nx = p.steps[done];
      return openSheet('<div class="closeup">🚪</div><h2>La puerta está cerrada</h2><p style="margin-top:0">' + esc(p.door) + '</p>' +
        '<p><b>Cerraduras abiertas: ' + done + ' de ' + p.steps.length + '.</b> Ahora toca: <b>' + esc(nx.lock) + '</b>. ' + esc(nx.hint) + '</p><button class="btn block" data-act="closeSheet">Seguir buscando</button>');
    }
    if (d.lock) {
      if (d.step < done) return msg('Ya abriste: ' + d.label + '.');
      if (d.step > done) return msg('🔒 ' + d.label + ' sigue bloqueado. Primero abre: ' + p.steps[done].lock + '.', 3200);
      return openLock(p.steps[d.step], d.label, d.step);
    }
    if (d.reveal !== undefined) {
      const txt = p.steps[d.reveal].reveal;
      addNote3(d.id, txt);
      return openSheet('<h2>' + esc(d.label) + '</h2><p style="margin-top:0">' + esc(txt) + '</p><p class="small" style="color:var(--ok);font-weight:700">📓 Pista guardada en tus notas. Cuéntasela a tu pareja: es para su sala.</p><button class="btn block" data-act="closeSheet">Seguir</button>');
    }
    if (d.clue) {
      addNote3(d.id, d.clue);
      if (d.riddle && 'speechSynthesis' in window) { try { const u = new SpeechSynthesisUtterance(d.riddle); u.lang = 'es-ES'; u.rate = 0.9; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { } }
      if (d.morse) return openMorse(d);
      return openSheet('<h2>' + esc(d.label) + '</h2><p style="margin-top:0">' + esc(d.clue) + '</p><p class="small" style="color:var(--ok);font-weight:700">📓 Pista guardada en tus notas</p><button class="btn block" data-act="closeSheet">Seguir</button>');
    }
    if (d.info) return openSheet('<h2>' + esc(d.label) + '</h2><p style="margin-top:0">' + esc(d.info) + '</p><button class="btn block" data-act="closeSheet">Seguir</button>');
  }

  function openMorse(d) {
    openSheet('<h2>' + esc(d.label) + '</h2><div style="display:grid;place-items:center;margin:10px 0"><div id="mLamp" style="width:90px;height:90px;border-radius:50%;background:#3a3020;box-shadow:none;transition:background .05s"></div></div>' +
      '<p style="margin-top:0">' + esc(d.clue) + ' Cuenta los destellos cortos y largos y díctaselos a tu pareja.</p><p class="small" style="color:var(--ok);font-weight:700">📓 Pista guardada en tus notas</p><button class="btn block" data-act="closeSheet">Seguir</button>');
    const t0 = performance.now();
    const tick = () => {
      const el = document.getElementById('mLamp');
      if (!el) return;
      const on = morseOn(R.morseSeq, performance.now() - t0);
      el.style.background = on ? '#ffe08a' : '#3a3020'; el.style.boxShadow = on ? '0 0 40px 12px rgba(255,210,120,.8)' : 'none';
      requestAnimationFrame(tick);
    };
    tick();
  }

  let LK = null;
  function openLock(p, label, step) {
    if (state[side]) return msg('Ya resolviste esta cerradura.');
    LK = { p, label, step, v: p.kind === 'switches' ? [0, 0, 0, 0] : p.kind === 'grid' ? [0, 0, 0, 0, 0, 0, 0, 0, 0] : '' };
    openSheet('<div id="lk"></div>', () => drawLock());
  }
  function drawLock(bad) {
    const el = document.getElementById('lk');
    if (!el || !LK) return;
    const p = LK.p;
    let h = '<h2>' + esc(LK.label) + '</h2><p class="muted" style="margin-top:0">' + esc(p.hint) + '</p>';
    if (p.kind === 'keypad') {
      h += '<div class="display' + (bad ? ' shake' : '') + '">' + (LK.v + '____').slice(0, p.len) + '</div><div class="keypad">' +
        [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => '<button data-act="lkKey" data-v="' + n + '">' + n + '</button>').join('') +
        '<button data-act="lkDel">⌫</button><button data-act="lkKey" data-v="0">0</button><button data-act="lkTry" style="background:var(--accent);color:var(--accent-ink)">✓</button></div>';
    } else if (p.kind === 'switches') {
      h += '<div class="' + (bad ? 'shake' : '') + '" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:10px 0">' + LK.v.map((on, i) => '<button data-act="lkToggle" data-v="' + i + '" style="padding:18px 0;border-radius:14px;font-size:30px;background:' + (on ? '#ffe08a' : 'var(--surface-2)') + '">' + (on ? '💡' : '⚫') + '<div class="small" style="font-size:12px">' + (on ? 'Encendida' : 'Apagada') + '</div></button>').join('') + '</div>' +
        '<button class="btn primary block" data-act="lkTry">Probar</button>';
    } else if (p.kind === 'grid') {
      h += '<div class="' + (bad ? 'shake' : '') + '" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:300px;margin:10px auto">' + LK.v.map((on, i) => '<button data-act="lkToggle" data-v="' + i + '" style="aspect-ratio:1;border-radius:12px;font-size:28px;background:' + (on ? '#7fb8d6' : '#d7eef8') + ';color:#123">' + (on ? '👣' : '') + '</button>').join('') + '</div>' +
        '<p class="muted small" style="text-align:center;margin:0 0 8px">Toca las baldosas que vas a pisar.</p><button class="btn primary block" data-act="lkTry">Pisar</button>';
    } else {
      h += '<input type="text" id="lkWord" autocomplete="off" autocapitalize="characters" maxlength="' + (p.answer.length + 4) + '" placeholder="' + p.answer.length + ' letras" style="text-transform:uppercase;font-size:24px;letter-spacing:6px;text-align:center" class="' + (bad ? 'shake' : '') + '">' +
        '<p class="muted small" style="text-align:center">' + p.answer.length + ' letras</p><button class="btn primary block" data-act="lkTry">Abrir</button>';
    }
    el.innerHTML = h;
  }
  ACTS.lkKey = el => { if (LK && LK.v.length < LK.p.len) { LK.v += el.dataset.v; drawLock(); } };
  ACTS.lkDel = () => { if (LK) { LK.v = LK.v.slice(0, -1); drawLock(); } };
  ACTS.lkToggle = el => { if (LK) { const i = +el.dataset.v; LK.v[i] = LK.v[i] ? 0 : 1; drawLock(); } };
  ACTS.lkTry = async () => {
    if (!LK) return;
    const val = LK.p.kind === 'word' ? (document.getElementById('lkWord') || {}).value : LK.v;
    if (!E.esc3Check(state.level, side, val, LK.step)) {
      vibrate([60, 40, 60]); chime(false);
      if (LK.p.kind === 'keypad') LK.v = '';
      drawLock(true);
      return;
    }
    const solved = LK.p;
    vibrate(150); chime(true); closeSheet(); LK = null;
    const next = E.esc3Solve(state, side);
    state = next; // para que lo que aparece se vea ya, sin esperar a la sincronización
    await Sync.patchCouple(S.code, E.esc3LevelDone(next) ? { escape3: E.esc3Advance(next, Date.now()) } : { ['escape3.p' + side]: next['p' + side], ['escape3.' + side]: next[side] });
    if (E.esc3LevelDone(next)) return msg('¡Las dos puertas se abrieron!', 3500);
    if (next[side]) return msg('¡Se abrió tu puerta! Ayuda a tu pareja con la suya.', 3500);
    if (solved.reveal) {
      addNote3('rev' + next['p' + side], solved.reveal);
      openSheet('<div class="closeup">🔓</div><h2>¡Abriste: ' + esc(solved.lock) + '!</h2><p style="margin-top:0"><b>' + esc(solved.revealLabel) + ':</b> ' + esc(solved.reveal) + '</p><p class="small" style="color:var(--ok);font-weight:700">📓 Guardado en tus notas. Esto es para la sala de tu pareja: díselo.</p><button class="btn block" data-act="closeSheet">Seguir</button>');
    }
  };

  function addNote3(id, text) {
    S.e3 = S.e3 || { notes: [] };
    if (!S.e3.notes.find(n => n.id === state.level + id)) { S.e3.notes.push({ id: state.level + id, text: 'Sala ' + (state.level + 1) + ': ' + text }); saveE3(); }
  }
  function saveE3() { try { localStorage.setItem('nosotros_e3' + (Sync.mode === 'demo' ? ':' + S.uid : ''), JSON.stringify(S.e3)); } catch (e) { } }
  function loadE3() { try { S.e3 = JSON.parse(localStorage.getItem('nosotros_e3' + (Sync.mode === 'demo' ? ':' + S.uid : ''))) || { notes: [] }; } catch (e) { S.e3 = { notes: [] }; } }
  ACTS.e3Notes = () => {
    const list = (S.e3 && S.e3.notes) || [];
    openSheet('<h2>📓 Tus notas</h2>' + (list.length ? list.map(n => '<p style="border-bottom:1px solid var(--line);padding-bottom:8px">' + esc(n.text) + '</p>').join('') : '<p class="muted">Todavía no encuentras pistas. Toca los objetos de la sala.</p>') +
      '<p class="muted small">Lo que tú ves, tu pareja no lo ve. Cuéntenselo por la llamada.</p><button class="btn block" data-act="closeSheet">Cerrar</button>');
  };
  ACTS.e3Exit = () => api.close();

  // ---------- Ciclo de vida ----------
  const api = {
    active: false,
    async open() {
      if (api.active) return;
      api.active = true;
      const el = hud();
      el.classList.add('loading');
      msg('Cargando la sala…', 20000);
      try { await loadThree(); } catch (e) { api.close(); throw e; }
      state = (S.couple && S.couple.escape3) || {};
      await preloadLevel(state.level || 0);
      if (!api.active) return;
      state = (S.couple && S.couple.escape3) || state;
      el.classList.remove('loading');
      loadE3();
      if (S.e3.game !== state.startedAt) { S.e3 = { notes: [], game: state.startedAt }; saveE3(); }
      side = (S.couple.uids || [])[0] === S.uid ? 'A' : 'B';
      const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
      renderer.setSize(innerWidth, innerHeight);
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
      renderer.shadowMap.autoUpdate = false; // la sala es estática: las sombras se calculan una vez
      renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.domElement.className = 'e3-canvas';
      el.prepend(renderer.domElement);
      R = { renderer };
      buildLevel(state.level || 0);
      bindControls(renderer.domElement);
      window.addEventListener('resize', onResize);
      lastT = 0; raf = requestAnimationFrame(frame);
      clearInterval(tick); tick = setInterval(hudTick, 250); hudTick();
      const L = E.ESC3.levels[state.level || 0];
      msg(L.name + ': ' + L.intro, 5000);
    },
    close() {
      api.active = false;
      cancelAnimationFrame(raf); clearInterval(tick);
      window.removeEventListener('resize', onResize); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
      if (R && R.renderer) { R.renderer.dispose(); }
      if (R && R.pmrem) R.pmrem.dispose();
      R = null; builtLevel = -1; pendingLevel = -1;
      const el = document.getElementById('e3'); if (el) el.remove();
      try { speechSynthesis.cancel(); } catch (e) { }
      render();
    },
    // Se llama cada vez que cambia el documento de la pareja
    onCouple(doc) {
      // Si los dos abrieron su puerta casi a la vez nadie avanzó: lo hace la habitación A
      const e3 = doc && doc.escape3;
      if (e3 && E.esc3LevelDone(e3) && !e3.wonAt && (doc.uids || [])[0] === S.uid && advGuard !== e3.levelAt) {
        advGuard = e3.levelAt;
        Sync.patchCouple(S.code, { escape3: E.esc3Advance(e3, Date.now()) }).catch(() => { });
      }
      if (!api.active || !R || !doc) return;
      const prev = state;
      state = doc.escape3 || {};
      if (state.wonAt) {
        if (prev && prev.wonAt === state.wonAt) return;
        msg('🎉 ¡Escaparon juntos en ' + E.mmss(state.wonAt - state.startedAt) + '!', 6000); setTimeout(() => api.active && api.close(), 3500); return; }
      if ((state.level || 0) !== builtLevel) {
        const lv = state.level || 0, L = E.ESC3.levels[lv], up = lv > builtLevel;
        if (pendingLevel === lv) return;
        pendingLevel = lv;
        msg(up ? '🚪 Sala superada. Cargando la siguiente…' : 'Cargando la sala…', 20000);
        preloadLevel(lv).then(() => {
          if (pendingLevel === lv) pendingLevel = -1;
          if (!api.active || !R || (state.level || 0) !== lv || state.wonAt) return;
          buildLevel(lv);
          msg((up ? '🚪 Sala superada. Ahora: ' : '') + L.name + '. ' + L.intro, 6000);
        });
      } else if (prev && prev.levelAt !== state.levelAt && !state.A && !state.B) {
        msg('⏱️ Se acabó el tiempo. La sala vuelve a empezar.', 4000);
        R.camera.position.set(0, 1.6, 2.6); look.yaw = 0; look.pitch = 0;
      } else if (prev && E.esc3Progress(state, side === 'A' ? 'B' : 'A') > E.esc3Progress(prev, side === 'A' ? 'B' : 'A') && !state[side === 'A' ? 'B' : 'A']) {
        msg('🔓 Tu pareja abrió una cerradura (' + E.esc3Progress(state, side === 'A' ? 'B' : 'A') + ' de 3). Pregúntale qué encontró.', 3500);
      } else if (prev && !prev[side === 'A' ? 'B' : 'A'] && state[side === 'A' ? 'B' : 'A']) {
        msg('🔓 ¡Tu pareja abrió su puerta!', 3500);
      }
    },
  };
  api._interact = id => interactWith(id); // para las pruebas automáticas
  api._info = () => R && R.renderer.info.render;
  api._view = (x, z, yaw, pitch) => { if (R) { R.camera.position.x = x; R.camera.position.z = z; look.yaw = yaw; look.pitch = pitch || 0; } };
  function buildLevel(level) {
    const b = build(level);
    Object.assign(R, b);
    builtLevel = level;
    R.prog = -1;
    R.renderer.shadowMap.needsUpdate = true;
    onResize();
    // Adelanta la descarga de la sala siguiente mientras juegan esta
    if (E.ESC3.levels[level + 1]) setTimeout(() => preloadLevel(level + 1), 3000);
  }
  return api;
})();

// ---------- Vista: vestíbulo del juego ----------
VIEWS.escape3d = () => {
  const st = (S.couple && S.couple.escape3) || {};
  const side = (S.couple.uids || [])[0] === S.uid ? 'A' : 'B';
  const p = partner();
  const lv = E.ESC3.levels;
  let h = '<div class="card hero" style="text-align:left;padding:22px 18px;background:linear-gradient(135deg,#1d1420,#5a1e2c)"><div class="small" style="opacity:.8;letter-spacing:.08em;text-transform:uppercase">Escape room 3D · para dos</div>' +
    '<div class="big" style="font-size:32px;margin:6px 0">Sin salida</div><div class="sub" style="font-weight:600">Tres salas cerradas, un reloj en contra y una sola regla: lo que tú ves, tu pareja no lo ve. Hablen por la llamada para salir.</div></div>';
  h += '<div class="card"><h2>Las salas</h2>' + lv.map((L, i) => {
    const done = st.wonAt || (st.startedAt && (st.level || 0) > i), cur = st.startedAt && !st.wonAt && (st.level || 0) === i;
    return '<div class="item"><span style="font-size:26px">' + (done ? '✅' : cur ? '▶️' : ['🔥', '🙃', '🧊'][i]) + '</span><span class="tx"><b>' + (i + 1) + '. ' + esc(L.name) + '</b><div class="small muted">' + esc(L.intro) + ' · ' + L.mins + ' min</div></span></div>';
  }).join('') + '</div>';
  h += '<div class="card"><div class="grid2"><div class="clock"><div class="small muted">' + esc(me().name || 'Tú') + '</div><b>Habitación ' + side + '</b></div><div class="clock"><div class="small muted">' + esc(p ? p.name : 'Tu pareja') + '</div><b>Habitación ' + (side === 'A' ? 'B' : 'A') + '</b></div></div>' +
    (p ? '' : '<p class="small" style="color:var(--warn);font-weight:700;margin-bottom:0">Tu pareja aún no se une. El juego necesita a los dos.</p>') + '</div>';
  if (st.wonAt) h += '<div class="card" style="text-align:center"><div style="font-size:48px">🏆</div><h2>¡Escaparon en ' + E.mmss(st.wonAt - st.startedAt) + '!</h2><p class="muted" style="margin:0">Reinicios por tiempo: ' + (st.fails || 0) + '</p></div><button class="btn primary block" data-act="e3New">Jugar otra vez</button>';
  else if (st.startedAt) h += '<button class="btn primary block" data-act="e3Open">Entrar a la sala ' + ((st.level || 0) + 1) + '</button><button class="btn block sm" style="margin-top:10px;color:var(--muted)" data-act="e3New">Empezar de cero</button>';
  else h += '<button class="btn primary block" data-act="e3New">Empezar el juego</button>';
  h += '<p class="muted small" style="text-align:center">Consejo: abran la llamada 📞 antes de entrar. Con auriculares se escucha mejor.</p>';
  return h;
};
ACTS.e3Open = async () => { try { await Esc3D.open(); } catch (e) { toast(e.message); } };
ACTS.e3New = () => askConfirm('El juego empezará desde la primera sala para los dos.', 'Empezar', async () => {
  const t = Date.now();
  const e3 = { level: 0, levelAt: t, startedAt: t, A: false, B: false, fails: 0 };
  await Sync.patchCouple(S.code, { escape3: e3 });
  S.couple.escape3 = e3;
  try { await Esc3D.open(); } catch (e) { toast(e.message); }
});
