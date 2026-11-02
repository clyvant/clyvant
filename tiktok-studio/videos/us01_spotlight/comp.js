// US-01 · "Nobody noticed" — The Spotlight Effect (Gilovich, Medvec & Savitsky, 2000)
// Visual idea: you on a stage under a spotlight, convinced the room is watching.
// The camera pulls back: the seats are empty. When the room *is* full, the data
// (50% guessed vs 23% noticed) is shown by lighting up the audience itself.
import { THREE, createGL, makeMannequin, makeCone, makePool, makeBlobShadow, makeDust, makeCurtain, makeAuditorium, makeBrain, makeGlowSprite, svgSprite, camPath } from '/engine/kit3d.js';
import { el, put, prog, lerp, E, vis, clamp, vnoise, mulberry32 } from '/engine/runtime.js';
import * as UI from '/engine/ui.js';

export default async function comp(S) {
  const script = await (await fetch(`/${S.comp}/script.json`, { cache: 'no-store' })).json();
  const T = script.ui;
  const B = (id) => S.b(id);
  const A = script.anchors || {};
  const W = (id, w, e = 's') => S.w(id, A[w] ?? w, e);
  const END = S.duration;

  // ------------------------------------------------------------------ 3D world
  const { scene, camera, renderer } = createGL('gl', { exposure: 1.1, clear: 0x06070a });
  scene.fog = new THREE.FogExp2(0x06070a, 0.03);
  document.getElementById('gl').style.filter = 'contrast(1.08) saturate(1.06)';

  const hemi = new THREE.HemisphereLight(0x7d8aa8, 0x0b0907, 0.22);
  scene.add(hemi);
  const rim = new THREE.DirectionalLight(0x6f8cff, 0.9);
  rim.position.set(-3, 6, -8);
  scene.add(rim);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // ---- theatre (origin)
  const theatre = new THREE.Group();
  scene.add(theatre);
  const stage = new THREE.Mesh(new THREE.BoxGeometry(14, 1.0, 18), new THREE.MeshStandardMaterial({ color: 0x17130f, roughness: 0.62, metalness: 0.05 }));
  stage.position.set(0, 0.5, -6);
  theatre.add(stage);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(14.05, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: 0x8a7550, roughness: 0.4, metalness: 0.6 }));
  lip.position.set(0, 1.0, 3.0);
  theatre.add(lip);
  const curtain = makeCurtain({ w: 18, h: 10, color: 0x3d0a13 });
  curtain.position.set(0, 5.6, -5.8);
  curtain.material.transparent = true;
  theatre.add(curtain);

  // dawn backdrop revealed when the curtain dissolves
  const skyC = document.createElement('canvas'); skyC.width = 16; skyC.height = 512;
  const sg = skyC.getContext('2d');
  const grd = sg.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#0d1424'); grd.addColorStop(0.45, '#3b3550'); grd.addColorStop(0.68, '#c9774a'); grd.addColorStop(0.8, '#ffc27a'); grd.addColorStop(1, '#2a1a12');
  sg.fillStyle = grd; sg.fillRect(0, 0, 16, 512);
  const skyTex = new THREE.CanvasTexture(skyC); skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(260, 120), new THREE.MeshBasicMaterial({ map: skyTex, fog: false, transparent: true, opacity: 0 }));
  sky.position.set(0, 26, -70);
  scene.add(sky);
  const sun = makeGlowSprite('255,196,120', 34, 0.9);
  sun.position.set(0, 9, -66);
  sun.material.fog = false;
  scene.add(sun);

  const hero = makeMannequin({ color: 0xc3c6cc });
  hero.group.position.set(0, 1.0, 0.4);
  theatre.add(hero.group);
  const heroShadow = makeBlobShadow(0.55, 0.7);
  heroShadow.position.set(0, 1.012, 0.42);
  theatre.add(heroShadow);

  const apex = new THREE.Vector3(0, 10.5, 2.6), target = new THREE.Vector3(0, 1.0, 0.45);
  const dir = target.clone().sub(apex);
  const cone = makeCone({ height: dir.length(), radius: 1.35, intensity: 0.32 });
  cone.position.copy(apex);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
  theatre.add(cone);
  const pool = makePool({ radius: 1.7 });
  pool.position.set(0, 1.015, 0.45);
  theatre.add(pool);
  const key = new THREE.SpotLight(0xffe3b8, 9, 0, 0.17, 0.55, 0);
  key.position.copy(apex);
  key.target.position.copy(target);
  theatre.add(key, key.target);
  const apexGlow = makeGlowSprite('255,232,196', 3.2, 1);
  apexGlow.position.copy(apex);
  theatre.add(apexGlow);
  const heart = makeGlowSprite('255,70,70', 0.9, 1);
  heart.position.set(0.05, 2.42, 0.62);
  theatre.add(heart);
  const dust = makeDust({ n: 420, box: [2.2, 8, 2.2], center: [0, 5.4, 1.5], size: 0.03 });
  theatre.add(dust);

  const aud = makeAuditorium({ rows: 6, perRow: 10, z0: 5.4, rowGap: 1.2, rise: 0.34, occupancy: 0.78, seed: 21 });
  theatre.add(aud.group);
  aud.group.children[0].material.color.setHex(0x7a1826);
  const pMats = new Set();
  aud.peopleGroup.traverse((m) => { if (m.isMesh) pMats.add(m.material); });
  for (const m of pMats) {
    m.emissive = new THREE.Color(0xffffff);
    m.emissiveIntensity = 0.0;
    m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n totalEmissiveRadiance *= vColor;\n#endif'); };
  }
  const house = new THREE.PointLight(0xffd6a0, 0, 40, 0);
  house.position.set(0, 7.5, 9);
  theatre.add(house);

  // which people "noticed": 50% guessed (white), 23% actual (gold)
  const P = aud.people.length;
  const order = aud.people.map((_, i) => i).sort((a, b) => mulberry32(a * 7 + 3)() - mulberry32(b * 7 + 3)());
  const guessSet = new Set(order.slice(0, Math.round(P * 0.5)));
  const actualSet = new Set(order.slice(0, Math.round(P * 0.23)));
  const cBase = new THREE.Color(0x3b3f47), cDim = new THREE.Color(0x1d1f24), cGuess = new THREE.Color(0xdfe5ee), cGold = new THREE.Color(0xffc83d);
  const cTmp = new THREE.Color();

  // ---- field of spotlights (x = 80)
  const field = new THREE.Group();
  field.position.set(80, 0, 0);
  scene.add(field);
  const FIG = [[0, 0, 0.0, 0.5], [-3.6, -2.6, 0.9, 0.2], [3.9, -2.2, -0.7, 0.4], [-2.2, 3.2, 0.3, 0.6], [2.6, 3.6, -0.4, 0.3], [-6.4, 0.8, 1.4, 0.5], [6.6, 0.6, -1.2, 0.2], [-1.0, -6.0, 2.6, 0.4], [5.2, -6.4, -2.4, 0.3], [-6.0, -5.4, 1.9, 0.5], [0.8, 6.8, 3.1, 0.3]];
  const fieldItems = FIG.map(([x, z, rot, sad], i) => {
    const m = makeMannequin({ color: 0xb4b8bf });
    m.group.position.set(x, 0, z);
    m.group.rotation.y = rot;
    m.pose({ sad, turn: (i % 3 - 1) * 0.3 });
    const c = makeCone({ height: 11, radius: 1.25, intensity: 0.3 });
    c.position.set(x, 11, z);
    const pl = makePool({ radius: 1.55 });
    pl.position.set(x, 0.012, z);
    const sh = makeBlobShadow(0.5, 0.7); sh.position.set(x, 0.011, z);
    field.add(m.group, c, pl, sh);
    for (const mat of Object.values(m.mats)) { mat.emissive = new THREE.Color(0xffe0b0); mat.emissiveIntensity = 0; }
    return { m, c, pl };
  });
  const fieldLight = new THREE.DirectionalLight(0xffe2b8, 0.0);
  fieldLight.position.set(80, 20, 4);
  fieldLight.target.position.set(80, 0, 0);
  scene.add(fieldLight, fieldLight.target);

  // ---- brain (x = -80)
  const brainG = new THREE.Group();
  brainG.position.set(-80, 3, 0);
  brainG.scale.setScalar(1.0);
  scene.add(brainG);
  const brain = makeBrain({ n: 22000, scale: 1.7, color: 0xffb648 });
  brainG.add(brain);
  const brainCore = makeGlowSprite('255,170,90', 4.2, 0.28);
  brainG.add(brainCore);
  const mem = ['party', 'text', 'clock'].map((k) => {
    const sp = svgSprite(UI.ICONS[k].replace('width="150" height="150"', 'width="256" height="256"'), 0.42);
    S.wait(sp.userData.ready);
    brainG.add(sp);
    return sp;
  });

  // ------------------------------------------------------------------ timing
  const tHook = B('hook'), tThey = W('hook', 'They');
  const tStudy = B('study'), tStrangers = W('study', 'room'), tShirt = W('study', 'embarrassing');
  const tGuess = B('guess'), tHalf = W('guess', 'half'), tGuessed = W('guess', 'guessed');
  const tActual = B('actual'), t23 = W('actual', 'twenty');
  const tName = B('name'), tCenter = B('center'), tOwn = B('theirown');
  const tDeep = B('deeper'), tShaky = B('shaky'), tNever = W('shaky', 'never');
  const tReplay = B('replay'), tRent = B('rentfree'), tFree = B('freedom');
  const tLonely = W('freedom', 'lonely'), tFreedomW = W('freedom', 'freedom');
  const tLiving = B('living'), tCta = B('cta');
  const ownTimes = [W('theirown', 'own'), W('theirown', 'replaying'), W('theirown', 'hair'), W('theirown', 'voice'), W('theirown', 'mistakes')];

  // scene windows
  const inTheatre = (t) => t < tOwn.start - 0.02 || (t >= tDeep.start - 0.05 && t < tRent.start - 0.02) || t >= tFree.start - 0.05;
  const inField = (t) => t >= tOwn.start - 0.02 && t < tDeep.start - 0.05;
  const inBrain = (t) => t >= tRent.start - 0.02 && t < tFree.start - 0.05;

  // ------------------------------------------------------------------ camera
  const theatreCam = camPath(camera, [
    { t: 0, p: [0, 2.2, 8.4], l: [0, 3.15, 0.4], fov: 36 },
    { t: tThey - 0.05, p: [0, 2.3, 6.9], l: [0, 3.05, 0.4], fov: 35, e: 'linear' },
    { t: tThey + 1.5, p: [0, 8.0, 23.5], l: [0, 1.8, 2.5], fov: 42, e: 'outCubic' },
    { t: tStrangers - 0.4, p: [0.6, 7.2, 21], l: [0, 1.9, 2.5], fov: 41 },
    { t: tStrangers + 1.4, p: [2.6, 4.4, 15.5], l: [0, 2.3, 0.4], fov: 38 },
    { t: tShirt + 1.0, p: [1.2, 3.4, 11.2], l: [0, 2.4, 0.4], fov: 33 },
    { t: tGuess.start + 0.2, p: [1.0, 3.3, 10.6], l: [0, 2.4, 0.4], fov: 33 },
    { t: tGuess.start + 0.25, p: [0.95, 2.85, -2.5], l: [0.35, 2.25, 8.5], fov: 46, cut: true },
    { t: tActual.end, p: [0.85, 2.8, -2.0], l: [0.3, 2.2, 8.5], fov: 44, e: 'linear' },
    { t: tName.start - 0.05, p: [0.3, 1.55, 2.45], l: [0, 10.5, 2.6], fov: 52, cut: true },
    { t: tName.end + 0.2, p: [0.2, 1.75, 2.4], l: [0, 10.5, 2.6], fov: 46, e: 'linear' },
    // deeper: chest/face close-up
    { t: tDeep.start - 0.05, p: [1.7, 2.6, 8.6], l: [0, 2.55, 0.4], fov: 36, cut: true },
    { t: tReplay.end, p: [1.0, 2.5, 6.4], l: [0, 2.5, 0.4], fov: 36, e: 'linear' },
    // freedom: wide
    { t: tFree.start - 0.05, p: [0, 4.2, 13], l: [0, 2.2, 0], fov: 40, cut: true },
    { t: tFreedomW + 0.2, p: [0, 3.9, 11.5], l: [0, 2.6, -2], fov: 40, e: 'linear' },
    { t: tLiving.start + 0.6, p: [0, 3.1, 5.6], l: [0, 2.7, -8], fov: 40 },
    { t: tCta.start, p: [0, 3.0, 2.0], l: [0, 2.8, -12], fov: 42, e: 'inOutSine' },
    { t: END - 1.4, p: [0, 3.3, -1.0], l: [0, 3.1, -20], fov: 44, e: 'inOutSine' },
    { t: END - 1.35, p: [0, 2.2, 8.4], l: [0, 3.15, 0.4], fov: 36, cut: true },
  ]);

  // ------------------------------------------------------------------ 2D layers
  const dom = document.getElementById('dom');
  const kick = el('div', { html: `${T.kicker} <span style="color:#EDEAE4;opacity:.55">·</span> <span style="color:#EDEAE4">${T.title}</span>`, style: { fontWeight: '700', fontSize: '30px', letterSpacing: '0.3em', color: UI.C.gold, whiteSpace: 'nowrap' } }, dom);
  const hookHead = UI.header(dom, T.hook_text, { y: 360, size: 66 });
  const study1 = UI.studyCard(dom, { label: T.study_label || 'STUDY', org: T.study1_org, year: T.study1_year, title: T.study1_title, authors: T.study1_authors, y: 560 });
  const bars = UI.statBars(dom, { labelA: T.guessed, valueA: 50, labelB: T.actual, valueB: 23, y: 470 });
  const slam = UI.titleSlam(dom, { kicker: T.kicker, title: T.title, y: 640, size: T.title_size || 128, accentIndex: T.title_accent });
  const study2 = UI.studyCard(dom, { label: T.study_label || 'STUDY', org: T.study2_title, year: T.study2_year, title: T.study2_sub || '', authors: T.study2_authors, y: 520 });
  const wave = UI.waveform(dom, { y: 600, labels: [T.wave_label || '● YOUR VOICE', T.wave_feels || 'HOW IT FEELS', T.wave_sounded || 'HOW IT SOUNDED'] });
  const tiles = UI.iconTiles(dom, [{ icon: 'party', label: T.item1 }, { icon: 'text', label: T.item2 }, { icon: 'clock', label: T.item3 }], { y: 560 });
  const end = UI.endCard(dom, { follow: T.follow, sub: T.follow_sub, question: T.question, y: 700 });
  const src = UI.sourceLine(dom, T.source);
  const src2 = UI.sourceLine(dom, T.source2 || T.source);
  const tags = [T.tag1 || 'what they said', T.tag2 || 'their hair', T.tag3 || 'their voice', T.tag4 || 'their mistakes'].map((txt) =>
    el('div', { text: txt, style: { padding: '14px 26px', borderRadius: '40px', background: 'rgba(11,13,18,0.8)', border: '2px solid rgba(255,200,61,0.55)', color: '#EDEAE4', fontWeight: '700', fontSize: '34px', whiteSpace: 'nowrap' } }, dom));
  const tagPos = [[300, 380], [760, 450], [330, 540], [740, 620]];
  const dark = el('div', { style: { width: '1080px', height: '1920px', background: '#000' } }, dom);
  dom.prepend(dark); // under the cards, above 3D

  // captions: hidden while the big title says it
  S.captions({ y: 1190, size: 72, maxWords: 3, maxChars: 15 });
  S.hideCaptions(tName.start - 0.05, tName.end + 0.15);
  S.hideCaptions(tCta.start + 0.1, END);

  // ------------------------------------------------------------------ fx schedule
  S.flash(0.06, 0.22, 0.55);
  S.shake(0.1, 0.55, 9);
  S.punch(tThey, 0.5, 0.05);
  S.flash(tShirt, 0.2, 0.35, '#FFC83D');
  S.flash(t23, 0.26, 0.4, '#FFC83D');
  S.shake(t23, 0.45, 12);
  S.punch(t23, 0.5, 0.07);
  S.flash(tName.start - 0.02, 0.2, 0.6);
  S.punch(W('name', 'spotlight'), 0.6, 0.06);
  S.flash(tOwn.start - 0.02, 0.16, 0.3);
  S.shake(tDeep.start, 0.6, 7);
  S.flash(tRent.start - 0.02, 0.16, 0.3);
  S.flash(tFreedomW, 0.5, 0.35, '#FFD9A0');
  S.camZoom = (t) => 1 + 0.015 * Math.sin(t * 0.35);

  // ------------------------------------------------------------------ per frame
  S.on((t) => {
    theatre.visible = inTheatre(t);
    field.visible = inField(t);
    brainG.visible = inBrain(t);
    fieldLight.intensity = field.visible ? 0.25 : 0;

    // ---- theatre state
    const loopBack = t >= END - 1.35;
    // spotlight on/off: on from frame 0; off at "lonely"; back on for loop tail
    let spot = 1;
    if (t >= tLonely && !loopBack) spot = 1 - E.outCubic(prog(t, tLonely, tLonely + 0.25));
    if (loopBack) spot = E.outExpo(prog(t, END - 0.9, END - 0.75));
    const flick = t < 0.25 ? (Math.floor(t * 30) % 3 === 1 ? 0.35 : 1) : 1; // ignition flicker
    cone.material.uniforms.intensity.value = 0.32 * spot * flick;
    key.intensity = 9 * spot * flick;
    apexGlow.material.opacity = spot * flick;
    pool.material.opacity = spot * flick;
    dust.userData.update(t);
    const tBeat = W('deeper', 'nerves');
    const beatAt = (x) => Math.exp(-((t - x) ** 2) / 0.004);
    const hb = Math.max(beatAt(tBeat), 0.75 * beatAt(tBeat + 0.27), 0.5 * beatAt(tBeat + 1.1), 0.35 * beatAt(tBeat + 1.37));
    const heartOn = t >= tDeep.start && t < tShaky.end ? 0.25 + 0.75 * hb : 0;
    heart.material.opacity = heartOn;
    heart.scale.setScalar(0.7 + 0.6 * hb);
    const gods = t >= tCenter.start - 0.05 && t < tOwn.start;
    if (gods) { cone.material.uniforms.intensity.value *= 0.12; pool.material.opacity *= 0.45; apexGlow.material.opacity = 0; }
    dust.material.opacity = 0.8 * spot;

    // dawn
    const dawn = loopBack ? 0 : E.inOutSine(prog(t, tFreedomW - 0.3, tFreedomW + 1.6));
    sky.material.opacity = dawn;
    sun.material.opacity = dawn * 0.95;
    curtain.material.opacity = 1 - dawn;
    curtain.visible = dawn < 0.999;
    hemi.color.setRGB(lerp(0.49, 1.0, dawn), lerp(0.54, 0.78, dawn), lerp(0.66, 0.56, dawn));
    hemi.intensity = lerp(0.22, 0.95, dawn);
    rim.color.setRGB(lerp(0.44, 1.0, dawn), lerp(0.55, 0.72, dawn), lerp(1.0, 0.45, dawn));
    scene.fog.color.setRGB(lerp(0.024, 0.32, dawn), lerp(0.027, 0.2, dawn), lerp(0.04, 0.14, dawn));
    scene.fog.density = lerp(0.03, 0.012, dawn);
    renderer.setClearColor(scene.fog.color, 1);

    // hero: idle breathing, shirt goes yellow, turns and walks into the dawn
    const shirtK = E.outCubic(prog(t, tShirt, tShirt + 0.25)) * (t < tFree.start ? 1 : 1 - prog(t, tFree.start, tFree.start + 0.6));
    hero.mats.shirt.color.copy(cTmp.setHex(0xc3c6cc).lerp(cGold, loopBack ? 0 : shirtK));
    const walkStart = W('living', 'stop');
    if (t < walkStart - 0.7 || loopBack) {
      hero.group.rotation.y = 0;
      hero.group.position.set(0, 1.0, 0.4);
      hero.pose({ sad: t < tFree.start ? 0.45 : lerp(0.45, 0.0, prog(t, tFreedomW, tFreedomW + 1.0)), breath: Math.sin(t * 1.7), lookUp: t >= tFreedomW ? 0.15 * prog(t, tFreedomW, tFreedomW + 1.2) : 0 });
    } else {
      const turn = E.inOutCubic(prog(t, walkStart - 0.7, walkStart + 0.2));
      hero.group.rotation.y = Math.PI * turn;
      const walkT = Math.max(0, t - (walkStart + 0.1));
      const z = 0.4 - walkT * 0.95;
      hero.group.position.set(0, 1.0, z);
      hero.walk(walkT * 6.2, clamp(walkT * 2), 0.0);
    }
    heroShadow.position.set(hero.group.position.x, 1.012, hero.group.position.z + 0.02);
    pool.position.z = 0.45;

    // audience
    const audOn = t >= tStrangers && t < tName.start;
    aud.peopleGroup.visible = audOn;
    house.intensity = audOn ? 1.0 : t < tStrangers ? 1.25 * prog(t, tThey, tThey + 1.2) : 0.0;
    if (audOn) {
      const g1 = prog(t, tHalf - 0.1, tHalf + 0.5);
      const g2 = prog(t, t23, t23 + 0.18);
      let m = 0;
      aud.paint((i) => {
        let c = cTmp.copy(cBase);
        if (t >= tHalf - 0.1 && guessSet.has(i)) c.lerp(cGuess, E.outCubic(prog(t, tHalf - 0.1 + (i % 7) * 0.04, tHalf + 0.25 + (i % 7) * 0.04)));
        if (t >= t23) { c = actualSet.has(i) ? cTmp.copy(cGold) : cTmp.copy(cDim); }
        return c;
      });
      for (const mat of pMats) mat.emissiveIntensity = t >= t23 ? 1.1 : t >= tHalf - 0.1 ? 0.55 * g1 : 0.05;
      void g2; void m;
    }

    // field: lights switch on one by one
    if (field.visible) {
      fieldItems.forEach((it, i) => {
        const on = i === 0 ? tOwn.start + 0.1 : i <= 4 ? ownTimes[i] - 0.05 : ownTimes[4] + 0.15 * (i - 4);
        const k = E.outExpo(prog(t, on, on + 0.18));
        it.c.material.uniforms.intensity.value = 0.3 * k;
        it.pl.material.opacity = k;
        for (const mat of Object.values(it.m.mats)) mat.emissiveIntensity = 0.08 * k;
        it.m.pose({ sad: 0.3 + 0.2 * (i % 2), turn: Math.sin(t * 0.4 + i) * 0.25, breath: Math.sin(t * 1.6 + i) });
      });
    }

    // brain
    if (brainG.visible) {
      brain.userData.update(t, 0.5 + 0.5 * Math.sin(t * 3));
      brainG.rotation.y = -0.25 + (t - tRent.start) * 0.18;
      mem.forEach((sp, i) => {
        const a = (t - tRent.start) * 1.4 + i * 2.094;
        sp.position.set(Math.cos(a) * 0.5, 0.12 + Math.sin(a * 1.3) * 0.08, Math.sin(a) * 0.35);
        sp.material.opacity = 0.95;
      });
    }

    // ---- camera (reset shared state every frame: workers render frames out of order)
    camera.up.set(0, 1, 0);
    if (inField(t)) {
      const u = prog(t, tOwn.start, tDeep.start);
      camera.position.set(80 + lerp(-2.5, 3, E.inOutSine(u)), lerp(11, 4.6, E.outCubic(u)), lerp(19, 11.5, E.outCubic(u)));
      camera.lookAt(80, lerp(0.6, 1.5, u), lerp(-1.5, 0, u));
      if (camera.fov !== 42) { camera.fov = 42; camera.updateProjectionMatrix(); }
    } else if (inBrain(t)) {
      const u = prog(t, tRent.start, tFree.start);
      camera.position.set(-80 + lerp(1.6, 0.8, u), 3.35 + u * 0.2, lerp(6.4, 5.4, E.outCubic(u)));
      camera.lookAt(-80, 3, 0);
      if (camera.fov !== 40) { camera.fov = 40; camera.updateProjectionMatrix(); }
    } else if (t >= tCenter.start - 0.05 && t < tOwn.start) {
      // god's-eye: slow rotation above the lone figure in its pool of light
      const u = prog(t, tCenter.start, tOwn.start);
      const a = u * 1.4;
      const h = lerp(9.5, 7.2, E.inOutSine(u));
      camera.position.set(Math.sin(a) * 2.6, h, 0.45 + Math.cos(a) * 2.6);
      camera.up.set(Math.sin(a + Math.PI), 0, Math.cos(a + Math.PI)).normalize();
      camera.lookAt(0, 1.0, 0.45);
      if (camera.fov !== 40) { camera.fov = 40; camera.updateProjectionMatrix(); }
    } else {
      theatreCam(t);
      // subtle handheld drift
      camera.position.x += vnoise(t * 0.6, 4) * 0.04;
      camera.position.y += vnoise(t * 0.5, 5) * 0.03;
    }

    renderer.render(scene, camera);

    // ---- 2D
    put(kick, { x: 540, y: 250, o: vis(t, -1, tStudy.start + 0.6, 0.01, 0.3) });
    hookHead(t, -1, tStudy.start + 0.6);
    const cardDark = Math.max(
      vis(t, W('study', 'psychologists') - 0.2, tStrangers - 0.3, 0.3, 0.4) * 0.3,
      vis(t, tGuessed - 0.4, tActual.end + 0.2, 0.3, 0.3) * 0.25,
      vis(t, tName.start, tName.end + 0.1, 0.05, 0.25) * 0.35,
      vis(t, W('deeper', 'Another') - 0.2, tShaky.end, 0.3, 0.3) * 0.45,
      vis(t, tReplay.start, tReplay.end + 0.2, 0.3, 0.3) * 0.45,
      vis(t, tCta.start, END - 1.4, 0.4, 0.3) * 0.45,
      t >= END - 1.4 && t < END - 0.85 ? 1 - prog(t, END - 1.4, END - 1.36) * 0 : 0,
    );
    dark.style.opacity = String(cardDark);
    dark.style.display = cardDark > 0.002 ? '' : 'none';
    study1(t, W('study', 'psychologists') - 0.1, tStrangers - 0.3);
    bars(t, tGuessed - 0.15, t23, tActual.end + 0.2);
    slam(t, tName.start, tName.end + 0.1);
    study2(t, W('deeper', 'Another') - 0.1, tDeep.end + 0.1);
    wave(t, tShaky.start - 0.1, tShaky.end + 0.15, tNever);
    tiles(t, [W('replay', 'party') - 0.1, W('replay', 'text') - 0.1, W('replay', 'three') - 0.1], tReplay.end + 0.25);
    end(t, tCta.start + 0.05, END - 1.45, W('cta', 'tell'));
    src(t, W('study', 'psychologists'), tActual.end);
    src2(t, W('deeper', 'Another'), tShaky.end);
    tags.forEach((tg, i) => {
      const t0 = ownTimes[i + 1] - 0.05;
      const env = vis(t, t0, tOwn.end + 0.1, 0.01, 0.25);
      const p = prog(t, t0, t0 + 0.3);
      put(tg, { x: tagPos[i][0], y: tagPos[i][1] + lerp(30, 0, E.outBack(p, 2)), o: env, s: lerp(0.7, 1, E.outBack(p, 2.2)) });
    });
  });
}
