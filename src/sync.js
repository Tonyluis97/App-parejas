// Sincronización entre los dos móviles.
// Con FIREBASE_CONFIG usa Firestore + inicio de sesión anónimo.
// Sin configuración usa un modo demo local: dos pestañas del mismo navegador hacen de dos móviles.
(function () {
  'use strict';

  const FB_VER = '12.19.0';
  const FB = 'https://www.gstatic.com/firebasejs/' + FB_VER + '/';

  // ---------- Modo demo (localStorage + BroadcastChannel) ----------
  function DemoSync() {
    const KEY = 'nosotros_demo_db';
    const listeners = new Set();
    let bc = null;
    try { bc = new BroadcastChannel('nosotros_demo'); bc.onmessage = () => fire(); } catch (e) { /* sin BroadcastChannel */ }
    window.addEventListener('storage', e => { if (e.key === KEY) fire(); });

    function load() { try { return JSON.parse(localStorage.getItem(KEY)) || { couples: {} }; } catch (e) { return { couples: {} }; } }
    function save(db) {
      try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* almacenamiento lleno o bloqueado */ }
      try { bc && bc.postMessage(1); } catch (e) { }
      setTimeout(fire, 0);
    }
    function fire() { listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }
    function uidGen() { return 'd' + Math.random().toString(36).slice(2, 10); }
    function setPath(obj, path, val) {
      const parts = path.split('.');
      let o = obj;
      for (let i = 0; i < parts.length - 1; i++) { if (typeof o[parts[i]] !== 'object' || !o[parts[i]]) o[parts[i]] = {}; o = o[parts[i]]; }
      o[parts[parts.length - 1]] = val;
    }

    let uid = null;
    return {
      mode: 'demo',
      async init() {
        try { uid = sessionStorage.getItem('nosotros_demo_uid'); } catch (e) { }
        if (!uid) { uid = uidGen(); try { sessionStorage.setItem('nosotros_demo_uid', uid); } catch (e) { } }
        return uid;
      },
      uid() { return uid; },
      async createCouple(code, data) {
        const db = load();
        if (db.couples[code]) throw new Error('Ese código ya existe, prueba otro.');
        db.couples[code] = { doc: Object.assign({}, data, { uids: [uid] }), cols: {} };
        save(db);
      },
      async joinCouple(code, member) {
        const db = load();
        const c = db.couples[code];
        if (!c) throw new Error('No existe una pareja con ese código.');
        if (!c.doc.uids.includes(uid)) {
          if (c.doc.uids.length >= 2) throw new Error('Esa pareja ya tiene dos personas.');
          c.doc.uids.push(uid);
        }
        c.doc.members = c.doc.members || {};
        c.doc.members[uid] = member;
        save(db);
      },
      // patch admite claves con puntos: { 'members.abc.mood': 'feliz' }
      async patchCouple(code, patch) {
        const db = load();
        const c = db.couples[code];
        if (!c) return;
        for (const k in patch) setPath(c.doc, k, patch[k]);
        save(db);
      },
      watchCouple(code, cb) {
        let last = null;
        const fn = () => {
          const c = load().couples[code];
          const s = JSON.stringify(c ? c.doc : null);
          if (s !== last) { last = s; cb(c ? JSON.parse(s) : null); }
        };
        listeners.add(fn); fn();
        return () => listeners.delete(fn);
      },
      async add(code, col, data) {
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        return this.set(code, col, id, data).then(() => id);
      },
      async set(code, col, id, data, merge) {
        const db = load();
        const c = db.couples[code];
        if (!c) return;
        c.cols[col] = c.cols[col] || {};
        c.cols[col][id] = merge ? Object.assign({}, c.cols[col][id], data, { id }) : Object.assign({}, data, { id });
        save(db);
      },
      watch(code, col, cb) {
        let last = null;
        const fn = () => {
          const c = load().couples[code];
          const list = Object.values((c && c.cols[col]) || {}).sort((a, b) => (a.t || 0) - (b.t || 0)).slice(-300);
          const s = JSON.stringify(list);
          if (s !== last) { last = s; cb(JSON.parse(s)); }
        };
        listeners.add(fn); fn();
        return () => listeners.delete(fn);
      },
      reset() { try { localStorage.removeItem(KEY); } catch (e) { } fire(); },
    };
  }

  // ---------- Firebase (Firestore + Auth anónima) ----------
  function FirebaseSync(config) {
    let fs = null, db = null, uid = null;
    return {
      mode: 'firebase',
      async init() {
        const [appM, authM, fsM] = await Promise.all([
          import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js'),
        ]);
        const app = appM.initializeApp(config);
        const auth = authM.getAuth(app);
        fs = fsM;
        // Caché compartida entre pestañas: con varias pestañas abiertas la caché de una sola pestaña se corrompía
        db = fsM.initializeFirestore(app, { localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() }) });
        uid = await new Promise((resolve, reject) => {
          const off = authM.onAuthStateChanged(auth, u => {
            if (u) { off(); resolve(u.uid); }
            else authM.signInAnonymously(auth).catch(reject);
          });
        });
        return uid;
      },
      uid() { return uid; },
      async createCouple(code, data) {
        await fs.setDoc(fs.doc(db, 'couples', code), Object.assign({}, data, { uids: [uid] }));
      },
      async joinCouple(code, member) {
        try {
          await fs.updateDoc(fs.doc(db, 'couples', code), { uids: fs.arrayUnion(uid), ['members.' + uid]: member });
        } catch (e) {
          if (e && e.code === 'not-found') throw new Error('No existe una pareja con ese código.');
          if (e && e.code === 'permission-denied') throw new Error('No se pudo unir: el código no existe o la pareja ya está completa.');
          throw e;
        }
      },
      async patchCouple(code, patch) { await fs.updateDoc(fs.doc(db, 'couples', code), patch); },
      watchCouple(code, cb) {
        return fs.onSnapshot(fs.doc(db, 'couples', code), s => cb(s.exists() ? s.data() : null), e => {
          console.error(e);
          // Solo se suelta la pareja si de verdad ya no somos miembros; otros errores no deben sacarnos
          if (e && e.code === 'permission-denied') cb(null); else if (window.fatalSync) fatalSync(e);
        });
      },
      async add(code, col, data) {
        const r = await fs.addDoc(fs.collection(db, 'couples', code, col), data);
        return r.id;
      },
      async set(code, col, id, data, merge) {
        await fs.setDoc(fs.doc(db, 'couples', code, col, id), Object.assign({}, data, { id }), { merge: !!merge });
      },
      watch(code, col, cb) {
        const q = fs.query(fs.collection(db, 'couples', code, col), fs.orderBy('t', 'desc'), fs.limit(300));
        return fs.onSnapshot(q, s => cb(s.docs.map(d => Object.assign({ id: d.id }, d.data())).reverse()), e => { console.error(e); if (window.fatalSync) fatalSync(e); });
      },
    };
  }

  const cfg = window.FIREBASE_CONFIG;
  window.Sync = cfg && cfg.apiKey ? FirebaseSync(cfg) : DemoSync();
})();
