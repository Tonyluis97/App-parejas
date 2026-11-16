// Juegos: utilidades comunes y "¿Qué prefieres?".
'use strict';

function myRole() { return S.couple && (S.couple.uids || [])[0] === S.uid ? 'A' : 'B'; }

// Sonido corto de acierto o error
function chime(ok) {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    const ctx = chime.ctx || (chime.ctx = new C());
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = ok ? 880 : 180; o.type = ok ? 'sine' : 'square';
    g.gain.setValueAtTime(0.12, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.36);
  } catch (e) { }
}

// ---------- ¿Qué prefieres? ----------
VIEWS.would = () => {
  const w = (S.couple && S.couple.would) || { i: 0, picks: {}, score: 0, rounds: 0 };
  const pair = E.WOULD[(w.i || 0) % E.WOULD.length];
  const pid = partnerId(), picks = w.picks || {};
  const mine = picks[S.uid], theirs = pid ? picks[pid] : undefined;
  const both = mine !== undefined && theirs !== undefined;
  let h = '<div class="card" style="text-align:center"><p class="muted" style="margin:0">Coincidencias: <b>' + (w.score || 0) + '</b> de ' + (w.rounds || 0) + '</p><h2 style="font-size:20px;margin:10px 0">¿Qué prefieres?</h2>';
  h += '<div class="grid2">' + pair.map((opt, k) => {
    const on = mine === k;
    const tag = both ? '<div class="small" style="margin-top:6px">' + (mine === k ? '👈 Tú ' : '') + (theirs === k ? '❤️ ' + esc(partnerName()) : '') + '</div>' : '';
    return '<button class="btn" style="padding:22px 10px;flex-direction:column;' + (on ? 'background:var(--accent);color:var(--accent-ink)' : '') + '" data-act="wouldPick" data-v="' + k + '"' + (both ? ' disabled' : '') + '>' + esc(opt) + tag + '</button>';
  }).join('') + '</div>';
  if (both) h += '<p style="font-weight:800;font-size:18px">' + (mine === theirs ? '¡Coinciden! 💞' : 'Esta vez no coinciden 😅') + '</p><button class="btn primary block" data-act="wouldNext">Siguiente</button>';
  else if (mine !== undefined) h += '<p class="muted">Esperando a que ' + esc(partnerName()) + ' elija…</p>';
  else h += '<p class="muted">Elige una opción. Verás la de tu pareja cuando los dos hayan elegido.</p>';
  return h + '</div>';
};
ACTS.wouldPick = el => {
  const w = (S.couple && S.couple.would) || null;
  if (!w) return Sync.patchCouple(S.code, { would: { i: 0, picks: { [S.uid]: Number(el.dataset.v) }, score: 0, rounds: 0 } });
  return Sync.patchCouple(S.code, { ['would.picks.' + S.uid]: Number(el.dataset.v) });
};
ACTS.wouldNext = () => {
  const w = S.couple.would || {}, picks = w.picks || {}, pid = partnerId();
  const match = picks[S.uid] !== undefined && picks[S.uid] === picks[pid];
  return Sync.patchCouple(S.code, { would: { i: (w.i || 0) + 1, picks: {}, score: (w.score || 0) + (match ? 1 : 0), rounds: (w.rounds || 0) + 1 } });
};
