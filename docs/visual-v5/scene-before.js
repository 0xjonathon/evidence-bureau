import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createEquipment,SCAN_SHEET,SCAN_SCALE} from './equipment.js';
import {createAgentDisplay} from './agent-screen.js';
import {span, SequenceClock, paperOwner} from './motion.js';
import {buildDetective, poseDetective, buildViewer, poseViewer, installCharacterAssets} from './rig.js';
import {pose as clipPose, mixPose, life, sequencePlan, composePose, CLIPS} from './clips.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const vec = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const up = vec(0, 1, 0);
const blend = (a, b, t) => a.clone().lerp(b, t);
const noopOffice = {setState() {}, toggleLamp() { return false; }, playSequence() { return Promise.resolve(); }, playResult() { return Promise.resolve(); }, skipSequence() {}, setClaim() {}, setReport() {}, setProgress() {}, beginInvestigation() {}, dispose() {}};

// Everything the detective can physically reach lives near these world points (checked by probe + tests).
const DET_POS = vec(0, 1.56, -0.75), DET_SCALE = 0.8;
const PAPER_DESK = vec(0, 1.615, 0.02);       // sheet lying in front of him
const PAPER_STATION = vec(0.12, 1.625, 0.0);  // where reports are stamped
const PAPER_SHARED = vec(0, 2.12, 0.22);      // hand-over point, within his reach and the visitor's
const PRINTER_OUT = vec(-1.52, 1.89, 0.10);
const STAMP_REST = vec(0.80, 1.66, 0.25);
const STAMP_POINT = vec(PAPER_STATION.x + 0.29, 1.66, PAPER_STATION.z + 0.155);

export async function createOffice(container, onReady, onObject) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: 'high-performance'}); } catch { document.body.classList.add('no-webgl'); onReady(false); return noopOffice; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  container.append(renderer.domElement);
  // The visitor's own hands render in a second, transparent canvas so they can sit above page UI (the button they press).
  const handsRenderer = new THREE.WebGLRenderer({alpha: true, antialias: true, powerPreference: 'high-performance'});
  handsRenderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); handsRenderer.outputColorSpace = THREE.SRGBColorSpace;
  handsRenderer.toneMapping = THREE.ACESFilmicToneMapping; handsRenderer.toneMappingExposure = 1.08; handsRenderer.setClearColor(0, 0);
  handsRenderer.domElement.className = 'first-person-viewmodel'; handsRenderer.domElement.setAttribute('aria-hidden', 'true'); document.body.append(handsRenderer.domElement);
  const handScene = new THREE.Scene();
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#14241f'); scene.fog = new THREE.FogExp2('#14241f', .015);
  const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, .08, 70);
  const base = vec(0, 3.10, 6.5), look = vec(0, 2.25, -.25);
  scene.add(new THREE.HemisphereLight('#e5e9df', '#233129', 1.65));
  const key = new THREE.DirectionalLight('#ffe5c5', 2.5); key.position.set(-3, 6, 5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, {left: -6, right: 6, top: 6, bottom: -4}); key.shadow.normalBias = .025; scene.add(key);
  const rim = new THREE.DirectionalLight('#8eb7cf', 1.3); rim.position.set(3, 4, -3); scene.add(rim);
  const fill = new THREE.PointLight('#d9e9df', 6, 12); fill.position.set(1, 4, 4); scene.add(fill);
  const practical = new THREE.PointLight('#ffc77a', 5, 4, 1.4); practical.position.set(-2.05, 2.43, .45); scene.add(practical);
  handScene.add(new THREE.HemisphereLight('#e5e9df', '#233129', 1.65));
  const handKey = new THREE.DirectionalLight('#ffe5c5', 2.5); handKey.position.copy(key.position); handScene.add(handKey);
  const handFill = new THREE.DirectionalLight('#8eb7cf', 1); handFill.position.set(3, 4, -3); handScene.add(handFill);

  let room;
  try {
    room = (await new GLTFLoader().loadAsync('/assets/bureau-room-v3.glb?v=3.4')).scene;
    scene.add(room);const staticReceipt=room.getObjectByName('PrinterReceipt');if(staticReceipt)staticReceipt.visible=false; room.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  } catch (error) {
    console.warn('Office assets unavailable', error); document.body.classList.add('no-webgl');
    renderer.dispose(); renderer.domElement.remove(); handsRenderer.dispose(); handsRenderer.domElement.remove(); onReady(false); return noopOffice;
  }
  // Authored anime meshes, continuous skinning and hand-authored animation clips.
  try{
  const characterLoader=new GLTFLoader();
  const [character,handSurface]=await Promise.all([characterLoader.loadAsync('/assets/anime-detective-v4.glb?v=4.1'),fetch('/assets/seamless-hand-v4.json?v=4').then(r=>{if(!r.ok)throw Error('Hand surface unavailable');return r.json();})]);
  installCharacterAssets(character.scene,handSurface);
  }catch(error){console.warn('Character assets unavailable',error);document.body.classList.add('no-webgl');renderer.dispose();renderer.domElement.remove();handsRenderer.dispose();handsRenderer.domElement.remove();onReady(false);return noopOffice;}
  const det = buildDetective(); det.root.name = 'Detective'; det.root.scale.setScalar(DET_SCALE); scene.add(det.root);
  const viewer = buildViewer(); handScene.add(viewer.group);
  det.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });det.head.traverse(o=>{o.castShadow=false;});

  const monitor = room.getObjectByName('Monitor'), swivel = new THREE.Group(); swivel.position.set(1.9, 2.35, -.38); scene.add(swivel); swivel.attach(monitor);
  const display = createAgentDisplay(monitor, swivel);
  const equipment=createEquipment(scene,room);equipment.screen.material.map=display.texture;
  container.dataset.workstation='detective-facing';container.dataset.progressDisplay='independent';
  const stamp = new THREE.Group(); stamp.position.set(.92, 1.62, .77); scene.add(stamp); room.updateMatrixWorld(true);
  for (const o of [...room.children]) if (o.name.replace(/[^a-z]/gi, '').toLowerCase().startsWith('rubberstamp')) stamp.attach(o);
  const pen = new THREE.Mesh(new THREE.CylinderGeometry(.012, .008, .23, 12), new THREE.MeshStandardMaterial({color: '#9d3f2d', roughness: .42})); scene.add(pen); pen.visible = false;
  const paperCanvas = document.createElement('canvas'); paperCanvas.width = 1024; paperCanvas.height = 768;
  const ctx = paperCanvas.getContext('2d'), paperTexture = new THREE.CanvasTexture(paperCanvas); paperTexture.colorSpace = THREE.SRGBColorSpace; paperTexture.anisotropy = 4;
  const paperGeometry = new THREE.PlaneGeometry(1.1, .79, 18, 12), paper = new THREE.Mesh(paperGeometry, new THREE.MeshStandardMaterial({map: paperTexture, side: THREE.DoubleSide, roughness: .94}));
  scene.add(paper); paper.visible = false;
  const ring = new THREE.Mesh(new THREE.RingGeometry(.025, .032, 48), new THREE.MeshBasicMaterial({color: '#b5f7d4', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false})); scene.add(ring);
  const impactRing = new THREE.Mesh(new THREE.RingGeometry(.11, .125, 48), new THREE.MeshBasicMaterial({color: '#e7d6ac', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false})); impactRing.rotation.x = -Math.PI / 2; scene.add(impactRing);
  const glow = new THREE.PointLight('#b5f5d2', 0, 2); scene.add(glow);
  const paperDOM = document.querySelector('#paperStage'), panel = document.querySelector('#investigationPanel'), projection = document.querySelector('#projectionLink');
  let state = 'greet', seq = null, report = null, claim = '', images = [], imageVersion = 0, lastMark = -1, marked = false, lampOn = true, clock = 0, last = performance.now(), raf, running = true, disposed = false;
  let curPose = clipPose('idle', 0);
  const DESK_SCALE = vec(0.8, 0.8, 1);
  const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const offered = new THREE.Quaternion().setFromEuler(new THREE.Euler(-.60, 0, 0));
  const GRIP_DROP = 0.055;     // the sheet hangs this far below the hands that hold it
  const STAMP_GRIP = 0.43;     // palm rests this far above the stamp's origin
  const PEN_DROP = 0.10;       // pen tip is this far below the hand
  const HAND_DESK_Y = 1.656, HAND_SHARED_Y = 2.232;   // world height of the pickup / hand-over poses (for the tilt blend)
  det.root.position.copy(DET_POS); det.root.updateMatrixWorld(true);
  const toWorld = p => det.root.localToWorld(vec(p[0], p[1], p[2]));

  function drawPaper(mark = 0) {
    ctx.fillStyle = '#efe6ce'; ctx.fillRect(0, 0, 1024, 768); ctx.strokeStyle = '#768373'; ctx.lineWidth = 2; ctx.strokeRect(26, 26, 972, 716);
    ctx.fillStyle = '#425749'; ctx.font = '16px monospace'; ctx.fillText(report ? 'THE EVIDENCE BUREAU / CASE REPORT' : 'THE EVIDENCE BUREAU / PRIVATE & CONFIDENTIAL', 60, 68);
    ctx.font = 'bold 44px serif'; ctx.fillText(report ? '有据调查报告' : '调查委托单', 60, 140); ctx.fillRect(60, 166, 904, 3); ctx.font = '24px serif';
    const text = claim || '请在接过委托单后写下待查证的说法。';
    for (let i = 0; i < Math.min(text.length, 150); i += 31) ctx.fillText(text.slice(i, i + 31), 60, 225 + (i / 31) * 45);
    ctx.lineWidth = 1; ctx.strokeStyle = '#bcc2af'; for (let y = 280; y < 650; y += 55) { ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(964, y); ctx.stroke(); }
    images.slice(0, 6).forEach((img, i) => { ctx.save(); const x = 70 + (i % 3) * 130, y = 510 + Math.floor(i / 3) * 90; ctx.translate(x, y); ctx.rotate((i % 2 ? 1 : -1) * .04); ctx.fillStyle = '#fffcf0'; ctx.fillRect(-5, -5, 118, 80); ctx.drawImage(img, 0, 0, 108, 67); ctx.restore(); });
    if(report){
      ctx.fillStyle='#efe6ce';ctx.fillRect(50,186,925,478);ctx.fillStyle='#354f3d';ctx.font='bold 30px serif';ctx.fillText(({supported:'现有证据支持',refuted:'现有证据反驳',mixed:'结论有条件 / 存在冲突',unknown:'证据不足 / 无法判断'}[report.verdict]||'调查报告'),60,222);
      ctx.font='24px serif';for(let i=0;i<Math.min(claim.length,62);i+=31)ctx.fillText(claim.slice(i,i+31),60,272+Math.floor(i/31)*36);
      ctx.font='22px serif';const summary=report.summary||'';for(let i=0;i<Math.min(summary.length,135);i+=27)ctx.fillText(summary.slice(i,i+27),60,372+Math.floor(i/27)*37);
      ctx.font='17px monospace';(report.sources||[]).slice(0,2).forEach((source,i)=>{let host='';try{host=new URL(source.url).host;}catch{}ctx.fillText('['+source.id+'] '+host,60,604+i*27);});
      ctx.font='15px serif';ctx.fillStyle='#6c7d64';ctx.fillText(report.mode==='demo'?'离线示例 · 非实时调查':'完整来源、证据边界与复核记录，请在接过报告后查看。',60,665);
    }
    if (report) {
      ctx.font = '16px monospace'; ctx.fillStyle = '#61715e'; ctx.fillText(report.id, 60, 704);
      if (mark > 0 && report.verdict === 'supported') {
        ctx.save(); ctx.translate(780, 535); ctx.rotate(-.13); ctx.strokeStyle = '#326448'; ctx.fillStyle = '#326448'; ctx.lineWidth = 5;
        [91, 82].forEach(r => { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); });
        ctx.font = 'bold 42px serif'; ctx.textAlign = 'center'; ctx.fillText('有 据', 0, 12); ctx.font = '12px monospace'; ctx.fillText('EVIDENCE VERIFIED', 0, 45); ctx.restore();
      } else if (mark > 0 && report.verdict === 'refuted') {
        ctx.save(); ctx.strokeStyle = '#a13d2f'; ctx.lineCap = 'round'; ctx.lineWidth = 13; ctx.beginPath();
        const a = Math.min(mark * 2, 1), b = Math.max(0, (mark - .5) * 2);
        ctx.moveTo(690, 447); ctx.lineTo(690 + 170 * a, 447 + 155 * a); if (b) { ctx.moveTo(860, 447); ctx.lineTo(860 - 170 * b, 447 + 155 * b); } ctx.stroke(); ctx.restore();
      }
    }
    paperTexture.needsUpdate = true;
  }
  function setClaim(text, urls = []) {
    claim = text || ''; report = null; images = []; marked = false; lastMark = -1; const version = ++imageVersion; drawPaper();
    (Array.isArray(urls) ? urls : urls ? [urls] : []).forEach((url, i) => { const img = new Image(); img.onload = () => { if (version === imageVersion) { images[i] = img; drawPaper(marked ? 1 : 0); } }; img.src = url; });
  }
  drawPaper();
  function setReport(value) { report = value; claim = value.claim; marked = false; lastMark = -1; drawPaper(); }
  function screenPoint(x, y, distance = 1.45) { const dir = vec(x / innerWidth * 2 - 1, -y / innerHeight * 2 + 1, .5).unproject(camera).sub(camera.position).normalize(); return camera.position.clone().addScaledVector(dir, distance); }
  function heldPaperPose() {
    const r = paperDOM.getBoundingClientRect(), w = r.width || Math.min(470, innerWidth * .8), h = r.height || 340;
    const x = r.width ? r.left + r.width / 2 : innerWidth / 2, y = r.height ? r.top + r.height / 2 : innerHeight * .68;
    const center = screenPoint(x, y, 1.45), left = screenPoint(x - w / 2 - 9, y + h * .34, 1.45), right = screenPoint(x + w / 2 + 9, y + h * .34, 1.45);
    const height = 2 * 1.45 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return {center, left, right, q: camera.quaternion.clone(), scale: vec(w / innerHeight * height / 1.1, h / innerHeight * height / .79, 1)};
  }
  function setPaper(position, q, scale = vec(1, 1, 1)) { paper.position.copy(position); paper.quaternion.copy(q); paper.scale.copy(scale); }
  // Lower corners of the sheet: where the visitor's hands take hold (the detective holds the mid-sides).
  function paperCorners() { paper.updateMatrixWorld(true); return {left: paper.localToWorld(vec(-.53, -.29, -.012)), right: paper.localToWorld(vec(.53, -.29, -.012))}; }
  function setOwner(owner) { paper.userData.owner = owner; container.dataset.paperOwner = owner; }

  // Sheet pose derived from where the detective's hands actually are: he holds it, so it moves with him.
  function followHands(p) {
    const l = toWorld(p.l), r = toWorld(p.r), mid = l.clone().add(r).multiplyScalar(.5);
    const tilt = THREE.MathUtils.clamp((mid.y - HAND_DESK_Y) / (HAND_SHARED_Y - HAND_DESK_Y), 0, 1);
    return {position: vec(mid.x, Math.max(1.628,mid.y - GRIP_DROP), mid.z-.20*tilt), q: flat.clone().slerp(offered, tilt), scale: DESK_SCALE};
  }


    function playSequence(name, onCue = () => {}, options = {}) {
    if (disposed) return Promise.resolve();
    if (seq) completeSequence();
    if (name === 'onboard') { report = null; drawPaper(); }
    state = 'sequence'; paper.visible = true; setOwner(name === 'submit' ? 'visitor' : 'detective');
    return new Promise(resolve => {
      seq = {name,startPose:curPose,touch: options.touch || null, started: performance.now(), skip: false, resolve,
        clock: new SequenceClock(name, cue => { container.dataset.cue = cue; onCue(cue); })};
    });
  }
  function completeSequence() {
    if (!seq) return;
    const s = seq; seq = null;
    state = s.name === 'submit' ? 'ready' : s.name === 'result' ? 'holding-report' : 'writing';
    container.dataset.sequence = 'complete'; s.resolve();
  }
  function setState(next) {
    if (seq) return;
    state = ['idle', 'supported', 'refuted', 'mixed', 'unknown'].includes(next) ? 'writing' : next;
    container.setAttribute('aria-label', next === 'search' ? '侦探正在调查，电脑与浮影终端同步显示进度' : '有据侦探事务所三维场景');
  }
  function toggleLamp() { lampOn = !lampOn; practical.visible = lampOn; return lampOn; }

  function resize() {
    const w = innerWidth, h = innerHeight; renderer.setSize(w, h); handsRenderer.setSize(w, h);
    camera.aspect = w / h; camera.fov = w < 800 ? 49 : 46; camera.updateProjectionMatrix();
    base.set(0, w < 800 ? 3.0 : 3.1, w < 800 ? 7.2 : 6.5); look.set(0, w < 800 ? 2.0 : 2.25, -.25);
  }
  resize(); window.addEventListener('resize', resize);
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  function objectClick(e) {
    if (e.target !== renderer.domElement) return;
    mouse.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects([room, det.root], true)[0]; if (!hit) return;
    let o = hit.object;
    while (o) {
      if (/Lamp/.test(o.name)) { onObject('lamp'); return; }
      if (/Monitor|CRT/.test(o.name)) { onObject('monitor'); return; }
      if (/Detective/.test(o.name)) { onObject('detective'); return; }
      o = o.parent;
    }
  }
  container.addEventListener('click', objectClick);
  function projectTerminal() {
    const anchor = display.mesh.getWorldPosition(vec()).project(camera), x = (anchor.x * .5 + .5) * innerWidth, y = (-anchor.y * .5 + .5) * innerHeight;
    if (state !== 'search') return;
    const mobile = innerWidth < 800, w = mobile ? innerWidth * .90 : Math.min(510, innerWidth * .4);
    const left = mobile ? innerWidth * .05 : Math.max(innerWidth * .51, Math.min(x - w * .22, innerWidth - w - 36)), top = mobile ? Math.max(280, innerHeight - 460) : Math.max(104, y - 410);
    Object.assign(panel.style, {left: left + 'px', top: top + 'px', width: w + 'px'});
    panel.style.setProperty('--origin-x', (x - left) + 'px'); panel.style.setProperty('--origin-y', (y - top) + 'px');
    const r = panel.getBoundingClientRect(), yy = y < r.top ? r.top : r.bottom;
    projection.querySelector('.projection-beam').setAttribute('d', `M${x - 25} ${y} L${r.left + 30} ${yy} L${r.right - 30} ${yy} L${x + 25} ${y} Z`);
    projection.querySelector('.projection-wire').setAttribute('d', `M${x} ${y} L${r.left + 30} ${yy}`);
    const dot = projection.querySelector('circle'); dot.setAttribute('cx', x); dot.setAttribute('cy', y);
  }

  // ---- per-frame ----------------------------------------------------------------------------
  const camRightV = vec(), camUpV = vec(), camFwdV = vec();
  function render(now) {
    if (!running) return; raf = requestAnimationFrame(render);
    if (now - last < 1000 / (reduced ? 24 : 40)) return;
    const dt = Math.min((now - last) / 1000, .08); last = now; clock += dt;
    const active = seq; let t = active ? (active.skip || reduced ? active.clock.duration : (now - active.started) / 1000) : 0;
    if (active) t = Math.min(t, active.clock.duration);
    container.dataset.sequence = active ? active.name : state;

    // camera
    let lean = 0;
    if (active?.name === 'onboard') lean = span(t, 1.30, 2.6) * (1 - span(t, 3.55, 5.3));
    if (active?.name === 'submit') lean = span(t, .25, 1.4) * (1 - span(t, 2.05, 3.3));
    if (active?.name === 'return') lean = span(t, .1, 1.5) * (1 - span(t, 2.35, 4));
    if (active?.name === 'result') lean = span(t, 3.35, 4.6) * (1 - span(t, 5.3, 6.5));
    const cinematic = active?.name === 'result' ? span(t, .1, .8) * (1 - span(t, 3.2, 4.3)) : 0;
    camera.position.copy(base); camera.position.z = THREE.MathUtils.lerp(base.z, innerWidth < 800 ? 2.9 : 2.35, lean) - cinematic * .45; camera.position.y = THREE.MathUtils.lerp(base.y, 2.90, lean);
    const fov = (innerWidth < 800 ? 49 : 46) + lean * (innerWidth < 800 ? 18 : 7);
    if (Math.abs(camera.fov - fov) > .01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.lookAt(state === 'search' ? (innerWidth < 800 ? 1.05 : .18) : 0, look.y + lean * .20, look.z + lean * .7); camera.updateMatrixWorld(true);
    camera.getWorldDirection(camFwdV); camUpV.copy(up).applyQuaternion(camera.quaternion).normalize(); camRightV.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();

    // defaults
    const verdict = report?.verdict;
    paper.visible = !!active || state === 'ready' || state === 'search' || state === 'holding-report';
    paper.scale.set(1, 1, 1); pen.visible = false; ring.visible = false; glow.intensity = 0; impactRing.visible = false;
    stamp.position.copy(STAMP_REST); stamp.rotation.set(0, 0, 0);
    if (state === 'ready' || state === 'search') { paper.visible=false; setOwner('scanner'); }
    const hold = heldPaperPose();
    if (state === 'holding-report') { setPaper(hold.center, hold.q, hold.scale); setOwner('visitor'); }

    // detective pose
    let p, targets = {},toolGrip=null;
    const ambient = clipPose(state === 'search' ? 'type' : 'idle', clock);
    if(state==='search'){ambient.l=[.40,.2875+Math.sin(clock*15)*.005,.525];ambient.r=[1.05,.2875+Math.sin(clock*17+1)*.005,.525];ambient.headY=.55;ambient.headX=.28;}
    curPose = mixPose(curPose, ambient, Math.min(1, dt * 6));
    p = curPose;
    let visitorVisible = state === 'writing' || state === 'idle' || state === 'holding-report' || !!active;
    let vTargets = null, vCurl = {l: .55, r: .55}, vPoint = false, vTip = null;
    if (active) {
      const plan = sequencePlan(active.name, verdict);
      p = composePose(plan, t, curPose);
      const lw = () => toWorld(p.l), rw = () => toWorld(p.r);
      const grip = () => followHands(p);
      if (active.name === 'onboard') {
        if (t < 1.3) {
          const button = document.querySelector('#startCaseBtn').getBoundingClientRect();
          if (!active.touch) active.touch = {x: button.left + button.width * .55, y: button.top + button.height * .50};
          const touch = screenPoint(active.touch.x, active.touch.y, 1.65), reach = span(t, .05, .72) * (1 - span(t, .88, 1.3));
          const rest = screenPoint(innerWidth * .78, innerHeight * 1.13, 1.65);
          vTargets = {r: blend(rest, touch.clone().addScaledVector(camFwdV, -.23), reach), l: screenPoint(innerWidth * .15, innerHeight * 1.2, 1.2)};
          vTip = blend(rest.clone().addScaledVector(camFwdV, .23), touch, reach); vPoint = true; vCurl = {l: .7, r: .7};
          if (t > .69 && t < 1.12) { ring.visible = true; ring.position.copy(touch); ring.quaternion.copy(camera.quaternion); ring.scale.setScalar(1 + span(t, .69, 1.12) * 4); ring.material.opacity = 1 - span(t, .69, 1.12); glow.position.copy(touch); glow.intensity = 1.2; }
          paper.visible = false;
        } else if (t < 3.15) { const g = grip(); setPaper(g.position, g.q, g.scale); setOwner('detective');const c=paperCorners(),u=span(t,2.5,3.15);vTargets={l:blend(screenPoint(innerWidth*.17,innerHeight*1.2,1.4),c.left,u),r:blend(screenPoint(innerWidth*.83,innerHeight*1.2,1.4),c.right,u)};}
        else { const start=followHands(composePose(sequencePlan('onboard'),3.15,curPose));setPaper(start.position,start.q,start.scale);const c = paperCorners(); const k = span(t, 3.5, 5.35); setPaper(blend(start.position, hold.center, k), start.q.clone().slerp(hold.q, k), blend(DESK_SCALE, hold.scale, k)); vTargets = {l: blend(c.left, hold.left, k), r: blend(c.right, hold.right, k)}; setOwner(paperOwner('onboard', t)); }
      }
      if (active.name === 'submit') {
        if (t < 1.6) { setPaper(blend(hold.center, PAPER_SHARED, span(t, .15, 1.6)), hold.q.clone().slerp(offered, span(t, .15, 1.6)), blend(hold.scale, DESK_SCALE, span(t, .15, 1.6))); vTargets={l:paperCorners().left,r:paperCorners().right}; setOwner('visitor'); }
        else if (t < 2.95) { const g=followHands(composePose(sequencePlan('submit'),1.6,curPose));const u=span(t,1.9,2.95);const lift=blend(g.position,SCAN_SHEET,u);lift.y+=Math.sin(u*Math.PI)*.13;setPaper(lift,g.q.clone().slerp(flat,u),blend(g.scale,SCAN_SCALE,u)); const c = paperCorners(); vTargets = {l: blend(c.left, screenPoint(innerWidth * .18, innerHeight * 1.25, 1.4), span(t, 1.95, 2.8)), r: blend(c.right, screenPoint(innerWidth * .82, innerHeight * 1.25, 1.4), span(t, 1.95, 2.8))}; vCurl = {l: .3, r: .3}; setOwner(paperOwner('submit', t)); }
        else { setPaper(SCAN_SHEET, flat, SCAN_SCALE); visitorVisible = true; vTargets = {l: screenPoint(innerWidth * .18, innerHeight * 1.25, 1.4), r: screenPoint(innerWidth * .82, innerHeight * 1.25, 1.4)}; setOwner('scanner'); }
      }
      if (active.name === 'return') {
        if (t < 2.0) {const g=grip(),take=span(t,.35,1.25),position=blend(SCAN_SHEET,g.position,take);position.y+=Math.sin(take*Math.PI)*.12;setPaper(position,flat.clone().slerp(g.q,take),blend(SCAN_SCALE,g.scale,take));const c=paperCorners(),u=span(t,1.2,2);vTargets={l:blend(screenPoint(innerWidth*.17,innerHeight*1.2,1.4),c.left,u),r:blend(screenPoint(innerWidth*.83,innerHeight*1.2,1.4),c.right,u)};setOwner(paperOwner('return',t));}
        else { const start=followHands(composePose(sequencePlan('return'),2,curPose));setPaper(start.position,start.q,start.scale);const c = paperCorners(), k = span(t, 2.3, 3.95); setPaper(blend(start.position, hold.center, k), start.q.clone().slerp(hold.q, k), blend(DESK_SCALE, hold.scale, k)); vTargets = {l: blend(c.left, hold.left, k), r: blend(c.right, hold.right, k)}; setOwner(paperOwner('return', t)); }
      }
      if (active.name === 'result') {
        const conclusive = verdict === 'supported' || verdict === 'refuted';
        vTargets = {l: screenPoint(innerWidth * .12, innerHeight * 1.25, 1.4), r: screenPoint(innerWidth * .88, innerHeight * 1.25, 1.4)}; vCurl = {l: .3, r: .3};
        if (t < 1.2) {const u=span(t,.1,1.1);setPaper(PRINTER_OUT.clone().add(vec(0,0,-.35*(1-u))),flat,DESK_SCALE);setOwner('printer');targets.l=PRINTER_OUT.clone().add(vec(.35,.05,0));}
        else if (t < 3.55) {const u=span(t,1.2,1.85),dest=verdict==='supported'?PAPER_STATION:PAPER_DESK,pos=blend(PRINTER_OUT,dest,u);pos.y+=Math.sin(u*Math.PI)*.22;setPaper(pos,flat,DESK_SCALE);setOwner(t<1.85?'detective':'desk');if(t<1.85)targets.l=pos.clone().add(vec(.35,.06,0));}
        if(verdict==='supported'&&t>.6&&t<3.4){
          const u=span(t,1.05,1.85),back=span(t,2.55,3.15);
          const pressed=STAMP_POINT.clone();const carrying=blend(STAMP_REST,pressed,u);carrying.y+=Math.sin(u*Math.PI)*.22;
          const lift=span(t,1.85,2.12)*(1-span(t,2.22,2.35))*.17;
          carrying.y+=lift;stamp.position.copy(blend(carrying,STAMP_REST,back));stamp.position.y+=Math.sin(back*Math.PI)*.22;
          const contact=stamp.position.clone().addScaledVector(up,.29);targets.r=blend(rw(),contact,span(t,.6,1.05)*(1-span(t,3.15,3.4)));if(t>=1.05&&t<=3.15)toolGrip={position:det.root.worldToLocal(contact.clone()),forward:vec(0,-1,0),normal:vec(0,0,1)};
          if(t>=2.35&&!marked){marked=true;drawPaper(1);container.setAttribute('aria-label','侦探已在报告上盖章');}
          const pulse=(t-2.35)/.55;if(pulse>0&&pulse<1&&!reduced){impactRing.visible=true;impactRing.position.copy(STAMP_POINT);impactRing.position.y=1.63;impactRing.scale.setScalar(1+pulse*5);impactRing.material.opacity=(1-pulse)*.45;}
        }
        if (verdict === 'refuted' && t > .5 && t < 3.0) {
          const a=span(t,1.5,2.05),b=span(t,2.5,3.0),px=t<2.2?690+170*a:860-170*b,py=447+155*(t<2.2?a:b);
          const tip=paper.localToWorld(vec((px/1024-.5)*1.1,(.5-py/768)*.79,.012));const lift=(t<1.5?(1-span(t,.9,1.5))*.12:t>2.05&&t<2.5?Math.sin(span(t,2.05,2.5)*Math.PI)*.10:0);tip.y+=lift;
          const axis=vec(.25,1,-.1).normalize();pen.visible=true;pen.position.copy(tip).addScaledVector(axis,.115);pen.quaternion.setFromUnitVectors(up,axis);
          const contact=tip.clone().addScaledVector(axis,.18);targets.r=contact;toolGrip={position:det.root.worldToLocal(contact.clone()),forward:axis.clone().negate(),normal:vec(0,0,1)};
          const aa = span(t, 1.5, 2.05), bb = span(t, 2.5, 3.0), amount = Math.min(1, aa * .5 + bb * .5); const step = Math.floor(amount * 28);
          if (step !== lastMark) { lastMark = step; drawPaper(amount); } if (amount >= .999 && !marked) { marked = true; container.setAttribute('aria-label', '侦探已在报告上画叉'); }
        }
        if (t >= 3.55 && t < 5.25) { const g = grip(),u=span(t,3.7,4.1);setPaper(blend(verdict==='supported'?PAPER_STATION:PAPER_DESK,g.position,u),flat.clone().slerp(g.q,u),g.scale); setOwner('detective'); }
        if (t >= 4.5) {const start=followHands(composePose(sequencePlan('result',verdict),5.0,curPose));if(t>=5.25)setPaper(start.position,start.q,start.scale);const c = paperCorners(), k = span(t, 5.25, 6.45); setPaper(blend(t<5.25?paper.position:start.position, hold.center, k), (t<5.25?paper.quaternion:start.q).clone().slerp(hold.q, k), blend(DESK_SCALE, hold.scale, k)); vTargets=t<5.25?{l:blend(screenPoint(innerWidth*.17,innerHeight*1.2,1.4),c.left,span(t,4.35,5)),r:blend(screenPoint(innerWidth*.83,innerHeight*1.2,1.4),c.right,span(t,4.35,5))}:{l:blend(c.left,hold.left,k),r:blend(c.right,hold.right,k)}; setOwner(paperOwner('result', t)); }
      }
    } else if (visitorVisible){vTargets = {l: hold.left, r: hold.right};if(state!=='holding-report')setPaper(hold.center,hold.q,hold.scale);}

    equipment.update(t,active?.name==='submit');if(active?.name==='return')equipment.lid.rotation.x=-1.15*span(t,.02,.32)*(1-span(t,1.0,1.6));container.dataset.scanProgress=active?.name==='submit'?String(Math.round(span(t,3.7,5.1)*100)):'0';
    // Grip contact is derived from the actual sheet transform, not an unrelated clip target.
    let detectiveGrips=null;
    if(active&&paper.visible&&paper.userData.owner!=='printer'&&((active.name==='submit'&&t>=1.6&&t<2.98)||(active.name==='onboard'&&t>=1.3&&t<3.5)||(active.name==='return'&&t<2.3)||(active.name==='result'&&t>=3.55&&t<5.25))){
      paper.updateMatrixWorld(true);detectiveGrips={};for(const [k,x]of [['l',-.52],['r',.52]])detectiveGrips[k]={position:det.root.worldToLocal(paper.localToWorld(vec(x,-.02,-.012))),forward:vec(0,1,0).applyQuaternion(paper.quaternion),normal:vec(0,0,1).applyQuaternion(paper.quaternion)};
    }
    if(active?.name==='return'&&detectiveGrips&&t<.35)for(const k of ['l','r'])detectiveGrips[k].position.lerpVectors(vec(...active.startPose[k]),detectiveGrips[k].position,span(t,0,.35));
    if(state==='search')detectiveGrips={l:{position:vec(...p.l),forward:vec(0,0,1),normal:up},r:{position:vec(...p.r),forward:vec(0,0,1),normal:up}};
    if(toolGrip){detectiveGrips={r:toolGrip};}
    for(const k of ['l','r'])if(targets[k])targets[k]=det.root.worldToLocal(targets[k].clone());
    const diag = poseDetective(det, p, life(clock), targets,detectiveGrips);
    if(state==='search')for(const [side,arm]of Object.entries(det.arms))arm.hand.chains.slice(0,4).forEach((chain,f)=>chain.forEach((bone,j)=>{const tap=(1+Math.sin(clock*14+f*1.9+(side==='l'?0:2)))*.5;bone.rotation.x=-(j===0?.08:j===1?.10:.06)-tap*(j===0?.12:j===1?.18:.08);}));
    container.dataset.reachMiss = diag.miss.toFixed(4); container.dataset.bodyHits = diag.hits.length;
    det.root.position.copy(DET_POS); det.root.scale.setScalar(DET_SCALE);
    const lookT = 0; void lookT;

    // visitor arms follow the camera frame
    viewer.group.visible = visitorVisible && !!vTargets;
    if (viewer.group.visible) {
      viewer.group.position.copy(camera.position).addScaledVector(camUpV, -.02).addScaledVector(camFwdV,innerWidth<800?lean*.42:0); viewer.group.quaternion.copy(camera.quaternion);
      const miss = poseViewer(viewer, vTargets, vCurl, vPoint, vTip, (paper.visible||state==='writing'||state==='idle')?{forward:vec(0,1,0).applyQuaternion(paper.quaternion),normal:vec(0,0,1).applyQuaternion(paper.quaternion)}:null);
      container.dataset.viewerMiss = miss.toFixed(4); if (vTip) container.dataset.uiContactError = viewer.arms.r.hand.tipWorld().distanceTo(vTip).toFixed(4);
    }

    swivel.rotation.y=0;
    display.draw(now, state === 'search'); projectTerminal();
    if (paper.visible) { const positions = paperGeometry.attributes.position; const wave = (active?.name === 'submit' || active?.name === 'onboard') ? 1 : 0; for (let i = 0; i < positions.count; i++) positions.setZ(i, Math.sin(positions.getX(i) * 4) * .008 * wave); positions.needsUpdate = true; }
    renderer.render(scene, camera); handsRenderer.render(handScene, camera);
    if (active && seq === active && active.clock.advance(t)) completeSequence();
  }
  function visibility() { if (document.hidden) { running = false; cancelAnimationFrame(raf); } else if (!running && !disposed) { running = true; last = performance.now(); raf = requestAnimationFrame(render); } }
  document.addEventListener('visibilitychange', visibility); raf = requestAnimationFrame(render); onReady(true);
  return {
    setClaim, setReport, setProgress: e => display.update(e), beginInvestigation: demo => display.begin(demo), playSequence,
    playResult(value, onCue) { setReport(value); return playSequence('result', cue => { if (cue === 'stamp' && value.verdict === 'refuted') cue = 'cross'; if (!['supported', 'refuted'].includes(value.verdict)) { if (cue === 'stamp') return;  } onCue?.(cue); }); },
    skipSequence() { if (seq) seq.skip = true; }, setState, toggleLamp,
    dispose() { disposed = true; running = false; cancelAnimationFrame(raf); if (seq) completeSequence(); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', visibility); container.removeEventListener('click', objectClick); display.dispose(); paperTexture.dispose(); for (const sc of [scene, handScene]) sc.traverse(o => { o.geometry?.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); }); renderer.dispose(); handsRenderer.dispose(); handsRenderer.domElement.remove(); },
  };
}
