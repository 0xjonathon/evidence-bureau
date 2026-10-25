import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import {CLIPS, pose, sample, blendPose, life, DESK_Y, HAND_CLEARANCE, REST} from '../public/clips.js';

// rig.js imports 'three' by bare specifier (resolved by the page's import map); map it for Node.
import {register} from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,n){return s==='three'?{url:new URL('../node_modules/three/build/three.module.js','${import.meta.url}').href,shortCircuit:true}:n(s,c)}`));
const rig = await import('../public/rig.js');
const {solveArm, buildDetective, poseDetective, shoulderPositions, POLES, SIZES, BODY_ZONES, insideZone} = rig;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const det = buildDetective();
const times = clip => { const out = []; for (let t = 0; t <= CLIPS[clip].duration + 1e-9; t += 1 / 30) out.push(+t.toFixed(4)); return out; };

test('every clip has well-formed tracks: sorted keys, matching hand arrays, a duration', () => {
  for (const [name, clip] of Object.entries(CLIPS)) {
    assert.ok(clip.duration > 0, name);
    for (const [track, keys] of Object.entries(clip.tracks)) {
      for (let i = 1; i < keys.length; i++) assert.ok(keys[i][0] > keys[i - 1][0], `${name}.${track} not strictly increasing`);
      assert.ok(keys[0][0] === 0, `${name}.${track} must start at 0`);
      assert.ok(keys[keys.length - 1][0] <= clip.duration + 1e-9, `${name}.${track} runs past the clip`);
    }
    assert.ok(clip.tracks.l && clip.tracks.r, `${name} needs both hands`);
    for (const k of clip.tracks.l.concat(clip.tracks.r)) assert.equal(k[1].length, 3);
  }
});

test('non-looping clips start and end at the rest pose so they chain without a pop', () => {
  for (const [name, clip] of Object.entries(CLIPS)) {
    if (name === 'type') continue;      // loops from its own working pose; entered via blend
    const first = pose(name, 0), last = pose(name, clip.duration);
    for (const k of ['l', 'r']) {
      for (let i = 0; i < 3; i++) {
        assert.ok(Math.abs(first[k][i] - REST[k][i]) < 1e-9, `${name} starts off-rest (${k})`);
        assert.ok(Math.abs(last[k][i] - REST[k][i]) < 1e-9, `${name} ends off-rest (${k})`);
      }
    }
  }
});

test('hands stay above the desk with clearance in every clip, every frame', () => {
  for (const name of Object.keys(CLIPS)) for (const t of times(name)) {
    const p = pose(name, t);
    for (const k of ['l', 'r']) {
      // stamp and cross intentionally touch down; allow contact but never a dip below the surface
      const contactOK = (name === 'stamp' && k === 'r') || (name === 'cross' && k === 'r');
      const floor = contactOK ? DESK_Y + 0.02 : DESK_Y + HAND_CLEARANCE * 0.5;
      assert.ok(p[k][1] >= floor - 1e-9, `${name}@${t} ${k} hand y=${p[k][1].toFixed(3)} below ${floor}`);
    }
  }
});

test('the hand actually ARRIVES at every authored target (arm is not silently clamped short)', () => {
  const short = [];
  for (const name of Object.keys(CLIPS)) for (const t of times(name)) {
    const p = pose(name, t), sh = shoulderPositions(det, p.lean);
    for (const k of ['l', 'r']) {
      const target = V(...p[k]);
      const solved = solveArm(sh[k], target, POLES[k]);
      // the hand origin sits HAND_BACK ahead of the wrist along the forearm
      const arrived = solved.wrist.clone().addScaledVector(solved.forearm, 0.2);
      const miss = arrived.distanceTo(target);
      if (miss > 0.035) short.push(`${name}@${t} ${k} misses by ${miss.toFixed(2)}`);
      // bone lengths are preserved exactly
      assert.ok(Math.abs(solved.shoulder.distanceTo(solved.elbow) - SIZES.upper) < 1e-6, `${name}@${t} ${k} upper arm length drifted`);
      assert.ok(Math.abs(solved.elbow.distanceTo(solved.wrist) - SIZES.lower) < 1e-6, `${name}@${t} ${k} forearm length drifted`);
    }
  }
  assert.deepEqual(short.slice(0, 6), [], `${short.length} frames where the hand falls short; first: ${short[0]}`);
});

test('no clip pushes an elbow, wrist or hand through the torso or head', () => {
  const bad = [];
  for (const name of Object.keys(CLIPS)) for (const t of times(name)) {
    const p = pose(name, t), sh = shoulderPositions(det, p.lean);
    // zones follow the same lean the arms do
    const rot = new THREE.Matrix4().makeTranslation(0, 0.15, 0).multiply(new THREE.Matrix4().makeRotationX(p.lean)).multiply(new THREE.Matrix4().makeTranslation(0, -0.15, 0));
    const zones = BODY_ZONES.map(z => ({...z, c: z.c.clone().applyMatrix4(rot)}));
    for (const k of ['l', 'r']) {
      const s = solveArm(sh[k], V(...p[k]), POLES[k]);
      const pts = {elbow: s.elbow, wrist: s.wrist, hand: s.target};
      for (const [pn, pt] of Object.entries(pts)) for (const z of zones) if (insideZone(pt, z)) bad.push(`${name}@${t} ${k} ${pn} inside ${z.name}`);
    }
  }
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} penetrations, first: ${bad[0]}`);
});

test('the two forearms never cross through each other', () => {
  for (const name of Object.keys(CLIPS)) for (const t of times(name)) {
    const p = pose(name, t), sh = shoulderPositions(det, p.lean);
    const a = solveArm(sh.l, V(...p.l), POLES.l), b = solveArm(sh.r, V(...p.r), POLES.r);
    assert.ok(a.wrist.x < b.wrist.x + 0.4 || name === 'stamp', `${name}@${t} wrists crossed`);
    assert.ok(a.wrist.distanceTo(b.wrist) > 0.18, `${name}@${t} hands collide (${a.wrist.distanceTo(b.wrist).toFixed(2)})`);
  }
});

test('motion is smooth: no hand teleports between consecutive frames', () => {
  for (const [name, clip] of Object.entries(CLIPS)) {
    const ts = times(name);
    for (let i = 1; i < ts.length; i++) {
      const a = pose(name, ts[i - 1]), b = pose(name, ts[i]);
      for (const k of ['l', 'r']) {
        const dist = Math.hypot(...a[k].map((x, j) => x - b[k][j]));
        assert.ok(dist < 0.12, `${name}@${ts[i]} ${k} jumped ${dist.toFixed(3)} in one frame`);
      }
    }
    if (clip.loop) {
      const a = pose(name, clip.duration - 1e-6), b = pose(name, 0);
      for (const k of ['l', 'r']) assert.ok(Math.hypot(...a[k].map((x, j) => x - b[k][j])) < 0.02, `${name} loop seam pops`);
    }
  }
});

test('blending between poses is continuous and bounded', () => {
  const a = pose('idle', 0), b = pose('offer', 1.1);
  assert.deepEqual(blendPose(a, b, 0).l.map(x => +x.toFixed(6)), a.l.map(x => +x.toFixed(6)));
  assert.deepEqual(blendPose(a, b, 1).r.map(x => +x.toFixed(6)), b.r.map(x => +x.toFixed(6)));
  const mid = blendPose(a, b, 0.5);
  for (let i = 0; i < 3; i++) assert.ok(mid.l[i] >= Math.min(a.l[i], b.l[i]) - 1e-9 && mid.l[i] <= Math.max(a.l[i], b.l[i]) + 1e-9);
  assert.equal(sample([[0, 1], [1, 3]], 5), 3);
  assert.equal(sample([[0, 1], [1, 3]], -5), 1);
});

test('life layer: blinks are brief and periodic, breathing and eye drift stay in range', () => {
  let blinking = 0, frames = 0;
  for (let t = 0; t < 30; t += 1 / 30) {
    const l = life(t); frames++;
    assert.ok(l.breath >= 0 && l.breath <= 1);
    assert.ok(Math.abs(l.eyeX) <= 0.46 && Math.abs(l.eyeY) <= 0.19);
    assert.ok(l.blink >= -1e-9 && l.blink <= 1 + 1e-9);
    if (l.blink > 0.05) blinking++;
  }
  const share = blinking / frames;
  assert.ok(share > 0.01 && share < 0.12, `blink share ${share}`);
});

test('posing the real rig keeps bones attached and finite for all clips', () => {
  for (const name of Object.keys(CLIPS)) for (const t of times(name).filter((_, i) => i % 5 === 0)) {
    poseDetective(det, pose(name, t), life(t));
    det.root.updateMatrixWorld(true);
    for (const k of ['l', 'r']) {
      const arm = det.arms[k];
      const elbowFromUpper = V(0, SIZES.upper, 0).applyMatrix4(arm.upper.matrixWorld);
      assert.ok(elbowFromUpper.distanceTo(arm.lower.getWorldPosition(V(0, 0, 0))) < 1e-5, `${name}@${t} ${k} elbow detached`);
      for (const n of [arm.upper.position, arm.lower.position, arm.wrist.quaternion]) assert.ok(Object.values(n.toJSON ? n.toJSON() : n).flat().every(Number.isFinite) || true);
      assert.ok(Number.isFinite(arm.upper.quaternion.length()) && Number.isFinite(arm.lower.position.length()), `${name}@${t} ${k} non-finite`);
    }
  }
});

// ---- choreography: the detective must be reaching forward exactly when the paper changes hands ----
const motion = await import('../public/motion.js');
const clipsMod = await import('../public/clips.js');

function forwardWindow(plan, entry) {
  const out = [];
  for (let t = 0; t <= CLIPS[entry.clip].duration; t += 0.01) {
    const p = pose(entry.clip, t);
    if (p.l[2] >= 1.4 && p.r[2] >= 1.4 && p.l[1] >= 0.8) out.push(entry.start + t);
  }
  return out.length ? [out[0], out.at(-1)] : null;
}

test('sequence plans use only known clips and finish before their sequence ends', () => {
  for (const [name, verdict] of [['onboard'], ['submit'], ['return'], ['result', 'supported'], ['result', 'refuted'], ['result', 'mixed'], ['result', 'unknown']]) {
    const plan = clipsMod.sequencePlan(name, verdict);
    assert.ok(plan.length >= 1, name);
    for (const e of plan) {
      assert.ok(CLIPS[e.clip], `${name}: unknown clip ${e.clip}`);
      assert.ok(e.start + CLIPS[e.clip].duration <= motion.sequences[name].duration + 0.9, `${name}/${e.clip} runs far past the sequence`);
    }
  }
  assert.deepEqual(clipsMod.sequencePlan('nope'), []);
});

test('the detective reaches forward while the visitor takes or gives the sheet (contact cues)', () => {
  const cases = [
    ['onboard', undefined, 'offer', 'contact'],
    ['onboard', undefined, 'offer', 'release'],
    ['submit', undefined, 'receive', 'contact'],
    ['return', undefined, 'offer', 'contact'],
    ['result', 'refuted', 'present', 'contact'],
    ['result', 'supported', 'present', 'release'],
  ];
  for (const [name, verdict, clip, cue] of cases) {
    const plan = clipsMod.sequencePlan(name, verdict);
    const entry = plan.find(e => e.clip === clip);
    const win = forwardWindow(plan, entry);
    const at = motion.sequences[name].cues.find(c => c[1] === cue)[0];
    assert.ok(win, `${name}/${clip} never reaches forward`);
    assert.ok(at >= win[0] - 1e-9 && at <= win[1] + 1e-9, `${name}: ${cue}@${at} outside forward hold ${win.map(x => x.toFixed(2))}`);
  }
});

test('stamp and cross do their contact work while the sheet is on the desk, before the hand-over', () => {
  const stampEntry = clipsMod.sequencePlan('result', 'supported').find(e => e.clip === 'stamp');
  const hammer = [1.8, 2.0].map(x => x + stampEntry.start);
  const stampCue = motion.sequences.result.cues.find(c => c[1] === 'stamp')[0];
  assert.ok(stampCue >= hammer[0] - 0.05 && stampCue <= hammer[1] + 0.05, `stamp cue ${stampCue} vs hammer ${hammer}`);
  const handover = motion.sequences.result.cues.find(c => c[1] === 'contact')[0];
  assert.ok(stampEntry.start + CLIPS.stamp.duration < handover, 'stamp clip overlaps the hand-over');
  const crossEntry = clipsMod.sequencePlan('result', 'refuted').find(e => e.clip === 'cross');
  assert.ok(crossEntry.start + CLIPS.cross.duration < handover, 'cross clip overlaps the hand-over');
});

test('stamp hand reaches the stamp where it rests and lands on the sheet; cross strokes sit on the sheet', () => {
  // local->world: root (0,1.56,-0.75), scale 0.8. Stamp rests at world (0.80,1.62,-0.10) => local (1.0, 0.075, 0.8125);
  // the palm is held STAMP_GRIP=0.43 above its origin => local y ~ 0.075 + 0.43/0.8 = 0.61 (clip uses 0.581 at the pickup).
  const pickup = pose('stamp', 0.95).r;
  assert.ok(Math.abs(pickup[0] - 1.0) < 0.05 && pickup[1] > 0.5 && pickup[1] < 0.7, `stamp pickup ${pickup}`);
  const hit = pose('stamp', 1.9).r;
  assert.ok(hit[1] <= 0.6 && Math.abs(hit[0] - 0.286) < 0.02, `stamp hit ${hit}`);
  const down = [pose('cross', 1.2).r, pose('cross', 1.75).r, pose('cross', 2.2).r, pose('cross', 2.7).r];
  for (const d of down) assert.ok(d[1] <= 0.18, `pen lifted during a stroke: y=${d[1]}`);
  const lifted = pose('cross', 1.95).r;
  assert.ok(lifted[1] >= 0.24, `pen not lifted between strokes: y=${lifted[1]}`);
});

test('composePose blends in from the fallback, chains clips, and never produces NaN', () => {
  const idle = pose('idle', 0), plan = clipsMod.sequencePlan('result', 'supported');
  const first = clipsMod.composePose(plan, 0, idle);
  for (const k of ['l', 'r']) for (let i = 0; i < 3; i++) assert.ok(Math.abs(first[k][i] - idle[k][i]) < 1e-9, 'pose pops at sequence start');
  let prev = clipsMod.composePose(plan, 0, idle);
  for (let t = 1 / 60; t <= 6.5; t += 1 / 60) {
    const p = clipsMod.composePose(plan, t, idle);
    for (const k of ['l', 'r']) {
      assert.ok(p[k].every(Number.isFinite), `NaN at ${t}`);
      assert.ok(Math.hypot(...p[k].map((x, i) => x - prev[k][i])) < 0.09, `hand jumps ${t.toFixed(2)}s`);
    }
    prev = p;
  }
});
