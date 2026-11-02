// Reusable Three.js building blocks for the psychology / human-nature visual language:
// lone mannequin figures, volumetric spotlights, theatre audiences, particle brains.
// Everything is driven by explicit time values (no clocks) so frames are deterministic.
import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { clamp, lerp, E, prog, mulberry32 } from './runtime.js';

export { THREE };

export function createGL(canvasId = 'gl', { exposure = 1.0, clear = 0x07080b } = {}) {
  const canvas = document.getElementById(canvasId);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(1080, 1920, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.setClearColor(clear, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1080 / 1920, 0.05, 600);
  return { THREE, renderer, scene, camera, render: () => renderer.render(scene, camera) };
}

// ------------------------------------------------------------------ textures
export function radialTexture(stops = [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']], size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function textTexture(text, { font = '800 120px Poppins', color = '#fff', w = 1024, h = 256, glow = 0 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (glow) { g.shadowColor = color; g.shadowBlur = glow; }
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ mannequin
const MANNEQUIN_DEFAULT = { color: 0xb9bdc4, roughness: 0.55, metalness: 0.0, shirt: null, scale: 1 };

/** Articulated mannequin. Origin at the feet. Returns { group, j (joints), mats, pose(), walk() } */
export function makeMannequin(opts = {}) {
  const o = { ...MANNEQUIN_DEFAULT, ...opts };
  const skin = new THREE.MeshStandardMaterial({ color: o.color, roughness: o.roughness, metalness: o.metalness });
  const shirt = new THREE.MeshStandardMaterial({ color: o.shirt ?? o.color, roughness: 0.75, metalness: 0 });
  const g = new THREE.Group();
  const j = {};
  const node = (name, parent, x = 0, y = 0, z = 0) => { const n = new THREE.Group(); n.position.set(x, y, z); parent.add(n); j[name] = n; return n; };
  const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  const hips = node('hips', g, 0, 0.98, 0);
  // pelvis
  const pelvis = mesh(new THREE.SphereGeometry(0.15, 24, 16), shirt, hips, 0, 0.02, 0);
  pelvis.scale.set(1.15, 0.7, 0.8);
  const spine = node('spine', hips, 0, 0.06, 0);
  // torso: lathe profile (waist -> chest -> shoulders)
  const prof = [[0.0, 0.0], [0.135, 0.0], [0.15, 0.08], [0.165, 0.2], [0.19, 0.33], [0.2, 0.42], [0.17, 0.5], [0.07, 0.56], [0.0, 0.57]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const torso = mesh(new THREE.LatheGeometry(prof, 40), shirt, spine, 0, 0, 0);
  torso.scale.set(1.08, 1, 0.66);
  const chest = node('chest', spine, 0, 0.5, 0);
  const neck = node('neck', chest, 0, 0.05, 0);
  mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.12, 20), skin, neck, 0, 0.05, 0);
  const head = node('head', neck, 0, 0.12, 0);
  node('crown', head, 0, 0.23, 0);
  const skull = mesh(new THREE.SphereGeometry(0.105, 36, 28), skin, head, 0, 0.1, 0.0);
  skull.scale.set(0.92, 1.12, 1.0);
  const jaw = mesh(new THREE.SphereGeometry(0.075, 24, 16), skin, head, 0, 0.035, 0.03);
  jaw.scale.set(0.95, 0.8, 1.0);

  for (const side of [-1, 1]) {
    const s = side < 0 ? 'L' : 'R';
    const sh = node('shoulder' + s, chest, 0.2 * side, -0.02, 0);
    mesh(new THREE.SphereGeometry(0.062, 20, 14), shirt, sh);
    const ua = mesh(new THREE.CapsuleGeometry(0.052, 0.24, 8, 16), shirt, sh, 0, -0.16, 0);
    const el = node('elbow' + s, sh, 0, -0.31, 0);
    mesh(new THREE.CapsuleGeometry(0.043, 0.22, 8, 16), skin, el, 0, -0.14, 0);
    const hand = mesh(new THREE.SphereGeometry(0.048, 16, 12), skin, el, 0, -0.3, 0.005);
    hand.scale.set(0.8, 1.25, 0.55);
    node('wrist' + s, el, 0, -0.3, 0);
    const hip = node('hip' + s, hips, 0.095 * side, -0.03, 0);
    mesh(new THREE.CapsuleGeometry(0.075, 0.33, 8, 16), shirt, hip, 0, -0.22, 0);
    const kn = node('knee' + s, hip, 0, -0.45, 0);
    mesh(new THREE.CapsuleGeometry(0.058, 0.34, 8, 16), shirt, kn, 0, -0.22, 0);
    const ft = node('foot' + s, kn, 0, -0.45, 0);
    const foot = mesh(new THREE.CapsuleGeometry(0.045, 0.14, 6, 12), shirt, ft, 0, -0.01, 0.06);
    foot.rotation.x = Math.PI / 2;
    void ua; void ft;
  }
  g.scale.setScalar(o.scale);
  g.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });

  const api = {
    group: g, j, mats: { skin, shirt },
    /** stand pose with optional sadness (head down, shoulders in) 0..1 */
    pose({ sad = 0.3, armOut = 0.06, lookUp = 0, turn = 0, breath = 0 } = {}) {
      j.hips.position.y = 0.98;
      j.hips.rotation.set(0, 0, 0);
      j.spine.rotation.set(0.04 + sad * 0.06, 0, 0);
      j.chest.rotation.set(sad * 0.08 - lookUp * 0.05 + breath * 0.01, 0, 0);
      j.head.rotation.set(sad * 0.38 - lookUp * 0.55, turn, 0);
      for (const [s, side] of [['L', -1], ['R', 1]]) {
        j['shoulder' + s].rotation.set(0.02, 0, side * (armOut + breath * 0.004) + side * sad * -0.02);
        j['shoulder' + s].position.z = sad * 0.03;
        j['elbow' + s].rotation.set(-0.08, 0, 0);
        j['hip' + s].rotation.set(0, 0, side * 0.025);
        j['knee' + s].rotation.set(0, 0, 0);
        j['foot' + s].rotation.set(0, 0, 0);
      }
    },
    /** walk cycle; phase in radians, amt 0..1 blends from stand */
    walk(phase, amt = 1, sad = 0.1) {
      api.pose({ sad });
      const sw = Math.sin(phase), cw = Math.cos(phase);
      j.hips.position.y = 0.98 - amt * 0.025 * (1 - Math.abs(cw));
      j.hips.rotation.y = amt * 0.08 * sw;
      j.chest.rotation.y = -amt * 0.12 * sw;
      j.hipL.rotation.x = amt * 0.42 * sw;
      j.hipR.rotation.x = -amt * 0.42 * sw;
      j.kneeL.rotation.x = amt * Math.max(0, -Math.sin(phase - 0.6)) * 0.85;
      j.kneeR.rotation.x = amt * Math.max(0, Math.sin(phase - 0.6)) * 0.85;
      j.shoulderL.rotation.x = -amt * 0.35 * sw;
      j.shoulderR.rotation.x = amt * 0.35 * sw;
      j.elbowL.rotation.x = -0.15 - amt * 0.2 * Math.max(0, -sw);
      j.elbowR.rotation.x = -0.15 - amt * 0.2 * Math.max(0, sw);
    },
  };
  api.pose();
  return api;
}

// ------------------------------------------------------------------ light FX
const coneVS = `varying float vH; varying vec3 vN; varying vec3 vV;
void main(){ vH = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
const coneFS = `uniform vec3 color; uniform float intensity; varying float vH; varying vec3 vN; varying vec3 vV;
void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.2); float fall = mix(0.18, 1.0, pow(vH, 1.3));
 gl_FragColor = vec4(color * intensity * edge * fall, 1.0); }`;

/** volumetric-looking light cone from apex (top) down to a base radius on the floor */
export function makeCone({ height = 8, radius = 1.6, color = 0xffe2b0, intensity = 0.35, top = 0.06 } = {}) {
  const geo = new THREE.CylinderGeometry(top, radius, height, 64, 1, true);
  geo.translate(0, -height / 2, 0); // apex at origin
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, intensity: { value: intensity } },
    vertexShader: coneVS, fragmentShader: coneFS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 10;
  return m;
}

/** additive light pool / glow decal lying on the floor */
export function makePool({ radius = 1.8, color = '255,226,176', strength = 1 } = {}) {
  const tex = radialTexture([[0, `rgba(${color},${0.95 * strength})`], [0.35, `rgba(${color},${0.45 * strength})`], [1, `rgba(${color},0)`]]);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 5;
  return m;
}

export function makeBlobShadow(radius = 0.5, opacity = 0.65) {
  const tex = radialTexture([[0, `rgba(0,0,0,${opacity})`], [1, 'rgba(0,0,0,0)']]);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 4;
  return m;
}

export function makeGlowSprite(color = '255,220,160', size = 1, strength = 1) {
  const tex = radialTexture([[0, `rgba(${color},${strength})`], [0.2, `rgba(${color},${0.5 * strength})`], [1, `rgba(${color},0)`]]);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1);
  return s;
}

/** dust motes drifting inside a box; deterministic: update(t) */
export function makeDust({ n = 400, box = [3, 7, 3], center = [0, 3.5, 0], size = 0.035, color = 0xfff0d8, seed = 3, opacity = 0.8 } = {}) {
  const rnd = mulberry32(seed);
  const base = new Float32Array(n * 3), vel = new Float32Array(n * 3), pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    base[i * 3] = (rnd() - 0.5) * box[0]; base[i * 3 + 1] = (rnd() - 0.5) * box[1]; base[i * 3 + 2] = (rnd() - 0.5) * box[2];
    vel[i * 3] = (rnd() - 0.5) * 0.06; vel[i * 3 + 1] = (rnd() - 0.5) * 0.04 - 0.01; vel[i * 3 + 2] = (rnd() - 0.5) * 0.06;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const tex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']], 64);
  const mat = new THREE.PointsMaterial({ size, map: tex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat);
  pts.position.set(...center);
  const wrap = (v, h) => ((((v + h) % (2 * h)) + 2 * h) % (2 * h)) - h;
  pts.userData.update = (t) => {
    for (let i = 0; i < n; i++) {
      pos[i * 3] = wrap(base[i * 3] + vel[i * 3] * t + Math.sin(t * 0.3 + i) * 0.05, box[0] / 2);
      pos[i * 3 + 1] = wrap(base[i * 3 + 1] + vel[i * 3 + 1] * t, box[1] / 2);
      pos[i * 3 + 2] = wrap(base[i * 3 + 2] + vel[i * 3 + 2] * t + Math.cos(t * 0.27 + i) * 0.05, box[2] / 2);
    }
    geo.attributes.position.needsUpdate = true;
  };
  pts.userData.update(0);
  return pts;
}

// ------------------------------------------------------------------ theatre
export function makeCurtain({ w = 18, h = 10, color = 0x3b0a12, folds = 26 } = {}) {
  const geo = new THREE.PlaneGeometry(w, h, 220, 4);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setZ(i, Math.sin((x / w) * Math.PI * folds) * 0.16 + Math.sin((x / w) * Math.PI * folds * 2.3) * 0.04);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 }));
}

/** rows of theatre seats + optional seated audience (instanced). highlight(idx[], color, amt) */
export function makeAuditorium({ rows = 6, perRow = 10, z0 = 5.2, rowGap = 1.15, seatGap = 0.95, rise = 0.32, occupancy = 0.8, seed = 11 } = {}) {
  const g = new THREE.Group();
  const seatGeo = new THREE.BoxGeometry(0.62, 0.12, 0.55);
  const backGeo = new THREE.BoxGeometry(0.62, 0.75, 0.1);
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x4a0f18, roughness: 0.85 });
  const N = rows * perRow;
  const seats = new THREE.InstancedMesh(seatGeo, seatMat, N);
  const backs = new THREE.InstancedMesh(backGeo, seatMat, N);
  const rnd = mulberry32(seed);
  const people = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  let k = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < perRow; c++) {
      const x = (c - (perRow - 1) / 2) * seatGap;
      const z = z0 + r * rowGap + Math.pow(x / 6, 2) * 0.6;
      const y = r * rise;
      const ang = Math.atan2(x, 14) * 0.6;
      q.setFromEuler(new THREE.Euler(0, ang, 0));
      m4.compose(new THREE.Vector3(x, y + 0.45, z), q, s); seats.setMatrixAt(k, m4);
      m4.compose(new THREE.Vector3(x, y + 0.85, z + 0.25), q, s); backs.setMatrixAt(k, m4);
      if (rnd() < occupancy) people.push({ x, y, z, ang, k });
      k++;
    }
  }
  g.add(seats, backs);
  // seated people: torso capsule + head sphere, instanced with per-instance colour
  const P = people.length;
  const torsoGeo = new THREE.CapsuleGeometry(0.2, 0.36, 6, 14);
  const headGeo = new THREE.SphereGeometry(0.115, 20, 14);
  const pMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const torsos = new THREE.InstancedMesh(torsoGeo, pMat, P);
  const heads = new THREE.InstancedMesh(headGeo, pMat, P);
  const base = new THREE.Color(0x5c6068);
  people.forEach((p, i) => {
    q.setFromEuler(new THREE.Euler(0, p.ang, 0));
    m4.compose(new THREE.Vector3(p.x, p.y + 0.95, p.z + 0.05), q, new THREE.Vector3(1, 1, 0.8)); torsos.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(p.x, p.y + 1.42, p.z + 0.02), q, s); heads.setMatrixAt(i, m4);
    torsos.setColorAt(i, base); heads.setColorAt(i, base);
  });
  const peopleGroup = new THREE.Group();
  peopleGroup.add(torsos, heads);
  g.add(peopleGroup);
  const tmp = new THREE.Color();
  const api = {
    group: g, people, peopleGroup,
    /** colour every person: fn(i) -> THREE.Color-like {r,g,b} */
    paint(fn) {
      for (let i = 0; i < P; i++) { const c = fn(i, people[i]) || base; tmp.copy(c); torsos.setColorAt(i, tmp); heads.setColorAt(i, tmp); }
      torsos.instanceColor.needsUpdate = true; heads.instanceColor.needsUpdate = true;
    },
    base,
  };
  return api;
}

// ------------------------------------------------------------------ brain
/**
 * Particle brain built from a union of ellipsoid lobes (lateral view reads as a brain):
 * cerebrum hemispheres, frontal/occipital/temporal lobes, cerebellum, brainstem.
 * Points are concentrated on noise ridges so the folds read as glowing lines.
 * Front faces +x. update(t, pulse)
 */
export function makeBrain({ n = 22000, scale = 1.0, color = 0xffb648, seed = 5 } = {}) {
  const rnd = mulberry32(seed);
  const noise = new ImprovedNoise();
  const parts = [];
  for (const sz of [-1, 1]) {
    parts.push({ c: [0.0, 0.06, 0.19 * sz], r: [0.62, 0.42, 0.26], w: 3.2, fold: 1 });   // hemisphere
    parts.push({ c: [0.33, -0.02, 0.17 * sz], r: [0.31, 0.32, 0.24], w: 1.0, fold: 1 }); // frontal
    parts.push({ c: [-0.43, 0.01, 0.16 * sz], r: [0.27, 0.29, 0.21], w: 0.9, fold: 1 }); // occipital
    parts.push({ c: [0.06, -0.21, 0.25 * sz], r: [0.37, 0.16, 0.16], w: 0.9, fold: 1 }); // temporal
    parts.push({ c: [-0.4, -0.31, 0.12 * sz], r: [0.19, 0.11, 0.16], w: 0.55, fold: 2 }); // cerebellum
  }
  parts.push({ c: [-0.13, -0.43, 0], r: [0.075, 0.2, 0.075], w: 0.25, fold: 0 });          // brainstem
  const sdf = (x, y, z, skip) => {
    let d = Infinity;
    for (let k = 0; k < parts.length; k++) {
      if (k === skip) continue;
      const P = parts[k];
      const qx = (x - P.c[0]) / P.r[0], qy = (y - P.c[1]) / P.r[1], qz = (z - P.c[2]) / P.r[2];
      const v = (Math.sqrt(qx * qx + qy * qy + qz * qz) - 1) * Math.min(...P.r);
      if (v < d) d = v;
    }
    return d;
  };
  const wsum = parts.reduce((a, p) => a + p.w, 0);
  const pos = new Float32Array(n * 3), base = new Float32Array(n * 3), ph = new Float32Array(n), col = new Float32Array(n * 3);
  const cRidge = new THREE.Color(0xfff1d6), cFill = new THREE.Color(color).multiplyScalar(0.55);
  let i = 0, guard = 0;
  while (i < n && guard < n * 80) {
    guard++;
    // choose a part by weight
    let r = rnd() * wsum, k = 0;
    while (r > parts[k].w) { r -= parts[k].w; k++; }
    const P = parts[k];
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
    const x = P.c[0] + rr * Math.cos(th) * P.r[0], y = P.c[1] + u * P.r[1], z = P.c[2] + rr * Math.sin(th) * P.r[2];
    if (sdf(x, y, z, k) < -0.012) continue;           // hidden inside another lobe
    if (P.fold === 1 && Math.abs(z) < 0.03 && y > 0.1) continue; // longitudinal fissure
    let ridge;
    if (P.fold === 1) ridge = 1 - Math.abs(noise.noise(x * 8.5, y * 8.5, z * 8.5)) * 9.0;
    else if (P.fold === 2) ridge = 1 - Math.abs(Math.sin(y * 95 + Math.sin(x * 12) * 1.5)) * 1.6;
    else ridge = 0.3;
    const onRidge = ridge > 0.2;
    if (!onRidge && rnd() > 0.22) continue;
    const bump = onRidge ? 0.012 : -0.006;
    const len = Math.hypot(x, y, z) || 1;
    base[i * 3] = (x + (x / len) * bump) * scale;
    base[i * 3 + 1] = (y + (y / len) * bump) * scale;
    base[i * 3 + 2] = (z + (z / len) * bump) * scale;
    ph[i] = rnd() * Math.PI * 2;
    const c = onRidge ? cRidge.clone().lerp(new THREE.Color(color), 0.35 * (1 - clamp(ridge))) : cFill;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    i++;
  }
  const N = i;
  pos.set(base);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, N * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, N * 3), 3));
  const tex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']], 64);
  const mat = new THREE.PointsMaterial({ size: 0.017 * scale, map: tex, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat);
  const A = geo.attributes.position.array;
  pts.userData.update = (t, pulse = 0) => {
    const front = ((t * 0.5) % 1.8) - 0.9;
    for (let k = 0; k < N; k++) {
      const wave = Math.exp(-(((base[k * 3] / scale) - front) ** 2) / 0.006) * 0.035 * pulse;
      const w = 1 + 0.006 * Math.sin(t * 2.2 + ph[k]) + wave;
      A[k * 3] = base[k * 3] * w; A[k * 3 + 1] = base[k * 3 + 1] * w; A[k * 3 + 2] = base[k * 3 + 2] * w;
    }
    geo.attributes.position.needsUpdate = true;
  };
  pts.userData.count = N;
  return pts;
}

/** draw an SVG string into a sprite (async; await sprite.userData.ready) */
export function svgSprite(svg, size = 1, px = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set(size, size, 1);
  spr.userData.ready = new Promise((res) => {
    const img = new Image();
    img.onload = () => { const g = c.getContext('2d'); g.drawImage(img, 0, 0, px, px); tex.needsUpdate = true; res(); };
    img.onerror = () => res();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  return spr;
}

// ------------------------------------------------------------------ camera
/**
 * Camera keyframes: [{t, p:[x,y,z], l:[x,y,z], fov, e:'inOutCubic'|..., cut:true}]
 * cut:true jumps to this key instantly at its t (hard cut); otherwise eases from previous key.
 */
export function camPath(camera, keys) {
  keys = keys.slice().sort((a, b) => a.t - b.t);
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  return (t) => {
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
    const a = keys[i], b = keys[i + 1];
    let u = 0, ease = E.inOutCubic;
    if (b && !b.cut) { u = prog(t, a.t, b.t); ease = E[b.e || 'inOutCubic'] || E.inOutCubic; }
    const k = b && !b.cut ? ease(u) : 0;
    const P = b && !b.cut ? a.p.map((x, n) => lerp(x, b.p[n], k)) : a.p;
    const L = b && !b.cut ? a.l.map((x, n) => lerp(x, b.l[n], k)) : a.l;
    const F = b && !b.cut ? lerp(a.fov || 40, b.fov || 40, k) : a.fov || 40;
    camera.position.set(...P);
    camera.lookAt(v1.set(...L));
    if (camera.fov !== F) { camera.fov = F; camera.updateProjectionMatrix(); }
    void v2;
  };
}


// ------------------------------------------------------------------ props
export function makeCan({ color = 0xb3121b } = {}) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xd8dadf, roughness: 0.22, metalness: 0.95 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 1.1, 64, 1), new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.6 }));
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.33, 0.1, 64), metal);
  top.position.y = 0.6;
  const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.28, 0.1, 64), metal);
  bot.position.y = -0.6;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.334, 0.03, 8, 64), new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.3 }));
  band.rotation.x = Math.PI / 2; band.position.y = 0.08; band.scale.z = 1.6;
  const tab = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 8, 24), metal);
  tab.rotation.x = Math.PI / 2; tab.position.set(0.08, 0.66, 0);
  g.add(body, top, bot, band, tab);
  return g;
}

/** door in a wall with warm light behind. setOpen(angleRad): positive opens inward */
export function makeDoor({ w = 1.25, h = 2.4, color = 0x2b2420 } = {}) {
  const g = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a1b20, roughness: 0.95 });
  const W = 14, H = 7, D = 0.3;
  const left = new THREE.Mesh(new THREE.BoxGeometry((W - w) / 2, H, D), wallMat); left.position.set(-(w / 2 + (W - w) / 4), H / 2, -0.15);
  const right = left.clone(); right.position.x = -left.position.x;
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, H - h, D), wallMat); top.position.set(0, h + (H - h) / 2, -0.15);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a3029, roughness: 0.6 });
  const fl = new THREE.Mesh(new THREE.BoxGeometry(0.1, h + 0.1, 0.36), frameMat); fl.position.set(-w / 2 - 0.05, h / 2, -0.12);
  const fr = fl.clone(); fr.position.x = w / 2 + 0.05;
  const ft = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.1, 0.36), frameMat); ft.position.set(0, h + 0.05, -0.12);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 3.2, h * 1.6), new THREE.MeshBasicMaterial({ color: 0xffc27a, fog: false }));
  glow.position.set(0, h * 0.7, -2.4);
  const hinge = new THREE.Group(); hinge.position.set(-w / 2, 0, -0.12);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05 }));
  slab.position.set(w / 2, h / 2, 0);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.25, metalness: 0.9 }));
  knob.position.set(w - 0.12, h * 0.46, 0.06);
  hinge.add(slab, knob);
  const spill = makePool({ radius: 2.2, color: '255,194,122', strength: 0.9 });
  spill.position.set(0, 0.012, 1.2); spill.scale.set(0.6, 1.4, 1);
  g.add(left, right, top, fl, fr, ft, glow, hinge, spill);
  return { group: g, hinge, glow, spill, setOpen(a) { hinge.rotation.y = -a; } };
}

function symbolStrip(px = 1024) {
  const c = document.createElement('canvas'); c.width = px; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#efe9df'; g.fillRect(0, 0, px, 256);
  const syms = ['heart', 'snow', 'heart', 'seven', 'snow', 'heart'];
  const cell = px / syms.length;
  syms.forEach((sname, i) => {
    g.save(); g.translate(cell * i + cell / 2, 128); g.rotate(-Math.PI / 2);
    if (sname === 'heart') {
      g.fillStyle = '#e0283a'; g.beginPath();
      g.moveTo(0, 38); g.bezierCurveTo(-70, -10, -40, -70, 0, -32); g.bezierCurveTo(40, -70, 70, -10, 0, 38); g.fill();
    } else if (sname === 'snow') {
      g.strokeStyle = '#2f7de1'; g.lineWidth = 12; g.lineCap = 'round';
      for (let k = 0; k < 3; k++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(-50, 0); g.lineTo(50, 0); g.stroke(); }
    } else {
      g.fillStyle = '#1b1b1b'; g.font = '900 120px Poppins'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('7', 0, 6);
    }
    g.restore();
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(cell * (i + 1) - 2, 0, 4, 256);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** slot machine with 3 reels (axis = x). setReels([angle,angle,angle]) ; setLights(k 0..1 hot<->cold) */
export function makeSlot() {
  const g = new THREE.Group();
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.3, 3.4, 1.3), new THREE.MeshStandardMaterial({ color: 0x2a0d12, roughness: 0.35, metalness: 0.5 }));
  cab.position.y = 1.7;
  const trim = new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.12, 1.36), new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.25, metalness: 0.9 }));
  trim.position.y = 2.75;
  const trim2 = trim.clone(); trim2.position.y = 1.25;
  const win = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.15, 0.2), new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.2 }));
  win.position.set(0, 2.0, 0.6);
  g.add(cab, trim, trim2, win);
  const reels = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.52, 64, 1, true), new THREE.MeshStandardMaterial({ map: symbolStrip(), roughness: 0.4 }));
    r.rotation.z = Math.PI / 2;
    const pivot = new THREE.Group(); pivot.position.set((i - 1) * 0.6, 2.0, 0.25); pivot.add(r);
    g.add(pivot); reels.push(pivot);
  }
  const lights = [];
  for (let i = 0; i < 7; i++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff3040, emissiveIntensity: 1 }));
    l.position.set((i - 3) * 0.3, 3.15, 0.66);
    g.add(l); lights.push(l);
  }
  const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 16), new THREE.MeshStandardMaterial({ color: 0xc9c9c9, metalness: 0.9, roughness: 0.2 }));
  lever.position.set(1.32, 2.4, 0); g.add(lever);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), new THREE.MeshStandardMaterial({ color: 0xd61f2f, roughness: 0.3 }));
  ball.position.set(1.32, 3.02, 0); g.add(ball);
  const hot = new THREE.Color(0xff3040), cold = new THREE.Color(0x3d8bff), tmp = new THREE.Color();
  return {
    group: g, reels, lights,
    setReels(angles) { reels.forEach((p, i) => { p.rotation.x = angles[i]; }); },
    setLights(k, t) { lights.forEach((l, i) => { tmp.copy(hot).lerp(cold, k); l.material.emissive.copy(tmp); l.material.emissiveIntensity = 0.6 + 0.8 * (0.5 + 0.5 * Math.sin(t * 9 + i * 1.3)); }); },
  };
}

/** thin glowing string between two world points; call set(a, b) every frame */
export function makeString({ radius = 0.007, color = 0xdfe6f2, opacity = 0.85 } = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity }));
  const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
  m.userData.set = (a, b) => {
    d.subVectors(b, a); const L = d.length();
    m.position.copy(a).addScaledVector(d, 0.5);
    m.scale.set(1, Math.max(1e-4, L), 1);
    m.quaternion.setFromUnitVectors(up, d.normalize());
  };
  return m;
}

/** text label sprite (fonts must be loaded first) */
export function labelSprite(text, { color = '#EDEAE4', bg = null, font = '800 110px Poppins', w = 1024, h = 220, height = 0.5 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (bg) { const tw = g.measureText(text).width + 80; g.fillStyle = bg; const x0 = (w - tw) / 2; g.beginPath(); g.roundRect(x0, 30, tw, h - 60, 40); g.fill(); }
  g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 6);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  spr.scale.set(height * (w / h), height, 1);
  return spr;
}
