// 2D motion-graphics components (DOM). Each factory builds its elements once and
// returns update(t) that positions/animates them as a pure function of time.
import { el, put, prog, lerp, E, tw, vis, clamp, typeText } from './runtime.js';

export const C = {
  ink: '#07080B', bone: '#EDEAE4', dim: 'rgba(237,234,228,0.62)', gold: '#FFC83D', amber: '#F2A93B',
  red: '#FF4D4D', mint: '#3DDC97', glass: 'rgba(11,13,18,0.86)', line: 'rgba(255,255,255,0.14)',
};

const cardStyle = (w) => ({
  width: w + 'px', padding: '34px 40px', borderRadius: '28px', background: C.glass,
  border: `2px solid ${C.line}`, boxShadow: '0 30px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
  color: C.bone, fontFamily: 'Poppins',
});

/** small uppercase label with a gold bar — "PSYCHOLOGY", "STUDY", etc. */
export function kicker(parent, text, { size = 30, color = C.gold } = {}) {
  const k = el('div', { html: `<span style="display:inline-block;width:46px;height:5px;border-radius:3px;background:${color};vertical-align:middle;margin-right:16px"></span>${text}`,
    style: { fontWeight: '700', fontSize: size + 'px', letterSpacing: '0.32em', color, whiteSpace: 'nowrap' } }, parent);
  return k;
}

/** citation card: org · year, title, authors. update(t, t0, t1) */
export function studyCard(parent, { label = 'STUDY', org, year, title, authors, y = 620, w = 810, x = 505 }) {
  const card = el('div', { style: cardStyle(w) }, parent);
  const head = el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: '700', fontSize: '27px', letterSpacing: '0.22em', color: C.gold } }, card);
  head.innerHTML = `<span>● ${label}</span><span style="color:${C.dim}">${year}</span>`;
  const orgEl = el('div', { text: org, style: { marginTop: '22px', fontWeight: '800', fontSize: '50px', lineHeight: '1.08', letterSpacing: '-0.01em', position: 'static' } }, card);
  const titleEl = el('div', { style: { marginTop: '14px', fontWeight: '500', fontSize: '31px', lineHeight: '1.3', color: C.dim, minHeight: '42px', position: 'static' } }, card);
  const auth = el('div', { text: authors, style: { marginTop: '22px', paddingTop: '20px', borderTop: `2px solid ${C.line}`, fontWeight: '600', fontSize: '28px', letterSpacing: '0.04em', color: C.bone, position: 'static' } }, card);
  for (const n of [orgEl, titleEl, auth]) { n.style.transform = 'none'; }
  return (t, t0, t1) => {
    const v = vis(t, t0, t1, 0.35, 0.3);
    if (v <= 0) { put(card, { o: 0 }); return; }
    const p = prog(t, t0, t0 + 0.45);
    put(card, { x, y: y + lerp(80, 0, E.outBack(p, 1.4)), s: lerp(0.92, 1, E.outCubic(p)), o: v, r: lerp(-2, 0, E.outCubic(p)) });
    typeText(titleEl, title, t, t0 + 0.35, 42, true);
    orgEl.style.opacity = String(prog(t, t0 + 0.1, t0 + 0.4));
    auth.style.opacity = String(prog(t, t0 + 0.9, t0 + 1.3));
  };
}

/** two horizontal bars: A (expected) vs B (actual). update(t, tA, tB, tEnd) */
export function statBars(parent, { labelA, valueA, labelB, valueB, y = 640, w = 810, x = 505, colorA = 'rgba(237,234,228,0.55)', colorB = C.gold, max = 100, fmt = (v) => Math.round(v) + '%' }) {
  const card = el('div', { style: { ...cardStyle(w), padding: '40px 44px' } }, parent);
  const row = (label, color) => {
    const r = el('div', { style: { position: 'static', transform: 'none', marginBottom: '34px' } }, card);
    const top = el('div', { style: { position: 'static', transform: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } }, r);
    const l = el('div', { text: label, style: { position: 'static', transform: 'none', fontWeight: '700', fontSize: '30px', letterSpacing: '0.16em', color: C.dim } }, top);
    const v = el('div', { text: '0%', style: { position: 'static', transform: 'none', fontWeight: '900', fontSize: '86px', lineHeight: '1', color } }, top);
    const track = el('div', { style: { position: 'static', transform: 'none', marginTop: '14px', height: '26px', borderRadius: '13px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' } }, r);
    const bar = el('div', { style: { position: 'static', transform: 'none', height: '100%', width: '0%', borderRadius: '13px', background: color, boxShadow: `0 0 30px ${color}` } }, track);
    void l;
    return { v, bar };
  };
  const A = row(labelA, colorA), B = row(labelB, colorB);
  return (t, tA, tB, tEnd, tShow = tA - 0.2) => {
    const env = vis(t, tShow, tEnd, 0.3, 0.35);
    if (env <= 0) { put(card, { o: 0 }); return; }
    const p = prog(t, tShow, tShow + 0.45);
    put(card, { x, y: y + lerp(70, 0, E.outCubic(p)), o: env, s: lerp(0.94, 1, E.outCubic(p)) });
    const a = valueA * E.outCubic(prog(t, tA, tA + 1.0));
    A.v.textContent = t >= tA ? fmt(a) : '?';
    A.bar.style.width = (a / max) * 100 + '%';
    const pb = prog(t, tB, tB + 0.6);
    const b = valueB * E.outExpo(pb);
    B.v.textContent = t >= tB ? fmt(b) : '?';
    B.bar.style.width = (b / max) * 100 + '%';
    B.v.style.transform = t >= tB ? `scale(${lerp(1.6, 1, E.outBack(prog(t, tB, tB + 0.35), 2))})` : 'none';
    B.v.style.transformOrigin = '100% 80%';
  };
}

/** centred title slam with kicker: update(t, t0, t1) */
export function titleSlam(parent, { kicker: k, title, y = 760, size = 132, color = C.bone, accent = C.gold, accentIndex }) {
  const box = el('div', { style: { width: '940px', textAlign: 'center' } }, parent);
  const kk = el('div', { text: k, style: { position: 'static', transform: 'none', fontWeight: '700', fontSize: '34px', letterSpacing: '0.42em', color: accent, marginBottom: '18px' } }, box);
  const words = title.split(' ');
  const line = el('div', { style: { position: 'static', transform: 'none', fontWeight: '900', fontSize: size + 'px', lineHeight: '0.98', letterSpacing: '-0.025em', color } }, box);
  const spans = words.map((w, i) => {
    const s = document.createElement('span');
    s.textContent = w;
    Object.assign(s.style, { display: 'inline-block', margin: '0 0.1em', textShadow: '0 18px 50px rgba(0,0,0,0.7)', color: i === (accentIndex ?? words.length - 2) ? accent : color });
    line.appendChild(s);
    return s;
  });
  return (t, t0, t1) => {
    const env = vis(t, t0, t1, 0.05, 0.3);
    if (env <= 0) { put(box, { o: 0 }); return; }
    put(box, { x: 540, y, o: env, s: lerp(1.06, 1, E.outCubic(prog(t, t0, t1))) });
    kk.style.opacity = String(prog(t, t0, t0 + 0.25));
    kk.style.letterSpacing = lerp(0.8, 0.42, E.outCubic(prog(t, t0, t0 + 0.6))) + 'em';
    spans.forEach((s, i) => {
      const p = prog(t, t0 + 0.08 + i * 0.12, t0 + 0.08 + i * 0.12 + 0.28);
      s.style.opacity = String(Math.min(1, p * 2));
      s.style.transform = `translateY(${lerp(60, 0, E.outExpo(p))}px) scale(${lerp(1.8, 1, E.outExpo(p))})`;
      s.style.filter = p < 1 ? `blur(${(10 * (1 - p)).toFixed(1)}px)` : '';
    });
  };
}

/** voice waveform on a canvas: shaky (red) -> calm (white) between tCalm0..tCalm1 */
export function waveform(parent, { y = 700, w = 900, h = 300, x = 505, labels = ['● YOUR VOICE', 'HOW IT FEELS', 'HOW IT SOUNDED'] } = {}) {
  const box = el('div', { style: { ...cardStyle(w + 60), padding: '30px' } }, parent);
  const lab = el('div', { style: { position: 'static', transform: 'none', display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '26px', letterSpacing: '0.2em', color: C.dim, marginBottom: '14px' } }, box);
  lab.innerHTML = `<span>${labels[0]}</span><span id="wfstate">${labels[1]}</span>`;
  const cv = el('canvas', { style: { position: 'static', transform: 'none', width: w + 'px', height: h + 'px', display: 'block' } }, box);
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const state = lab.querySelector('#wfstate');
  return (t, t0, t1, tCalm) => {
    const env = vis(t, t0, t1, 0.3, 0.3);
    if (env <= 0) { put(box, { o: 0 }); return; }
    put(box, { x, y, o: env, s: lerp(0.95, 1, E.outCubic(prog(t, t0, t0 + 0.4))) });
    const calm = E.inOutCubic(prog(t, tCalm, tCalm + 0.9));
    state.textContent = calm > 0.5 ? labels[2] : labels[1];
    state.style.color = calm > 0.5 ? C.mint : C.red;
    g.clearRect(0, 0, w, h);
    const col = calm > 0.5 ? `rgba(237,234,228,${0.9})` : `rgba(255,77,77,0.95)`;
    g.lineWidth = 5; g.strokeStyle = col; g.shadowColor = col; g.shadowBlur = 18;
    g.beginPath();
    for (let x = 0; x <= w; x += 3) {
      const u = x / w;
      const env2 = Math.sin(Math.PI * u);
      const shaky = (Math.sin(u * 90 + t * 26) * 0.55 + Math.sin(u * 37 - t * 31) * 0.35 + Math.sin(u * 211 + t * 47) * 0.25) * env2;
      const smooth = Math.sin(u * 22 - t * 6) * 0.3 * env2;
      const yv = h / 2 + lerp(shaky, smooth, calm) * (h * 0.42);
      if (x === 0) g.moveTo(x, yv); else g.lineTo(x, yv);
    }
    g.stroke();
  };
}

export const ICONS = {
  party: `<svg viewBox="0 0 100 100" width="150" height="150"><path d="M30 12 h40 l-4 34 a16 16 0 0 1 -32 0 z" fill="none" stroke="#FFC83D" stroke-width="5" stroke-linejoin="round"/><path d="M33 34 h34" stroke="#FFC83D" stroke-width="4" opacity=".6"/><path d="M50 62 v24 M36 88 h28" stroke="#FFC83D" stroke-width="5" stroke-linecap="round"/><circle cx="76" cy="20" r="3" fill="#EDEAE4"/><circle cx="20" cy="30" r="2.5" fill="#EDEAE4"/><circle cx="82" cy="40" r="2" fill="#EDEAE4"/></svg>`,
  text: `<svg viewBox="0 0 100 100" width="150" height="150"><path d="M14 22 h72 a8 8 0 0 1 8 8 v32 a8 8 0 0 1 -8 8 h-40 l-16 14 v-14 h-16 a8 8 0 0 1 -8 -8 v-32 a8 8 0 0 1 8 -8z" fill="none" stroke="#FFC83D" stroke-width="5" stroke-linejoin="round"/><path d="M26 40 h48 M26 52 h30" stroke="#EDEAE4" stroke-width="5" stroke-linecap="round"/></svg>`,
  clock: `<svg viewBox="0 0 100 100" width="150" height="150"><circle cx="50" cy="52" r="34" fill="none" stroke="#FFC83D" stroke-width="5"/><path d="M50 52 v-20 M50 52 l14 8" stroke="#EDEAE4" stroke-width="5" stroke-linecap="round"/><path d="M22 18 l-10 10 M78 18 l10 10" stroke="#FFC83D" stroke-width="5" stroke-linecap="round"/></svg>`,
};

/** three icon tiles appearing at given times. update(t, times[3], tEnd) */
export function iconTiles(parent, items, { y = 640 } = {}) {
  const tiles = items.map((it) => {
    const b = el('div', { style: { ...cardStyle(300), width: '270px', padding: '28px 14px', textAlign: 'center' } }, parent);
    b.innerHTML = `${ICONS[it.icon] || ''}<div style="margin-top:10px;font-weight:800;font-size:${it.size || 38}px;letter-spacing:-0.01em;color:#EDEAE4">${it.label}</div>`;
    return b;
  });
  return (t, times, tEnd) => {
    tiles.forEach((b, i) => {
      const t0 = times[i];
      const env = vis(t, t0, tEnd, 0.01, 0.3);
      if (env <= 0) { put(b, { o: 0 }); return; }
      const p = prog(t, t0, t0 + 0.35);
      const x = 490 + (i - 1) * 290;
      put(b, { x, y: y + lerp(120, 0, E.outBack(p, 1.6)) + Math.sin(t * 1.6 + i) * 6, o: env * Math.min(1, p * 2), r: lerp((i - 1) * 12, (i - 1) * 3, E.outCubic(p)), s: lerp(0.6, 1, E.outBack(p, 1.8)) });
    });
  };
}

/** end card: FOLLOW pill + question. update(t, t0, t1) */
export function endCard(parent, { follow = 'FOLLOW', sub = '', question = '', y = 700 }) {
  const box = el('div', { style: { width: '820px', textAlign: 'center' } }, parent);
  const pill = el('div', { text: follow, style: { position: 'static', transform: 'none', display: 'inline-block', padding: '26px 70px', borderRadius: '70px', background: C.gold, color: C.ink, fontWeight: '900', fontSize: '64px', letterSpacing: '0.08em', boxShadow: `0 0 60px rgba(255,200,61,0.45)` } }, box);
  const s = el('div', { text: sub, style: { position: 'static', transform: 'none', marginTop: '26px', fontWeight: '600', fontSize: '38px', color: C.bone } }, box);
  const q = el('div', { style: { position: 'static', transform: 'none', marginTop: '70px', padding: '32px 36px', borderRadius: '26px', background: C.glass, border: `2px solid ${C.line}`, fontWeight: '800', fontSize: '50px', lineHeight: '1.2', color: C.bone } }, box);
  q.innerHTML = `${question} <span style="color:${C.gold}">↓</span>`;
  return (t, t0, t1, tQ) => {
    const env = vis(t, t0, t1, 0.3, 0.35);
    if (env <= 0) { put(box, { o: 0 }); return; }
    put(box, { x: 500, y, o: env });
    const p = prog(t, t0, t0 + 0.45);
    pill.style.transform = `scale(${lerp(0.5, 1, E.outBack(p, 2.2)) * (1 + 0.03 * Math.sin(t * 6))})`;
    s.style.opacity = String(prog(t, t0 + 0.25, t0 + 0.6));
    const pq = prog(t, tQ, tQ + 0.4);
    q.style.opacity = String(pq);
    q.style.transform = `translateY(${lerp(40, 0, E.outCubic(pq))}px)`;
  };
}

/** persistent top hook/header text, e.g. series title. update(t, t0, t1) */
export function header(parent, text, { y = 300, size = 54, color = C.bone, width = 840 } = {}) {
  const h = el('div', { html: text, style: { width: width + 'px', textAlign: 'center', fontWeight: '800', fontSize: size + 'px', lineHeight: '1.12', color, letterSpacing: '-0.01em', textShadow: '0 6px 30px rgba(0,0,0,0.75)' } }, parent);
  return (t, t0, t1, o = {}) => {
    const env = vis(t, t0, t1, 0.12, 0.3);
    put(h, { x: 540, y: y + (o.dy || 0), o: env, s: lerp(1.08, 1, E.outCubic(prog(t, t0, t0 + 0.3))) });
  };
}

/** small source line at the bottom-left of the safe area */
export function sourceLine(parent, text) {
  const s = el('div', { text, style: { maxWidth: '800px', padding: '8px 14px', borderRadius: '10px', background: 'rgba(5,6,8,0.62)', fontWeight: '500', fontSize: '21px', lineHeight: '1.35', color: 'rgba(237,234,228,0.72)' } }, parent);
  return (t, t0, t1) => put(s, { x: 80, y: 1395, ax: 0, ay: 1, o: vis(t, t0, t1, 0.3, 0.3) * 0.9 });
}

export { clamp, tw };


/** chapter card: big outlined number + title. update(t, t0, t1) */
export function chapter(parent, { num, title, y = 760, accent = C.red }) {
  const box = el('div', { style: { width: '960px', textAlign: 'center' } }, parent);
  const n = el('div', { text: num, style: { position: 'static', transform: 'none', fontWeight: '900', fontSize: '330px', lineHeight: '0.86', color: 'transparent', WebkitTextStroke: `7px ${accent}`, letterSpacing: '-0.05em', textShadow: `0 0 60px ${accent}55` } }, box);
  const tt = el('div', { text: title, style: { position: 'static', transform: 'none', marginTop: '18px', fontWeight: '900', fontSize: '96px', lineHeight: '1.0', color: C.bone, letterSpacing: '-0.025em', textShadow: '0 16px 40px rgba(0,0,0,0.7)' } }, box);
  return (t, t0, t1) => {
    const env = vis(t, t0, t1, 0.01, 0.25);
    if (env <= 0) { put(box, { o: 0 }); return; }
    put(box, { x: 540, y, o: env, s: lerp(1.04, 1, prog(t, t0, t1)) });
    const p = prog(t, t0, t0 + 0.32);
    n.style.transform = `scale(${lerp(1.9, 1, E.outExpo(p))})`;
    n.style.filter = p < 1 ? `blur(${(14 * (1 - p)).toFixed(1)}px)` : '';
    n.style.opacity = String(Math.min(1, p * 2));
    const q = prog(t, t0 + 0.18, t0 + 0.5);
    tt.style.transform = `translateY(${lerp(70, 0, E.outExpo(q))}px)`;
    tt.style.opacity = String(q);
  };
}

/** rubber stamp text that slams in rotated. update(t, t0, t1) */
export function stamp(parent, text, { y = 560, color = C.red, size = 64, rot = -8 } = {}) {
  const s = el('div', { text, style: { padding: '18px 34px', border: `8px solid ${color}`, borderRadius: '18px', color, fontWeight: '900', fontSize: size + 'px', letterSpacing: '0.04em', lineHeight: '1.05', textAlign: 'center', width: '860px', background: 'rgba(10,10,12,0.55)' } }, parent);
  return (t, t0, t1) => {
    const env = vis(t, t0, t1, 0.01, 0.3);
    const p = prog(t, t0, t0 + 0.18);
    put(s, { x: 540, y, o: env * Math.min(1, p * 3), s: lerp(2.3, 1, E.outCubic(p)), r: rot });
  };
}

/** row of words revealed one at a time (e.g. DENY · ATTACK · ...). update(t, times[], tEnd) */
export function wordStack(parent, words, { y = 520, size = 92, color = C.bone, accent = C.red } = {}) {
  const box = el('div', { style: { width: '960px', textAlign: 'center', lineHeight: '1.04' } }, parent);
  const spans = words.map((w) => {
    const d = el('div', { style: { position: 'static', transform: 'none', fontWeight: '900', fontSize: size + 'px', letterSpacing: '-0.02em', color } }, box);
    d.innerHTML = `<span style="color:${accent}">${w[0]}</span>${w.slice(1)}`;
    return d;
  });
  return (t, times, tEnd) => {
    const env = vis(t, times[0] - 0.05, tEnd, 0.01, 0.3);
    if (env <= 0) { put(box, { o: 0 }); return; }
    put(box, { x: 540, y, o: env });
    spans.forEach((d, i) => {
      const p = prog(t, times[i] - 0.05, times[i] + 0.2);
      d.style.opacity = String(p);
      d.style.transform = `translateX(${lerp(-80, 0, E.outExpo(p))}px)`;
    });
  };
}
