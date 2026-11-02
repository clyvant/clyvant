// US-02 · "5 psychology tricks people use on you" — dark psychology, framed as defence.
// Visual spine: a marionette ("you") on strings under a cold light. Each tactic cuts to
// its own 3D set-piece; the strings snap at the end ("knowing the script is your defense").
import { THREE, createGL, makeMannequin, makeCone, makePool, makeBlobShadow, makeDust, makeGlowSprite, makeCan, makeDoor, makeSlot, makeString, labelSprite, camPath } from '/engine/kit3d.js';
import { el, put, prog, lerp, E, vis, clamp, vnoise } from '/engine/runtime.js';
import * as UI from '/engine/ui.js';

export default async function comp(S) {
  const script = await (await fetch(`/${S.comp}/script.json`, { cache: 'no-store' })).json();
  const T = script.ui;
  const A = script.anchors || {};
  const B = (id) => S.b(id);
  const W = (id, w, e = 's') => S.w(id, A[w] ?? w, e);
  const END = S.duration;
  await document.fonts.load('800 110px Poppins');
  await document.fonts.load('900 120px Poppins');

  const { scene, camera, renderer } = createGL('gl', { exposure: 1.05, clear: 0x050608 });
  scene.fog = new THREE.FogExp2(0x050608, 0.045);
  document.getElementById('gl').style.filter = 'contrast(1.1) saturate(1.08)';
  const hemi = new THREE.HemisphereLight(0x6f7d99, 0x0a0606, 0.25);
  scene.add(hemi);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.92 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // ------------------------------------------------------------ puppet (x=0)
  const pup = new THREE.Group(); scene.add(pup);
  const fig = makeMannequin({ color: 0x9aa1ab, roughness: 0.45 });
  pup.add(fig.group);
  const pShadow = makeBlobShadow(0.55, 0.7); pShadow.position.y = 0.012; pup.add(pShadow);
  const bar = new THREE.Group(); pup.add(bar);
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.6 });
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 0.07), wood);
  const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.9), wood);
  bar.add(b1, b2);
  const strings = ['crown', 'wristL', 'wristR', 'kneeL', 'kneeR'].map(() => { const m = makeString(); pup.add(m); return m; });
  const barPts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.72, 0, 0), new THREE.Vector3(0.72, 0, 0), new THREE.Vector3(-0.1, 0, 0.42), new THREE.Vector3(0.1, 0, 0.42)];
  const pCone = makeCone({ height: 12, radius: 1.7, intensity: 0.26, color: 0xb8c8ff });
  pCone.position.set(0, 12, 0.2); pup.add(pCone);
  const pPool = makePool({ radius: 1.9, color: '184,200,255', strength: 0.75 }); pPool.position.y = 0.011; pup.add(pPool);
  const pKey = new THREE.SpotLight(0xc6d4ff, 7, 0, 0.22, 0.6, 0); pKey.position.set(0, 12, 0.6); pKey.target.position.set(0, 1, 0); pup.add(pKey, pKey.target);
  const pRim = new THREE.DirectionalLight(0xff3b3b, 1.6); pRim.position.set(2, 4, -6); pup.add(pRim);
  const pDust = makeDust({ n: 380, box: [3, 9, 3], center: [0, 4.5, 0.2], size: 0.03, color: 0xd6e0ff }); pup.add(pDust);

  // ------------------------------------------------------------ can (x=40)
  const canG = new THREE.Group(); canG.position.set(40, 0, 0); scene.add(canG);
  const can = makeCan(); can.position.set(0, 1.6, 0); can.scale.setScalar(0.85); canG.add(can);
  const canCone = makeCone({ height: 10, radius: 1.3, intensity: 0.3 }); canCone.position.set(0, 10.5, 0); canG.add(canCone);
  const canPool = makePool({ radius: 1.4 }); canPool.position.y = 0.012; canG.add(canPool);
  const canKey = new THREE.SpotLight(0xffe6c4, 8, 0, 0.2, 0.5, 0); canKey.position.set(0.5, 10, 2.5); canKey.target.position.set(0, 1.6, 0); canG.add(canKey, canKey.target);
  const canRim = new THREE.DirectionalLight(0xff4a4a, 1.2); canRim.position.set(-3, 3, -4); canG.add(canRim);
  const canGlow = makeGlowSprite('255,80,80', 3.2, 0.35); canGlow.position.set(0, 1.6, -0.8); canG.add(canGlow);

  // ------------------------------------------------------------ door (x=80)
  const doorG = new THREE.Group(); doorG.position.set(80, 0, 0); scene.add(doorG);
  const door = makeDoor(); doorG.add(door.group);
  const visitor = makeMannequin({ color: 0x8d939c }); visitor.group.position.set(0.15, 0, 0.75); visitor.group.rotation.y = Math.PI; doorG.add(visitor.group);
  const dLight = new THREE.PointLight(0xffb36b, 0, 12, 0); dLight.position.set(0, 1.4, -1.0); doorG.add(dLight);
  const wallWash = new THREE.SpotLight(0xaab8ff, 5, 0, 0.5, 0.7, 0); wallWash.position.set(0, 6.5, 4.5); wallWash.target.position.set(0, 1.3, 0); doorG.add(wallWash, wallWash.target);
  const dFill = new THREE.DirectionalLight(0x9fb3ff, 0.75); dFill.position.set(3, 5, 6); doorG.add(dFill, dFill.target); dFill.target.position.set(0, 1, 0);

  // ------------------------------------------------------------ slot (x=120)
  const slotG = new THREE.Group(); slotG.position.set(120, 0, 0); scene.add(slotG);
  const slot = makeSlot(); slotG.add(slot.group);
  const sKey = new THREE.SpotLight(0xffffff, 7, 0, 0.32, 0.6, 0); sKey.position.set(0, 9, 5); sKey.target.position.set(0, 2, 0); slotG.add(sKey, sKey.target);
  const sPool = makePool({ radius: 2.4 }); sPool.position.y = 0.012; slotG.add(sPool);

  // ------------------------------------------------------------ DARVO (x=160)
  const dvG = new THREE.Group(); dvG.position.set(160, 0, 0); scene.add(dvG);
  const pa = makeMannequin({ color: 0xa7adb6 }); pa.group.position.set(-0.72, 0, 0); pa.group.rotation.y = Math.PI / 2; dvG.add(pa.group);
  const pb = makeMannequin({ color: 0x7c2a2f }); pb.group.position.set(0.72, 0, 0); pb.group.rotation.y = -Math.PI / 2; dvG.add(pb.group);
  const lv = labelSprite(T.victim, { color: '#EDEAE4', bg: 'rgba(10,12,16,0.85)', height: 0.3 });
  const lo = labelSprite(T.offender, { color: '#FF4D4D', bg: 'rgba(10,12,16,0.85)', height: 0.3 });
  dvG.add(lv, lo);
  for (const x of [-0.72, 0.72]) { const c = makeCone({ height: 9, radius: 1.0, intensity: 0.24 }); c.position.set(x, 9, 0); dvG.add(c); const pl = makePool({ radius: 1.1 }); pl.position.set(x, 0.012, 0); dvG.add(pl); }
  const dvKey = new THREE.DirectionalLight(0xffe2c0, 0.9); dvKey.position.set(0, 8, 5); dvG.add(dvKey, dvKey.target); dvKey.target.position.set(0, 1, 0);
  const dvRim = new THREE.DirectionalLight(0xff3b3b, 1.0); dvRim.position.set(0, 3, -6); dvG.add(dvRim, dvRim.target);

  // ------------------------------------------------------------ timing
  const tb = {}; for (const b of S.tl.beats) tb[b.id] = b;
  const tNum = W('hook', 'Number'), tWalk = W('hook', 'walk');
  const tTwice = W('t1', 'twice'), tDebt = W('t1b', 'debt');
  const tSev = W('t2', 'seventeen'), t76 = W('t2b', 'Seventy');
  const tRej = W('t3', 'rejected'), tRef = W('t3', 'refused'), tFifty = W('t3b', 'fifty'), tS17 = W('t3b', 'Seventeen');
  const tKind = W('t4', 'Kind'), tDist = W('t4', 'distant'), tSlot = W('t4', 'slot');
  const tApol = W('t5', 'apologizing');
  const dvTimes = [W('t5b', 'deny'), W('t5b', 'attack'), W('t5b', 'reverse'), W('t5b', 'victim'), W('t5b', 'offender')];
  const tSmart = W('close', 'smart'), tScript = W('close', 'script');
  const isPup = (t) => t < tb.t1.start - 0.03 || (t >= tb.n2.start - 0.03 && t < tb.t2.start - 0.03) || (t >= tb.n3.start - 0.03 && t < tb.t3.start - 0.03) ||
    (t >= tb.n4.start - 0.03 && t < tb.t4.start - 0.03) || (t >= tb.n5.start - 0.03 && t < tb.t5.start - 0.03) || t >= tb.close.start - 0.03;
  const isCan = (t) => !isPup(t) && t < tb.n2.start;
  const isDoor = (t) => !isPup(t) && t >= tb.t2.start - 0.03 && t < tb.n4.start;
  const isSlot = (t) => !isPup(t) && t >= tb.t4.start - 0.03 && t < tb.n5.start;
  const isDv = (t) => !isPup(t) && t >= tb.t5.start - 0.03 && t < tb.close.start;

  // ------------------------------------------------------------ 2D
  const dom = document.getElementById('dom');
  const dark = el('div', { style: { width: '1080px', height: '1920px', background: '#000' } }, dom);
  const kick = el('div', { html: `<span style="display:inline-block;width:12px;height:12px;border-radius:6px;background:#FF4D4D;margin-right:14px;vertical-align:middle"></span>${T.kicker}`, style: { fontWeight: '700', fontSize: '30px', letterSpacing: '0.3em', color: '#FF4D4D', whiteSpace: 'nowrap' } }, dom);
  const hookHead = UI.header(dom, T.hook_text, { y: 380, size: 58 });
  const chapters = [1, 2, 3, 4, 5].map((n) => UI.chapter(dom, { num: `0${n}`, title: T['n' + n], y: 700 }));
  const bars1 = UI.statBars(dom, { labelA: T.s1_a, valueA: T.s1_va, labelB: T.s1_b, valueB: T.s1_vb, y: 470, max: 2, fmt: (v) => Math.max(0, Math.round(v)) + '×', colorB: UI.C.red });
  const debt = UI.stamp(dom, T.debt, { y: 560 });
  const mentor = UI.stamp(dom, T.mentor, { y: 560, size: 56 });
  const refused = UI.stamp(dom, T.refused, { y: 560 });
  const unpred = UI.stamp(dom, T.unpred, { y: 520, size: 54, color: '#5AA2FF', rot: -5 });
  const truth = UI.header(dom, T.truth, { y: 430, size: 60 });
  const bars2 = UI.statBars(dom, { labelA: T.s2_a, valueA: T.s2_va, labelB: T.s2_b, valueB: T.s2_vb, y: 470, colorB: UI.C.red });
  const bars3 = UI.statBars(dom, { labelA: T.s3_a, valueA: T.s3_va, labelB: T.s3_b, valueB: T.s3_vb, y: 470, colorB: UI.C.red });
  const hotcold = el('div', { style: { width: '900px', textAlign: 'center', fontWeight: '900', fontSize: '120px', letterSpacing: '-0.02em' } }, dom);
  const darvo = UI.wordStack(dom, T.darvo, { y: 560, size: 104 });
  const defense = UI.titleSlam(dom, { kicker: T.kicker, title: T.defense, y: 620, size: 120, accent: UI.C.red, accentIndex: 2 });
  const end = UI.endCard(dom, { follow: T.save, sub: T.save_sub, question: T.question, y: 700 });
  const srcs = [1, 2, 3, 4, 5].map((n) => UI.sourceLine(dom, 'Source: ' + T['src' + n]));
  dom.prepend(dark);

  S.captions({ y: 1190, size: 72, maxWords: 3, maxChars: 15, active: '#FF5A5A', emph: '#FF5A5A' });
  S.hideCaptions(tb.close.start + 0.0, tb.close.end + 0.05);
  S.hideCaptions(tb.cta.start + 0.1, END);

  // fx
  S.flash(0.05, 0.2, 0.45, '#ffdddd'); S.shake(0.08, 0.6, 9);
  for (const id of ['n1', 'n2', 'n3', 'n4', 'n5']) { S.flash(tb[id].start - 0.02, 0.14, 0.45, '#ff6060'); S.punch(tb[id].start, 0.45, 0.05); }
  S.punch(tTwice, 0.4, 0.05); S.shake(tDebt, 0.35, 8);
  S.flash(t76, 0.22, 0.35, '#ff6060'); S.shake(t76, 0.45, 12); S.punch(t76, 0.5, 0.07);
  S.shake(tRej, 0.5, 16); S.flash(tRej, 0.12, 0.3);
  S.punch(tFifty, 0.4, 0.05);
  S.shake(tb.n5.start + 0.6, 0.4, 8);
  S.flash(tScript, 0.4, 0.35, '#FFD9A0');
  S.camZoom = (t) => 1 + 0.012 * Math.sin(t * 0.4);

  // ------------------------------------------------------------ cameras
  const camPup = (t) => {
    const k = t < tb.n1.start ? 0 : t < tb.close.start ? 1 : 2;
    if (k === 0) { // hook: low angle push-in
      const u = prog(t, 0, tb.n1.start);
      camera.position.set(lerp(0.7, 0.25, u), lerp(1.3, 1.55, u), lerp(6.4, 5.0, E.outCubic(u)));
      camera.lookAt(0, lerp(2.75, 2.55, u), 0);
      camera.fov = 40;
    } else if (k === 1) { // chapter beats: alternate angles
      const idx = ['n1', 'n2', 'n3', 'n4', 'n5'].findIndex((id) => t >= tb[id].start - 0.05 && t < tb[id].end + 0.5);
      const a = [0.6, -0.7, 0.3, -0.4, 0.9][Math.max(0, idx)];
      const u = prog(t, tb[['n1', 'n2', 'n3', 'n4', 'n5'][Math.max(0, idx)]].start, tb[['n1', 'n2', 'n3', 'n4', 'n5'][Math.max(0, idx)]].end + 0.4);
      camera.position.set(Math.sin(a) * lerp(6.4, 5.6, u), lerp(2.0, 2.3, u), Math.cos(a) * lerp(6.4, 5.6, u));
      camera.lookAt(0, 2.4, 0);
      camera.fov = 42;
    } else { // close + cta: rise as the strings snap, end wide
      const u = prog(t, tb.close.start, END);
      camera.position.set(lerp(0.5, 0, u), lerp(1.8, 3.2, E.inOutSine(u)), lerp(5.4, 8.5, E.inOutSine(u)));
      camera.lookAt(0, lerp(2.2, 2.0, u), 0);
      camera.fov = 40;
    }
    camera.updateProjectionMatrix();
  };
  const camCan = camPath(camera, [
    { t: tb.t1.start, p: [40 + 1.6, 2.2, 7.4], l: [40, 1.9, 0], fov: 36 },
    { t: tTwice, p: [40 + 0.6, 2.0, 6.0], l: [40, 2.0, 0], fov: 36, e: 'inOutSine' },
    { t: tb.t1b.end + 0.3, p: [40 - 0.8, 2.6, 5.2], l: [40, 1.8, 0], fov: 36, e: 'inOutSine' },
  ]);
  const camDoor = camPath(camera, [
    { t: tb.t2.start, p: [80 + 2.2, 1.5, 5.8], l: [80, 1.3, 0], fov: 38 },
    { t: tb.t2b.end, p: [80 + 1.2, 1.0, 3.6], l: [80, 0.7, 0.2], fov: 38, e: 'inOutSine' },
    { t: tb.t3.start - 0.03, p: [80 - 0.3, 1.8, 5.2], l: [80, 1.5, -0.3], fov: 40, cut: true },
    { t: tRej - 0.05, p: [80 - 0.2, 1.75, 4.2], l: [80, 1.5, -0.3], fov: 40, e: 'linear' },
    { t: tRej + 0.25, p: [80 - 0.15, 1.7, 3.4], l: [80, 1.5, -0.3], fov: 42, e: 'outExpo' },
    { t: tb.t3.end, p: [80 + 0.8, 1.9, 4.6], l: [80, 1.4, 0], fov: 40, e: 'inOutSine' },
    { t: tb.t3b.start - 0.03, p: [82.2, 1.7, 5.2], l: [80, 1.5, 0], fov: 38, cut: true },
    { t: tb.n4.start, p: [80 + 1.6, 1.6, 4.2], l: [80, 1.3, 0], fov: 38, e: 'linear' },
  ]);
  const camSlot = camPath(camera, [
    { t: tb.t4.start, p: [120 + 3.2, 2.6, 6.2], l: [120, 2.0, 0], fov: 38 },
    { t: tSlot, p: [120 + 0.7, 2.3, 4.2], l: [120, 2.0, 0.4], fov: 36, e: 'inOutSine' },
    { t: tb.n5.start, p: [120 + 0.3, 2.15, 4.0], l: [120, 2.0, 0.4], fov: 36, e: 'linear' },
  ]);
  const camDv = camPath(camera, [
    { t: tb.t5.start, p: [160, 2.5, 7.6], l: [160, 1.8, 0], fov: 40 },
    { t: tb.t5b.start, p: [160 + 0.4, 2.3, 6.6], l: [160, 1.8, 0], fov: 40, e: 'inOutSine' },
    { t: tb.close.start, p: [160 - 0.4, 2.1, 6.0], l: [160, 1.9, 0], fov: 40, e: 'linear' },
  ]);

  // ------------------------------------------------------------ per frame
  const v = new THREE.Vector3(), wtmp = new THREE.Vector3();
  S.on((t) => {
    pup.visible = isPup(t); canG.visible = isCan(t); doorG.visible = isDoor(t); slotG.visible = isSlot(t); dvG.visible = isDv(t);
    camera.up.set(0, 1, 0);

    // ---- puppet: control bar sways; limbs follow with a lag, jerks on beats
    const free = prog(t, tSmart, tScript + 0.3);       // strings snap during "close"
    const jerk = (x, d = 0.5) => Math.exp(-((t - x) ** 2) / (d * 0.02));
    const yank = jerk(tWalk + 0.25) + 0.7 * jerk(tNum) + 0.6 * jerk(tb.n5.start + 0.6);
    const sx = Math.sin(t * 1.1) * 0.12 + vnoise(t * 0.8, 3) * 0.06, sz = Math.sin(t * 0.7 + 1) * 0.08;
    bar.position.set(sx, lerp(5.6, 4.25, E.outCubic(prog(t, tb.n1.start, tb.n1.start + 0.4))) + yank * 0.18 + free * 3.5, sz);
    bar.rotation.set(Math.sin(t * 0.9) * 0.12 + yank * 0.1, 0, Math.sin(t * 1.3) * 0.15 - yank * 0.2);
    const sad = lerp(0.55, 0.0, free);
    fig.pose({ sad, breath: Math.sin(t * 1.6), lookUp: free * 0.2 });
    const lift = (1 - free);
    const armL = (0.35 + 0.25 * Math.sin(t * 1.3) + yank * 0.6) * lift, armR = (0.3 + 0.25 * Math.sin(t * 1.3 + 2.1) + yank * 0.5) * lift;
    fig.j.shoulderL.rotation.z = -0.06 - armL * 1.1; fig.j.shoulderL.rotation.x = -armL * 0.5;
    fig.j.shoulderR.rotation.z = 0.06 + armR * 1.1; fig.j.shoulderR.rotation.x = -armR * 0.4;
    fig.j.elbowL.rotation.x = -0.4 * lift - 0.08; fig.j.elbowR.rotation.x = -0.45 * lift - 0.08;
    fig.j.hipL.rotation.x = -(0.12 + 0.1 * Math.sin(t * 1.3 + 1)) * lift; fig.j.kneeL.rotation.x = (0.25 + 0.15 * Math.sin(t * 1.3 + 1)) * lift;
    fig.j.hipR.rotation.x = -(0.06 + 0.08 * Math.sin(t * 1.3 + 2.6)) * lift; fig.j.kneeR.rotation.x = (0.18 + 0.1 * Math.sin(t * 1.3 + 2.6)) * lift;
    fig.group.position.set(0, 0.04 * lift * Math.max(0, Math.sin(t * 1.3)), 0);
    fig.group.rotation.y = 0.12 * Math.sin(t * 0.5) * lift;
    pup.updateMatrixWorld(true);
    ['crown', 'wristL', 'wristR', 'kneeL', 'kneeR'].forEach((name, i) => {
      const snapAt = lerp(tSmart, tScript, i / 4);
      const snapped = t >= snapAt;
      const a = fig.j[name].getWorldPosition(v);
      const b = wtmp.copy(barPts[i]).applyMatrix4(bar.matrixWorld);
      if (snapped) { // string recoils upward from the cut
        const u = clamp((t - snapAt) / 0.5);
        b.lerp(a, 0); a.lerp(b, E.outCubic(u));
        strings[i].material.opacity = 0.85 * (1 - u);
      } else strings[i].material.opacity = 0.85;
      strings[i].userData.set(pup.worldToLocal(a.clone()), pup.worldToLocal(b.clone()));
    });
    const warm = E.inOutSine(prog(t, tScript - 0.2, tScript + 1.2));
    pKey.color.setRGB(lerp(0.78, 1.0, warm), lerp(0.83, 0.86, warm), lerp(1.0, 0.68, warm));
    pCone.material.uniforms.color.value.setRGB(lerp(0.72, 1.0, warm), lerp(0.78, 0.86, warm), lerp(1.0, 0.66, warm));
    pRim.intensity = lerp(1.6, 0.3, warm);
    pDust.userData.update(t);

    // ---- can
    can.rotation.y = t * 0.9; can.rotation.z = Math.sin(t * 0.8) * 0.08; can.position.y = 1.6 + Math.sin(t * 1.4) * 0.05;

    // ---- door: ajar (foot in door) -> slams on "rejected" -> cracks open again
    let open;
    if (t < tb.t3.start) open = 0.55 + 0.05 * Math.sin(t * 0.7);
    else if (t < tRej) open = lerp(0.62, 0.95, E.outCubic(prog(t, tb.t3.start, tRej - 0.2)));
    else if (t < tb.t3b.start) open = 0.95 * (1 - E.inExpo(prog(t, tRej, tRej + 0.16)));
    else open = lerp(0.0, 0.35, E.outCubic(prog(t, tb.t3b.start + 0.2, tFifty)));
    door.setOpen(open);
    const lightK = clamp(open / 0.4);
    dLight.intensity = 3.2 * lightK; door.spill.material.opacity = lightK; door.glow.material.color.setRGB(lightK, 0.76 * lightK, 0.48 * lightK);
    // visitor: steps forward, foot wedged in the gap (t2), stands back for t3
    if (t < tb.t3.start) {
      visitor.group.rotation.y = Math.PI;
      visitor.pose({ sad: 0.1 });
      const step = E.outCubic(prog(t, tb.t2.start + 0.5, tb.t2.start + 1.6));
      visitor.group.position.set(0.15, 0, lerp(1.2, 0.62, step));
      visitor.j.hipR.rotation.x = -0.45 * step; visitor.j.kneeR.rotation.x = 0.1 * step;
    } else {
      visitor.pose({ sad: 0.35 });
      visitor.group.position.set(1.15, 0, 1.25);
      visitor.group.rotation.y = Math.PI + 0.5;
    }

    // ---- slot: reels spin, stop one by one at "slot machine"
    const spin = (i) => { const stopAt = tSlot + 0.35 * i + 0.4; const tt = Math.min(t, stopAt); const w = 9 + i * 1.5; return (tt - tb.t4.start) * w + (t > stopAt ? 0 : 0) + i * 0.7; };
    const stopTarget = [0, 1, 2].map((i) => (Math.round(spin(i) / (Math.PI / 3) - 0.5) + 0.5) * (Math.PI / 3));
    slot.setReels([0, 1, 2].map((i) => { const stopAt = tSlot + 0.35 * i + 0.4; return t < stopAt ? spin(i) : lerp(spin(i), stopTarget[i], E.outBack(prog(t, stopAt, stopAt + 0.25), 2)); }));
    const hotK = t < tDist ? 0 : t < tSlot ? (Math.floor((t - tDist) * 2.2) % 2) : 0.5 + 0.5 * Math.sin(t * 7);
    slot.setLights(hotK, t);
    sKey.color.setRGB(lerp(1.0, 0.6, hotK), lerp(0.62, 0.75, hotK), lerp(0.55, 1.0, hotK));

    // ---- DARVO: labels swap on "apologizing"
    const sw = E.inOutCubic(prog(t, tApol - 0.1, tApol + 0.6));
    const ang = sw * Math.PI;
    lv.position.set(-0.72 * Math.cos(ang), 2.3 + Math.sin(ang) * 0.55, Math.sin(ang) * 0.35);
    lo.position.set(0.72 * Math.cos(ang), 2.3 - Math.sin(ang) * 0.25, -Math.sin(ang) * 0.35);
    lv.material.opacity = lo.material.opacity = 1 - E.outCubic(prog(t, dvTimes[0] - 0.4, dvTimes[0] - 0.1));
    pa.pose({ sad: lerp(0.1, 0.6, sw) }); pb.pose({ sad: 0.0, lookUp: 0.1 });

    // ---- camera
    if (isPup(t)) camPup(t);
    else if (isCan(t)) camCan(t);
    else if (isDoor(t)) camDoor(t);
    else if (isSlot(t)) camSlot(t);
    else camDv(t);
    camera.position.x += vnoise(t * 0.6, 7) * 0.03; camera.position.y += vnoise(t * 0.5, 8) * 0.025;
    renderer.render(scene, camera);

    // ---- 2D
    put(kick, { x: 540, y: 270, o: vis(t, -1, tb.n1.start + 0.1, 0.01, 0.25) });
    hookHead(t, -1, tb.n1.start + 0.1);
    ['n1', 'n2', 'n3', 'n4', 'n5'].forEach((id, i) => chapters[i](t, tb[id].start - 0.02, tb[id].end + 0.42));
    bars1(t, tTwice - 0.5, tTwice, tb.t1.end + 0.2);
    debt(t, tDebt - 0.05, tb.t1b.end + 0.25);
    mentor(t, W('t3', 'counsel') - 0.05, tRef - 0.15);
    refused(t, tRef - 0.05, tb.t3.end + 0.3);
    unpred(t, W('t4', 'unpredictable') - 0.05, tSlot - 0.3);
    truth(t, tb.close.start, tScript - 0.3);
    bars2(t, tSev - 0.3, t76, tb.t2b.end + 0.25);
    bars3(t, tS17 - 0.25, tFifty, tb.t3b.end + 0.25);
    // bars3: the "B" bar is the 50% after-no; the direct-ask 17% shows first as A
    const hc = vis(t, tKind - 0.05, W('t4', 'unpredictable') - 0.15, 0.05, 0.2);
    put(hotcold, { x: 540, y: 520, o: hc });
    if (hc > 0) {
      const cold = t >= tDist - 0.05;
      hotcold.textContent = cold ? T.distant : T.kind;
      hotcold.style.color = cold ? '#5AA2FF' : '#FF5A5A';
      hotcold.style.textShadow = `0 0 50px ${cold ? 'rgba(90,162,255,.55)' : 'rgba(255,90,90,.55)'}`;
    }
    darvo(t, dvTimes, tb.t5b.end + 0.3);
    defense(t, tScript - 0.1, tb.close.end + 0.15);
    end(t, tb.cta.start + 0.05, END, W('cta', 'Which'));
    srcs[0](t, tb.t1.start + 0.3, tb.t1b.end); srcs[1](t, tb.t2.start + 0.3, tb.t2b.end); srcs[2](t, tb.t3.start + 0.3, tb.t3b.end);
    srcs[3](t, tb.t4.start + 0.3, tb.t4b.end); srcs[4](t, tb.t5b.start, tb.t5b.end);
    const dk = Math.max(
      ...['n1', 'n2', 'n3', 'n4', 'n5'].map((id) => vis(t, tb[id].start - 0.02, tb[id].end + 0.42, 0.01, 0.2) * 0.45),
      vis(t, tb.close.start, tb.close.end, 0.2, 0.2) * 0.25,
      vis(t, tb.cta.start, END, 0.3, 0.1) * 0.5,
    );
    dark.style.opacity = String(dk); dark.style.display = dk > 0.002 ? '' : 'none';
  });
}
