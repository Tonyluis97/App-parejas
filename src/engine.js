// Motor puro de "Nosotros": sin DOM. Funciona en Node (module.exports) y en el navegador (window.Engine).
(function (root) {
  'use strict';

  const DAY = 86400000;

  // Fecha local YYYY-MM-DD en una zona horaria dada (por defecto la del dispositivo)
  function today(tz, now) {
    const d = now ? new Date(now) : new Date();
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' });
    return f.format(d);
  }

  function parseDay(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  }

  // Días entre dos fechas YYYY-MM-DD (b - a)
  function daysBetween(a, b) {
    const x = parseDay(a), y = parseDay(b);
    if (x === null || y === null) return null;
    return Math.round((y - x) / DAY);
  }

  // Días juntos contando el día de inicio como día 1
  function daysTogether(start, todayStr) {
    const n = daysBetween(start, todayStr);
    return n === null || n < 0 ? null : n + 1;
  }

  // Distancia en km entre dos puntos (haversine), redondeada a entero
  function distanceKm(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return null;
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)));
  }

  function formatKm(km) {
    if (km === null || km === undefined) return '—';
    if (km < 1) return 'menos de 1 km';
    return km.toLocaleString('es') + ' km';
  }

  // Hora local HH:MM en una zona horaria
  function clock(tz, now) {
    try {
      return new Intl.DateTimeFormat('es', { timeZone: tz || undefined, hour: '2-digit', minute: '2-digit', hour12: false }).format(now ? new Date(now) : new Date());
    } catch (e) { return '—'; }
  }

  // Código de pareja de 6 dígitos sin ceros a la izquierda ambiguos
  function newCode(rand) {
    const r = rand || Math.random;
    let s = '';
    for (let i = 0; i < 6; i++) s += String(1 + Math.floor(r() * 9));
    return s;
  }

  function validCode(s) { return /^\d{6}$/.test(String(s || '').trim()); }

  const QUESTIONS = [
    '¿Cuál es tu recuerdo favorito de nosotros?',
    '¿Qué es lo primero que pensaste de mí?',
    '¿Qué lugar del mundo quieres que visitemos juntos?',
    '¿Qué canción te recuerda a mí?',
    '¿Qué pequeño detalle mío te hace sonreír?',
    '¿Cómo sería nuestro domingo perfecto?',
    '¿Qué te gustaría que aprendiéramos juntos?',
    '¿Qué es algo que nunca te he preguntado?',
    '¿Cuál fue el momento en que supiste que me querías?',
    '¿Qué comida quieres que cocinemos juntos?',
    '¿Qué sueño tienes para dentro de cinco años?',
    '¿Qué película veríamos esta noche si estuviéramos juntos?',
    '¿Qué te hace sentir más querido o querida?',
    '¿Cuál es tu apodo favorito para mí?',
    '¿Qué es lo más loco que te gustaría hacer conmigo?',
    '¿Qué extrañas más de cuando estamos juntos?',
    '¿Qué palabra nos describe como pareja?',
    '¿Qué regalo pequeño te haría feliz hoy?',
    '¿Qué te gustaría contarme y aún no te has animado?',
    '¿Cuál fue nuestra mejor cita?',
    '¿Qué costumbre mía te parece más tierna?',
  ];

  // Pregunta del día: igual para los dos porque depende solo de la fecha
  function questionFor(dayStr) {
    const n = parseDay(dayStr);
    if (n === null) return QUESTIONS[0];
    return QUESTIONS[Math.floor(n / DAY) % QUESTIONS.length];
  }

  const WOULD = [
    ['Viajar a la playa', 'Viajar a la montaña'],
    ['Cena en casa', 'Cena en restaurante'],
    ['Película de terror', 'Comedia romántica'],
    ['Madrugar juntos', 'Trasnochar juntos'],
    ['Perro', 'Gato'],
    ['Carta escrita a mano', 'Nota de voz larga'],
    ['Pizza', 'Sushi'],
    ['Viaje sorpresa', 'Viaje planeado'],
    ['Bailar', 'Cantar karaoke'],
    ['Café', 'Té'],
  ];

  // Mezcla un registro con otro: gana el de marca de tiempo u mayor
  function mergeRecords(a, b) {
    const out = {};
    for (const src of [a || {}, b || {}]) {
      for (const id in src) {
        const r = src[id];
        if (!out[id] || (r.u || 0) > (out[id].u || 0)) out[id] = r;
      }
    }
    return out;
  }

  // ---------- Escape room "La casa de los recuerdos" ----------
  // A explora el Estudio y B explora el Ático. Cada uno ve pistas que sirven al otro.
  const ESCAPE = {
    chestCode: '2714',              // cofre del ático (lo abre B): A ve "2 _ _ 4", B ve "_ 7 1 _"
    colors: ['rojo', 'verde', 'azul', 'amarillo'], // panel del estudio (lo resuelve A): la hoja está en el cofre de B
    symbolsA: ['luna', 'estrella', 'corazón'],     // puerta del estudio: la secuencia la ve B en el telescopio
    symbolsB: ['sol', 'corazón', 'llave'],         // puerta del ático: la secuencia la ve A en el cajón
  };

  function norm(s) { return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function sameSeq(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => norm(x) === norm(b[i]));
  }

  // Intenta resolver un paso. Devuelve el nuevo estado (sin mutar) y si fue correcto.
  function escapeTry(state, step, value) {
    const s = Object.assign({ chest: false, panel: false, doorA: false, doorB: false }, state || {});
    let ok = false;
    if (step === 'chest') ok = String(value || '').replace(/\D/g, '') === ESCAPE.chestCode;
    else if (step === 'panel') ok = s.chest && sameSeq(value, ESCAPE.colors);
    else if (step === 'doorA') ok = s.panel && sameSeq(value, ESCAPE.symbolsA);
    else if (step === 'doorB') ok = s.chest && sameSeq(value, ESCAPE.symbolsB);
    if (ok) s[step] = true;
    return { state: s, ok };
  }

  function escapeWon(state) { return !!(state && state.doorA && state.doorB); }

  function escapeProgress(state) {
    const s = state || {};
    return ['chest', 'panel', 'doorA', 'doorB'].filter(k => s[k]).length;
  }

  function mmss(ms) {
    if (!(ms >= 0)) return '00:00';
    const t = Math.floor(ms / 1000);
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }

  const Engine = {
    today, parseDay, daysBetween, daysTogether, distanceKm, formatKm, clock,
    newCode, validCode, QUESTIONS, questionFor, WOULD, mergeRecords,
    ESCAPE, escapeTry, escapeWon, escapeProgress, norm, sameSeq, mmss,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.Engine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
