// In-page runtime shared by every composition. Everything is a pure function of
// time t (seconds) so any frame can be rendered in any order by any worker.

export const W = 1080, H = 1920;
// TikTok UI overlays: status/tabs on top, caption/username/sound at the bottom,
// like/comment/share rail on the right. Keep key text inside this box.
export const SAFE = { top: 230, bottom: 1430, left: 70, right: 930, cx: 520 };

// ---------------------------------------------------------------- math & easing
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const prog = (t, t0, t1) => (t1 <= t0 ? (t >= t1 ? 1 : 0) : clamp((t - t0) / (t1 - t0)));
export const E = {
  linear: (x) => x,
  inQuad: (x) => x * x,
  outQuad: (x) => 1 - (1 - x) * (1 - x),
  inOutQuad: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
  inCubic: (x) => x * x * x,
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outQuart: (x) => 1 - Math.pow(1 - x, 4),
  outQuint: (x) => 1 - Math.pow(1 - x, 5),
  inExpo: (x) => (x === 0 ? 0 : Math.pow(2, 10 * x - 10)),
  outExpo: (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  inOutExpo: (x) => (x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2),
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  outSine: (x) => Math.sin((x * Math.PI) / 2),
  outBack: (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
  inBack: (x, s = 1.70158) => (s + 1) * x * x * x - s * x * x,
  outElastic: (x) => (x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin(((x * 10 - 0.75) * (2 * Math.PI)) / 3) + 1),
};
/** tween value from a to b between t0 and t1 */
export const tw = (t, t0, t1, a, b, e = E.outCubic) => lerp(a, b, e(prog(t, t0, t1)));
/** visibility envelope 0..1 for a window [t0,t1] with fade in/out */
export function vis(t, t0, t1, fin = 0.25, fout = 0.25) {
  if (t < t0 || t > t1) return 0;
  const a = fin > 0 ? E.outCubic(prog(t, t0, t0 + fin)) : 1;
  const b = fout > 0 ? 1 - E.inCubic(prog(t, t1 - fout, t1)) : 1;
  return Math.min(a, b);
}

// ---------------------------------------------------------------- randomness
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hash1 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
/** smooth value noise in [-1,1] */
export function vnoise(x, seed = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash1(i + seed * 17.13), hash1(i + 1 + seed * 17.13), u) * 2 - 1;
}

// ---------------------------------------------------------------- DOM helpers
export function el(tag = 'div', o = {}, parent) {
  const e = document.createElement(tag);
  if (o.cls) e.className = o.cls;
  if (o.html != null) e.innerHTML = o.html;
  if (o.text != null) e.textContent = o.text;
  if (o.src) e.src = o.src;
  if (o.style) Object.assign(e.style, o.style);
  (parent || document.getElementById('dom')).appendChild(e);
  return e;
}
/** position an absolutely-placed element by its anchor point (default centre) */
export function put(e, { x = 540, y = 960, s = 1, sx, sy, r = 0, o = 1, blur = 0, ax = 0.5, ay = 0.5, skew = 0, extraFilter = '' } = {}) {
  if (o <= 0.002) { if (e.style.display !== 'none') e.style.display = 'none'; return; }
  if (e.style.display === 'none') e.style.display = '';
  e.style.transform = `translate(${x}px,${y}px) translate(${-ax * 100}%,${-ay * 100}%) rotate(${r}deg) skewX(${skew}deg) scale(${sx ?? s},${sy ?? s})`;
  e.style.opacity = String(Math.min(1, o));
  const f = (blur > 0.05 ? `blur(${blur.toFixed(2)}px) ` : '') + extraFilter;
  e.style.filter = f.trim();
}
export const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
export const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}'’+%]/gu, '');

// ---------------------------------------------------------------- the studio
export class Studio {
  constructor(tl, comp) {
    this.tl = tl;
    this.comp = comp;
    this.fps = tl.fps || 30;
    this.duration = tl.duration;
    this.frames = Math.ceil(this.duration * this.fps);
    this.beats = {};
    for (const b of tl.beats) this.beats[b.id] = b;
    this.layers = [];
    this.waits = [];
    this.flashes = [];
    this.shakes = [];
    this.punches = [];
    this.capHide = [];
    this.cam = document.getElementById('cam');
    this.flashEl = document.getElementById('flash');
    this.capLayer = document.getElementById('cap');
    this.camZoom = () => 1;
    this.grain = { opacity: 0.075 };
  }

  // ---- timeline lookups
  b(id) { const b = this.beats[id]; if (!b) throw new Error(`no beat "${id}"`); return b; }
  /** time of a word in a beat. key = index or text (first match, optional "#n" for nth). */
  w(id, key, edge = 's') {
    const b = this.b(id);
    if (typeof key === 'number') { const w = b.words[Math.max(0, Math.min(b.words.length - 1, key))]; return w ? w[edge] : b.start; }
    let [txt, nth] = String(key).split('#'); nth = parseInt(nth || '1', 10);
    const k = norm(txt);
    let seen = 0;
    for (const w of b.words) { if (norm(w.w).startsWith(k) && ++seen === nth) return w[edge]; }
    console.error(`word "${key}" not found in beat ${id}`);
    return b.start;
  }

  on(fn) { this.layers.push(fn); return fn; }
  wait(p) { this.waits.push(p); return p; }
  flash(t, dur = 0.16, peak = 0.8, color = '#ffffff') { this.flashes.push({ t, dur, peak, color }); }
  shake(t, dur = 0.35, amp = 12) { this.shakes.push({ t, dur, amp }); }
  punch(t, dur = 0.4, amt = 0.06) { this.punches.push({ t, dur, amt }); }
  /** hide captions in [t0,t1] (e.g. when big on-screen type already says the words) */
  hideCaptions(t0, t1) { this.capHide.push([t0, t1]); }
  captions(opts = {}) { this.cap = new Captions(this, opts); return this.cap; }

  async ready() {
    const weights = [400, 500, 600, 700, 800, 900];
    await Promise.all(weights.map((w) => document.fonts.load(`${w} 64px Poppins`, 'AaÉéçœ0123456789')));
    await document.fonts.ready;
    await Promise.all(this.waits);
    this._initGrain();
  }

  _initGrain() {
    const c = document.getElementById('grain');
    this.gctx = c.getContext('2d');
    const rnd = mulberry32(1234);
    this.gframes = [];
    for (let k = 0; k < 8; k++) {
      const img = this.gctx.createImageData(540, 960);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) { const v = 128 + (rnd() - 0.5) * 255 * 0.9; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
      this.gframes.push(img);
    }
  }

  renderFrame(i) {
    const t = i / this.fps;
    this.t = t;
    for (const f of this.layers) f(t, i);
    if (this.cap) this.cap.update(t);
    // camera: shake + punch-in + comp zoom
    let sx = 0, sy = 0, rot = 0, z = this.camZoom(t);
    for (const s of this.shakes) {
      if (t < s.t || t > s.t + s.dur) continue;
      const k = 1 - (t - s.t) / s.dur, a = s.amp * k * k;
      sx += vnoise(t * 38, 1) * a; sy += vnoise(t * 41, 2) * a; rot += vnoise(t * 33, 3) * a * 0.04;
    }
    for (const p of this.punches) {
      if (t < p.t || t > p.t + p.dur) continue;
      const u = (t - p.t) / p.dur;
      z *= 1 + p.amt * (u < 0.18 ? E.outCubic(u / 0.18) : 1 - E.inOutSine((u - 0.18) / 0.82));
    }
    this.cam.style.transform = `translate(${sx.toFixed(2)}px,${sy.toFixed(2)}px) rotate(${rot.toFixed(3)}deg) scale(${z.toFixed(4)})`;
    // flash
    let fo = 0, fc = '#fff';
    for (const f of this.flashes) {
      if (t < f.t || t > f.t + f.dur) continue;
      const u = (t - f.t) / f.dur; const v = f.peak * (1 - E.outQuad(u));
      if (v > fo) { fo = v; fc = f.color; }
    }
    this.flashEl.style.opacity = fo.toFixed(3);
    this.flashEl.style.background = fc;
    // grain
    const g = document.getElementById('grain');
    g.style.opacity = String(this.grain.opacity);
    if (this.gctx) this.gctx.putImageData(this.gframes[i % this.gframes.length], 0, 0);
  }
}

// ---------------------------------------------------------------- captions
// Word-synced "bold social" captions: 1–3 word chunks, active word highlighted,
// pop-in per chunk. Words come from TTS timings in timeline.json.
class Captions {
  constructor(studio, opts) {
    this.s = studio;
    this.o = Object.assign({
      y: 1185, size: 74, weight: 800, maxWords: 3, maxChars: 16, upper: true,
      color: '#FFFFFF', active: '#FFC83D', emph: '#FFC83D', stroke: 13, hold: 0.45, width: 860, replace: {},
    }, opts);
    this.chunks = [];
    for (const b of studio.tl.beats) {
      if (b.captions === false || !b.words || !b.words.length) continue;
      const emph = new Set((b.emph || []).map(norm));
      const rep = Object.assign({}, this.o.replace, b.replace || {});
      const maxW = b.capMaxWords || this.o.maxWords, maxC = b.capMaxChars || this.o.maxChars;
      let cur = null;
      for (const w of b.words) {
        const raw = w.w;
        const key = raw.replace(/^[“"(«¿¡]+/, '').replace(/[.,;:…”"»)]+$/, '');
        if (!key) continue;
        let disp = rep[key] ?? rep[key.toLowerCase()] ?? key;
        if (disp === '') continue;
        const endsClause = /[.,;:!?…—]["”»)]*$/.test(raw);
        const prev = cur && cur.words[cur.words.length - 1];
        const gap = prev && w.s - prev.e > 0.3;
        if (!cur || cur.closed || gap || cur.words.length >= maxW || cur.chars + disp.length > maxC) {
          cur = { words: [], chars: 0, closed: false, y: b.capY ?? this.o.y, beat: b.id };
          this.chunks.push(cur);
        }
        cur.words.push({ text: disp, s: w.s, e: w.e, emph: emph.has(norm(key)) });
        cur.chars += disp.length + 1;
        if (endsClause) cur.closed = true;
      }
    }
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i], n = this.chunks[i + 1];
      c.start = c.words[0].s - 0.05;
      const lastE = c.words[c.words.length - 1].e;
      c.end = n ? Math.max(lastE, Math.min(n.words[0].s - 0.05, lastE + this.o.hold)) : lastE + 0.6;
    }
    const o = this.o;
    this.box = el('div', {
      style: {
        width: o.width + 'px', textAlign: 'center', fontFamily: 'Poppins', fontWeight: String(o.weight),
        fontSize: o.size + 'px', lineHeight: '1.08', letterSpacing: '-0.01em',
        textTransform: o.upper ? 'uppercase' : 'none', whiteSpace: 'normal',
      },
    }, studio.capLayer);
    this.cur = -2;
    this.spans = [];
  }

  hidden(t) { return this.s.capHide.some(([a, b]) => t >= a && t <= b); }

  update(t) {
    let idx = -1;
    if (!this.hidden(t)) {
      for (let i = 0; i < this.chunks.length; i++) {
        const c = this.chunks[i];
        if (c.start > t) break;
        if (t < c.end) { idx = i; break; }
      }
    }
    if (idx !== this.cur) {
      this.cur = idx;
      this.box.innerHTML = '';
      this.spans = [];
      if (idx >= 0) {
        for (const w of this.chunks[idx].words) {
          const sp = document.createElement('span');
          sp.textContent = w.text;
          Object.assign(sp.style, {
            display: 'inline-block', margin: '0 0.13em', paintOrder: 'stroke fill',
            WebkitTextStroke: `${this.o.stroke}px rgba(0,0,0,0.95)`, textShadow: '0 10px 24px rgba(0,0,0,0.55)',
            transformOrigin: '50% 60%',
          });
          this.box.appendChild(sp);
          this.spans.push(sp);
        }
      }
    }
    if (idx < 0) { put(this.box, { o: 0 }); return; }
    const c = this.chunks[idx];
    const p = prog(t, c.start, c.start + 0.15);
    put(this.box, { x: 540, y: c.y + lerp(22, 0, E.outCubic(p)), s: lerp(0.8, 1, E.outBack(p, 2.4)), o: Math.min(1, p * 2.5), ay: 0.5 });
    c.words.forEach((w, k) => {
      const sp = this.spans[k];
      const next = c.words[k + 1];
      const active = t >= w.s - 0.03 && (next ? t < next.s - 0.03 : t < w.e + 0.25);
      sp.style.color = active ? this.o.active : w.emph ? this.o.emph : this.o.color;
      const pop = active ? 1 + 0.09 * (1 - E.outCubic(prog(t, w.s - 0.03, w.s + 0.12))) + 0.03 : 1;
      sp.style.transform = `scale(${pop.toFixed(3)})`;
    });
  }
}

// ---------------------------------------------------------------- kinetic type
/**
 * Big headline that builds word-by-word. words: [{text, t, color?, size?, br?}]
 * Returns an updater(t) to call from a layer.
 */
export function slamType(parent, words, o = {}) {
  const cfg = Object.assign({ x: 540, y: 520, size: 118, weight: 900, color: '#F4EFE6', width: 900, lh: 1.02, upper: true, from: 2.2, blur: 14, ls: '-0.02em', align: 'center' }, o);
  const box = el('div', { style: { width: cfg.width + 'px', textAlign: cfg.align, fontWeight: String(cfg.weight), fontSize: cfg.size + 'px', lineHeight: String(cfg.lh), letterSpacing: cfg.ls, textTransform: cfg.upper ? 'uppercase' : 'none' } }, parent);
  const spans = words.map((w) => {
    if (w.br) box.appendChild(document.createElement('br'));
    const s = document.createElement('span');
    s.textContent = w.text;
    Object.assign(s.style, { display: 'inline-block', margin: '0 0.12em', color: w.color || cfg.color, fontSize: w.size ? w.size + 'px' : '', transformOrigin: '50% 60%', textShadow: '0 14px 40px rgba(0,0,0,0.6)' });
    box.appendChild(s);
    return s;
  });
  return (t, env = 1, extra = {}) => {
    put(box, { x: cfg.x, y: cfg.y, o: env, ...extra });
    words.forEach((w, k) => {
      const p = prog(t, w.t, w.t + (w.dur || 0.22));
      const s = spans[k];
      if (p <= 0) { s.style.opacity = '0'; return; }
      s.style.opacity = String(Math.min(1, p * 2));
      const sc = lerp(w.from || cfg.from, 1, E.outExpo(p));
      s.style.transform = `scale(${sc.toFixed(3)})`;
      s.style.filter = p < 1 ? `blur(${(cfg.blur * (1 - E.outCubic(p))).toFixed(2)}px)` : '';
    });
  };
}

/** typewriter reveal into element e of `text` starting at t0 with `cps` chars/sec */
export function typeText(e, text, t, t0, cps = 28, cursor = true) {
  const n = Math.max(0, Math.min(text.length, Math.floor((t - t0) * cps)));
  const blink = cursor && n < text.length + 8 && Math.floor(t * 2.4) % 2 === 0;
  e.textContent = text.slice(0, n) + (blink ? '▍' : '');
  return n;
}
