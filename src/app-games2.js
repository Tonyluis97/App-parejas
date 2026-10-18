// Más juegos para dos: verdad o reto, yo nunca he, tres en raya, cartas de conversación, ruleta de citas y ¿qué tanto me conoces?
'use strict';

function g(key) { return (S.couple && S.couple[key]) || null; }
function setGame(key, val) { return Sync.patchCouple(S.code, { [key]: val }); }
function needPartner() { return partnerId() ? '' : '<div class="banner">Tu pareja aún no se une. Pueden jugar cuando esté conectada.</div>'; }
const CALL_TIP = '<p class="muted small" style="text-align:center;margin:10px 0 0">Toca 📞 arriba para jugar hablando.</p>';

// ---------- Lista de juegos ----------
VIEWS.games = () => {
  const er = (S.couple && S.couple.escape) || {};
  const prog = E.escapeProgress(er);
  const game = (v, ic, t, d, extra) => '<div class="card game" data-act="tab" data-v="' + v + '" role="button"><div class="ic">' + ic + '</div><div><h3>' + t + '</h3><div class="muted small">' + d + '</div>' + (extra || '') + '</div></div>';
  return game('escape', '🗝️', 'La casa de los recuerdos', 'Escape room en primera persona. Cada uno en una habitación; solo hablando encuentran la salida.',
    '<div class="small" style="margin-top:4px;font-weight:700;color:var(--accent)">' + (E.escapeWon(er) ? '✅ Escaparon en ' + E.mmss(er.wonAt - er.startedAt) : prog ? 'En curso: ' + prog + ' de 4 cerraduras' : 'Con llamada de voz') + '</div>') +
    game('tod', '🔥', 'Verdad o reto', 'Por turnos: elige verdad o reto y cúmplelo por la llamada.') +
    game('ttt', '❌', 'Tres en raya', 'El clásico, cada uno desde su móvil.') +
    game('quiz', '🧠', '¿Qué tanto me conoces?', 'Uno responde sobre sí mismo y el otro adivina.') +
    game('would', '🤔', '¿Qué prefieres?', 'Elijan a la vez y descubran si coinciden.') +
    game('never', '🙊', 'Yo nunca he…', 'Confiesen a la vez y vean quién sí lo ha hecho.') +
    game('cards', '🃏', 'Cartas de conversación', 'Preguntas para hablar de recuerdos, futuro y sueños.') +
    game('roulette', '🎡', 'Ruleta de citas', 'Gira y descubran su próxima cita a distancia.');
};

// ---------- Verdad o reto ----------
VIEWS.tod = () => {
  const s = g('tod') || {};
  const turn = s.turn || (S.couple.uids || [])[0];
  const myTurn = turn === S.uid;
  let h = needPartner() + '<div class="card" style="text-align:center"><p class="muted" style="margin:0">Ronda ' + ((s.n || 0) + 1) + '</p><h2 style="font-size:20px;margin:8px 0">Turno de ' + esc(myTurn ? 'ti' : partnerName()) + '</h2>';
  if (!s.card || s.card.done) {
    h += myTurn ? '<p class="muted">Elige:</p><div class="grid2"><button class="btn primary" style="padding:22px" data-act="todPick" data-v="truth">🗣️ Verdad</button><button class="btn" style="padding:22px;background:var(--accent-2);color:#fff" data-act="todPick" data-v="dare">⚡ Reto</button></div>'
      : '<p class="muted">Esperando a que ' + esc(partnerName()) + ' elija verdad o reto…</p>';
  } else {
    const isTruth = s.card.type === 'truth';
    h += '<div class="answer" style="font-size:18px;font-weight:700;padding:18px"><b>' + (isTruth ? '🗣️ Verdad' : '⚡ Reto') + ' para ' + esc(myTurn ? 'ti' : partnerName()) + '</b>' + esc(s.card.text) + '</div>' +
      (myTurn ? '<button class="btn block" style="margin-top:10px" data-act="todPick" data-v="' + s.card.type + '">Cambiar ' + (isTruth ? 'pregunta' : 'reto') + '</button>' : '') +
      '<button class="btn primary block" style="margin-top:10px" data-act="todNext">' + (myTurn ? 'Listo, cumplido' : '¡Cumplió! Me toca') + '</button>';
  }
  return h + CALL_TIP + '</div>';
};
ACTS.todPick = el => {
  const s = g('tod') || {};
  const type = el.dataset.v, list = type === 'truth' ? E.TRUTHS : E.DARES;
  const prev = s.card && s.card.type === type ? s.card.i : -1;
  const i = E.pickOther(list.length, prev);
  return setGame('tod', { turn: s.turn || S.uid, n: s.n || 0, card: { type, i, text: list[i], done: false } });
};
ACTS.todNext = () => {
  const s = g('tod') || {};
  const other = (S.couple.uids || []).find(u => u !== s.turn) || s.turn;
  return setGame('tod', { turn: other, n: (s.n || 0) + 1, card: null });
};

// ---------- Yo nunca he ----------
VIEWS.never = () => {
  const s = g('never') || { i: 0, picks: {} };
  const pid = partnerId(), picks = s.picks || {};
  const mine = picks[S.uid], theirs = pid ? picks[pid] : undefined;
  const both = mine !== undefined && theirs !== undefined;
  let h = needPartner() + '<div class="card" style="text-align:center"><h2 style="font-size:20px;margin:6px 0 14px">' + esc(E.NEVER[(s.i || 0) % E.NEVER.length]) + '</h2>';
  if (!both) {
    h += '<div class="grid2"><button class="btn' + (mine === true ? ' primary' : '') + '" style="padding:20px" data-act="neverPick" data-v="1">🙋 Yo sí</button><button class="btn' + (mine === false ? ' primary' : '') + '" style="padding:20px" data-act="neverPick" data-v="0">🙅 Yo nunca</button></div>' +
      '<p class="muted">' + (mine !== undefined ? 'Esperando la respuesta de ' + esc(partnerName()) + '…' : 'Se revelan las dos respuestas a la vez.') + '</p>';
  } else {
    const say = (n, v) => '<div class="answer"><b>' + esc(n) + '</b>' + (v ? '🙋 Sí lo ha hecho' : '🙅 Nunca') + '</div>';
    h += say('Tú', mine) + say(partnerName(), theirs) + '<p style="font-weight:800">' + (mine && theirs ? '¡Los dos! Cuéntense la historia 😏' : mine || theirs ? 'Uno de ustedes tiene algo que contar…' : 'Ninguno, ¡inocentes!') + '</p>' +
      '<button class="btn primary block" data-act="neverNext">Siguiente</button>';
  }
  return h + CALL_TIP + '</div>';
};
ACTS.neverPick = el => {
  const s = g('never');
  const v = el.dataset.v === '1';
  if (!s) return setGame('never', { i: 0, picks: { [S.uid]: v } });
  return Sync.patchCouple(S.code, { ['never.picks.' + S.uid]: v });
};
ACTS.neverNext = () => { const s = g('never') || {}; return setGame('never', { i: (s.i || 0) + 1, picks: {} }); };

// ---------- Tres en raya ----------
VIEWS.ttt = () => {
  const s = g('ttt');
  const uids = S.couple.uids || [];
  if (!s) return needPartner() + '<div class="card" style="text-align:center"><div style="font-size:56px">❌⭕</div><p class="muted">Empieza quien toca "Nueva partida" y juega con ❌.</p><button class="btn primary block" data-act="tttNew">Nueva partida</button></div>';
  const markOf = u => u === s.x ? 'X' : 'O';
  const win = E.tttWinner(s.board);
  const myMark = markOf(S.uid), myTurn = s.turn === S.uid && !win;
  const score = s.score || {};
  let status = win === 'empate' ? 'Empate 🤝' : win ? (win === myMark ? '¡Ganaste! 🎉' : esc(partnerName()) + ' ganó') : myTurn ? 'Tu turno (' + (myMark === 'X' ? '❌' : '⭕') + ')' : 'Turno de ' + esc(partnerName());
  const cell = (c, i) => '<button data-act="tttPlay" data-v="' + i + '" style="aspect-ratio:1;border-radius:16px;background:var(--surface-2);font-size:44px;font-weight:800"' + (c || !myTurn ? ' disabled' : '') + '>' + (c === 'X' ? '❌' : c === 'O' ? '⭕' : '') + '</button>';
  return needPartner() + '<div class="card" style="text-align:center"><p class="muted" style="margin:0">Tú ' + (score[S.uid] || 0) + ' · ' + esc(partnerName()) + ' ' + (score[uids.find(u => u !== S.uid)] || 0) + '</p>' +
    '<h2 style="font-size:20px;margin:8px 0 12px">' + status + '</h2>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:320px;margin:0 auto">' + s.board.map(cell).join('') + '</div>' +
    (win ? '<button class="btn primary block" style="margin-top:14px" data-act="tttNew">Otra partida</button>' : '') + '</div>';
};
ACTS.tttNew = () => {
  const s = g('ttt') || {};
  const score = Object.assign({}, s.score || {});
  // Empieza quien no empezó la anterior
  const uids = S.couple.uids || [];
  const x = s.x ? (uids.find(u => u !== s.x) || S.uid) : S.uid;
  return setGame('ttt', { board: ['', '', '', '', '', '', '', '', ''], x, turn: x, score });
};
ACTS.tttPlay = async el => {
  const s = g('ttt');
  if (!s || s.turn !== S.uid) return;
  const mark = s.x === S.uid ? 'X' : 'O';
  const board = E.tttMove(s.board, Number(el.dataset.v), mark);
  if (!board) return;
  const win = E.tttWinner(board);
  const other = (S.couple.uids || []).find(u => u !== S.uid) || S.uid;
  const patch = { 'ttt.board': board, 'ttt.turn': other };
  if (win && win !== 'empate') patch['ttt.score.' + S.uid] = ((s.score || {})[S.uid] || 0) + 1;
  await Sync.patchCouple(S.code, patch);
  if (win) chime(win !== 'empate');
};

// ---------- Cartas de conversación ----------
const DECKS = [['recuerdos', '📸 Recuerdos'], ['futuro', '🏡 Futuro'], ['suenos', '🌠 Sueños'], ['nosotros', '💞 Nosotros']];
VIEWS.cards = () => {
  const s = g('cards') || { deck: 'recuerdos', i: 0 };
  const list = E.CARDS[s.deck] || E.CARDS.recuerdos;
  return '<div class="seg">' + DECKS.map(d => '<button class="' + (s.deck === d[0] ? 'on' : '') + '" data-act="cardsDeck" data-v="' + d[0] + '">' + d[1] + '</button>').join('') + '</div>' +
    '<div class="card hero" style="padding:34px 20px;min-height:200px;display:flex;flex-direction:column;justify-content:center"><div class="small" style="opacity:.9;margin-bottom:10px">Carta ' + ((s.i % list.length) + 1) + ' de ' + list.length + '</div><div style="font-size:22px;font-weight:800;line-height:1.3">' + esc(list[s.i % list.length]) + '</div></div>' +
    '<button class="btn primary block" data-act="cardsNext">Siguiente carta</button>' +
    '<p class="muted small" style="text-align:center">Los dos ven la misma carta. Respondan por la llamada o en el chat.</p>';
};
ACTS.cardsDeck = el => setGame('cards', { deck: el.dataset.v, i: 0 });
ACTS.cardsNext = () => { const s = g('cards') || { deck: 'recuerdos', i: 0 }; return setGame('cards', { deck: s.deck, i: (s.i || 0) + 1 }); };

// ---------- Ruleta de citas ----------
VIEWS.roulette = () => {
  const s = g('roulette');
  return '<div class="card" style="text-align:center"><div id="wheel" style="font-size:90px;display:inline-block;transition:transform 1.6s cubic-bezier(.2,.8,.2,1)">🎡</div>' +
    '<h2 style="font-size:20px;margin:10px 0" id="wheelOut">' + (s ? esc(s.pick) : 'Giren la ruleta') + '</h2>' +
    (s ? '<p class="muted small" style="margin-top:0">La giró ' + esc(nameOf(s.by)) + '</p>' : '') +
    '<div class="grid2"><button class="btn primary" data-act="spin">Girar</button><button class="btn" data-act="spinSave"' + (s ? '' : ' disabled') + '>Agregar a planes</button></div></div>';
};
ACTS.spin = async () => {
  const w = $('#wheel');
  const s = g('roulette');
  const prev = s ? E.DATE_IDEAS.indexOf(s.pick) : -1;
  const i = E.pickOther(E.DATE_IDEAS.length, prev);
  if (w) w.style.transform = 'rotate(' + (720 + Math.floor(Math.random() * 360)) + 'deg)';
  await new Promise(r => setTimeout(r, 1500));
  await setGame('roulette', { pick: E.DATE_IDEAS[i], by: S.uid, t: Date.now() });
  chime(true);
};
ACTS.spinSave = async () => {
  const s = g('roulette');
  if (!s) return;
  await Sync.add(S.code, 'items', { list: 'planes', text: s.pick, done: false, by: S.uid, t: Date.now(), u: Date.now() });
  toast('Agregado a Planes ✨');
};

// ---------- ¿Qué tanto me conoces? ----------
// Pasa la pregunta a segunda persona para quien responde sobre sí mismo
function toYou(q) {
  return q.replace(/\bmi\b/g, 'tu').replace(/\bme\b/g, 'te').replace(/\b(elegiría|haría|iría)\b/g, '$1s');
}
// Uno (about) responde sobre sí mismo en secreto; el otro adivina; al revelar, quien respondió marca si acertó.
VIEWS.quiz = () => {
  const uids = S.couple.uids || [];
  const s = g('quiz') || { i: 0, about: uids[0], score: {} };
  const q = E.QUIZ[(s.i || 0) % E.QUIZ.length];
  const aboutMe = s.about === S.uid;
  const subject = aboutMe ? 'ti' : partnerName();
  const score = s.score || {};
  const pid = uids.find(u => u !== S.uid);
  let h = needPartner() + '<div class="card" style="text-align:center"><p class="muted" style="margin:0">Aciertos: tú ' + (score[S.uid] || 0) + ' · ' + esc(partnerName()) + ' ' + (score[pid] || 0) + '</p>' +
    '<p class="small" style="margin:10px 0 0;font-weight:700;color:var(--accent)">Pregunta sobre ' + esc(subject) + '</p><h2 style="font-size:20px;margin:6px 0 14px">' + esc(aboutMe ? toYou(q) : partnerName() + ' pregunta: «' + q + '»') + '</h2>';
  if (s.answer == null || s.guess == null) {
    const mineDone = aboutMe ? s.answer != null : s.guess != null;
    if (mineDone) h += '<p class="muted">Listo. Esperando a ' + esc(partnerName()) + '…</p>';
    else h += '<form data-act="quizSend"><input type="text" id="quizIn" maxlength="80" placeholder="' + (aboutMe ? 'Tu respuesta (secreta)' : 'Tu respuesta: ¿qué crees?') + '" required><button class="btn primary block" style="margin-top:10px">' + (aboutMe ? 'Guardar respuesta' : 'Adivinar') + '</button></form>';
  } else {
    h += '<div class="answer"><b>Respuesta de ' + esc(aboutMe ? 'ti' : partnerName()) + '</b>' + esc(s.answer) + '</div><div class="answer"><b>Lo que adivinó ' + esc(aboutMe ? partnerName() : 'ti') + '</b>' + esc(s.guess) + '</div>';
    if (s.ok == null) h += aboutMe ? '<p style="font-weight:700">¿Acertó?</p><div class="grid2"><button class="btn primary" data-act="quizJudge" data-v="1">✅ Sí</button><button class="btn" data-act="quizJudge" data-v="0">❌ No</button></div>' : '<p class="muted">' + esc(partnerName()) + ' decide si acertaste…</p>';
    else h += '<p style="font-weight:800;font-size:18px">' + (s.ok ? '¡Acertó! 🎯' : 'No acertó 😅') + '</p><button class="btn primary block" data-act="quizNext">Siguiente (cambian los papeles)</button>';
  }
  return h + '</div>';
};
ACTS.quizSend = async f => {
  const v = f.querySelector('#quizIn').value.trim();
  if (!v) return;
  const uids = S.couple.uids || [];
  const s = g('quiz');
  if (!s) return setGame('quiz', { i: 0, about: uids[0], score: {}, answer: uids[0] === S.uid ? v : null, guess: uids[0] === S.uid ? null : v, ok: null });
  return Sync.patchCouple(S.code, { [s.about === S.uid ? 'quiz.answer' : 'quiz.guess']: v });
};
ACTS.quizJudge = el => {
  const s = g('quiz') || {};
  const guesser = (S.couple.uids || []).find(u => u !== s.about);
  const ok = el.dataset.v === '1';
  const patch = { 'quiz.ok': ok };
  if (ok && guesser) patch['quiz.score.' + guesser] = ((s.score || {})[guesser] || 0) + 1;
  return Sync.patchCouple(S.code, patch);
};
ACTS.quizNext = () => {
  const s = g('quiz') || {};
  const other = (S.couple.uids || []).find(u => u !== s.about) || s.about;
  return setGame('quiz', { i: (s.i || 0) + 1, about: other, score: s.score || {}, answer: null, guess: null, ok: null });
};
