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


  // ---------- Fechas importantes ----------
  // Próxima vez que ocurre una fecha (si es anual, la del año en curso o el siguiente)
  function nextOccurrence(dateStr, todayStr, yearly) {
    if (parseDay(dateStr) === null || parseDay(todayStr) === null) return null;
    if (!yearly) return dateStr;
    const [, m, d] = dateStr.split('-');
    const y = +todayStr.slice(0, 4);
    const fix = yy => {
      // 29 de febrero en año no bisiesto pasa al 28
      const leap = (yy % 4 === 0 && yy % 100 !== 0) || yy % 400 === 0;
      return yy + '-' + m + '-' + (m === '02' && d === '29' && !leap ? '28' : d);
    };
    const thisYear = fix(y);
    return daysBetween(todayStr, thisYear) >= 0 ? thisYear : fix(y + 1);
  }

  // Años que se cumplen en la próxima ocurrencia
  function yearsAt(dateStr, occStr) {
    if (parseDay(dateStr) === null || parseDay(occStr) === null) return null;
    return +occStr.slice(0, 4) - +dateStr.slice(0, 4);
  }

  function addDays(dayStr, n) {
    const x = parseDay(dayStr);
    if (x === null) return null;
    return new Date(x + n * DAY).toISOString().slice(0, 10);
  }

  // Racha: días seguidos en que los dos se saludaron, contando hasta hoy (o hasta ayer si hoy aún falta alguien)
  // greets: lista de { day, from }; uids: los dos miembros
  function streak(greets, uids, todayStr) {
    if (!uids || uids.length < 2) return 0;
    const by = {};
    for (const g of greets || []) { (by[g.day] = by[g.day] || new Set()).add(g.from); }
    const both = d => by[d] && uids.every(u => by[d].has(u));
    let d = both(todayStr) ? todayStr : addDays(todayStr, -1), n = 0;
    while (both(d)) { n++; d = addDays(d, -1); }
    return n;
  }

  // ---------- Tres en raya ----------
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  function tttWinner(b) {
    for (const [x, y, z] of LINES) if (b[x] && b[x] === b[y] && b[x] === b[z]) return b[x];
    return b.every(c => c) ? 'empate' : null;
  }
  // Devuelve el nuevo tablero o null si la jugada no vale
  function tttMove(b, i, mark) {
    if (!Array.isArray(b) || b[i] || tttWinner(b) || i < 0 || i > 8) return null;
    const n = b.slice(); n[i] = mark; return n;
  }

  // Elige un índice al azar distinto del anterior
  function pickOther(len, prev, rand) {
    if (len <= 1) return 0;
    const r = rand || Math.random;
    let i;
    do { i = Math.floor(r() * len); } while (i === prev);
    return i;
  }

  const TRUTHS = [
    '¿Qué fue lo primero que te gustó de mí?', '¿Cuál es tu recuerdo más vergonzoso conmigo?', '¿Qué cosa mía extrañas más ahora mismo?',
    '¿Alguna vez me celaste en secreto? ¿Por qué?', '¿Qué es lo más romántico que te gustaría que hiciera?', '¿Qué canción te hace pensar en mí?',
    '¿Cuál ha sido tu sueño más raro conmigo?', '¿Qué es algo que nunca me has contado?', '¿Qué parte de nuestra relación te hace sentir más seguro o segura?',
    '¿Qué harías si yo apareciera mañana en tu puerta?', '¿Cuál fue nuestra peor cita y por qué?', '¿Qué apodo mío te gusta más?',
    '¿Qué es lo que más te cuesta de la distancia?', '¿Qué hábito mío te parece tierno?', '¿Cuándo fue la última vez que lloraste por algo de nosotros?',
    '¿Qué te gustaría que hagamos en nuestro próximo encuentro?', '¿Qué foto mía es tu favorita?', '¿Qué cosa te da miedo decirme?',
    '¿Qué es lo primero que harías si viviéramos juntos?', '¿Cómo te imaginas nuestra vida en diez años?',
  ];
  const DARES = [
    'Mándame una selfie haciendo tu mejor cara de enamorado o enamorada.', 'Cántame el coro de nuestra canción por la llamada.', 'Escríbeme un poema de cuatro líneas ahora mismo.',
    'Imita mi voz diciendo algo que yo diría.', 'Mándame una foto de lo que tienes a tu izquierda.', 'Dime tres cosas que te encantan de mí sin repetir ninguna que ya hayas dicho hoy.',
    'Baila 15 segundos y cuéntame cómo te fue.', 'Cambia tu fondo de pantalla por una foto nuestra durante un día.', 'Escríbeme una nota de amor y déjala en las Cartas para mañana.',
    'Mándame un audio diciendo "te amo" en tres idiomas.', 'Dibuja mi cara en un papel y mándame la foto.', 'Hazme un cupón de amor ahora mismo.',
    'Cuéntame un chiste malo con toda la seriedad posible.', 'Dime algo bonito con acento extranjero.', 'Haz 10 sentadillas mientras dices mi nombre.',
    'Mándame la última foto de tu galería (si te atreves).', 'Ponle un nombre nuevo a mi contacto y dime cuál es.', 'Describe nuestro primer beso con todo detalle.',
    'Elige la película que veremos juntos este fin de semana.', 'Planea en un minuto nuestra próxima cita virtual.',
  ];
  const NEVER = [
    'Yo nunca he stalkeado tus fotos viejas.', 'Yo nunca he ensayado lo que te iba a decir.', 'Yo nunca he guardado una captura de nuestro chat.',
    'Yo nunca he fingido que no estaba celoso o celosa.', 'Yo nunca he llorado viendo una película romántica.', 'Yo nunca he olvidado una fecha importante.',
    'Yo nunca he hablado de ti con mi familia por horas.', 'Yo nunca he dormido con una prenda tuya.', 'Yo nunca he releído nuestros primeros mensajes.',
    'Yo nunca he soñado contigo esta semana.', 'Yo nunca he mentido sobre haber visto una serie.', 'Yo nunca he comido algo tuyo sin avisar.',
    'Yo nunca he buscado vuelos para verte a escondidas.', 'Yo nunca he presumido de ti con mis amigos.', 'Yo nunca he escuchado una canción en bucle pensando en ti.',
  ];
  const CARDS = {
    recuerdos: ['¿Cuál es el primer recuerdo que tienes de mí?', '¿Qué momento juntos repetirías mañana mismo?', '¿Qué viaje o salida nuestra fue la mejor?', '¿Cuándo te reíste más conmigo?', '¿Qué regalo mío guardas con más cariño?', '¿Qué fue lo más difícil que superamos juntos?'],
    futuro: ['¿Dónde te gustaría que viviéramos?', '¿Qué tradición quieres que tengamos?', '¿Qué aventura quieres que hagamos antes de un año?', '¿Cómo sería nuestra casa ideal?', '¿Qué meta quieres que logremos juntos?', '¿Cómo celebramos nuestro próximo aniversario?'],
    suenos: ['¿Qué harías si no tuvieras miedo?', '¿Qué trabajo tendrías en otra vida?', '¿Qué te gustaría aprender este año?', '¿Cuál es tu lugar soñado para desconectarte?', '¿Qué te haría sentir orgulloso u orgullosa de ti?', '¿Qué deseo pedirías hoy?'],
    nosotros: ['Termina la frase: "Lo que más me gusta de ti es…"', 'Termina la frase: "Me siento amado o amada cuando…"', 'Termina la frase: "Nunca olvidaré cuando…"', 'Termina la frase: "Contigo aprendí que…"', 'Termina la frase: "Me encantaría que un día…"', 'Termina la frase: "Si estuvieras aquí ahora…"'],
  };
  const DATE_IDEAS = [
    'Cocinar la misma receta en videollamada', 'Ver una película a la vez con cuenta regresiva', 'Cena a la luz de velas por videollamada',
    'Noche de juegos en la app', 'Escuchar un álbum completo juntos', 'Tour virtual por un museo', 'Escribirse cartas y leerlas en voz alta',
    'Karaoke por llamada', 'Pedir comida a domicilio para el otro', 'Planear su próximo viaje juntos', 'Ver el amanecer o el atardecer al mismo tiempo',
    'Hacer un dibujo del otro y comparar', 'Leer el mismo capítulo de un libro', 'Noche de preguntas profundas', 'Cita de café por la mañana',
  ];
  const QUIZ = [
    '¿Cuál es mi comida favorita?', '¿Cuál es mi película favorita?', '¿Qué me da más miedo?', '¿Cuál es mi canción favorita ahora?',
    '¿Qué haría en un día libre perfecto?', '¿Cuál es mi color favorito?', '¿Qué superpoder elegiría?', '¿Cuál es mi postre favorito?',
    '¿A qué país me iría mañana?', '¿Qué es lo que más me estresa?', '¿Cuál fue mi primer trabajo o materia favorita?', '¿Qué me hace reír siempre?',
  ];
  const COUPON_IDEAS = ['Vale por un masaje', 'Vale por una cena que yo invito', 'Vale por elegir la película', 'Vale por un abrazo de 10 minutos',
    'Vale por una videollamada sin límite', 'Vale por un desayuno en la cama', 'Vale por un deseo', 'Vale por ganar una discusión'];

  const Engine = {
    today, parseDay, daysBetween, daysTogether, distanceKm, formatKm, clock,
    newCode, validCode, QUESTIONS, questionFor, WOULD, mergeRecords,
    ESCAPE, escapeTry, escapeWon, escapeProgress, norm, sameSeq, mmss,
    nextOccurrence, yearsAt, addDays, streak, tttWinner, tttMove, pickOther,
    TRUTHS, DARES, NEVER, CARDS, DATE_IDEAS, QUIZ, COUPON_IDEAS,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.Engine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
