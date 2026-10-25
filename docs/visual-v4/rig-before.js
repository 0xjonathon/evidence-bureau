import * as THREE from 'three';
// A toy-like detective built from rigid primitives (no skinning, so no mesh can deform through
// another). Every limb is a capsule hung from a joint group; arms are posed by analytic two-bone IK.
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Q = () => new THREE.Quaternion();
const UP = V(0, 1, 0);
const clamp = THREE.MathUtils.clamp;

export const COLORS = {
  skin: '#eeb48e', skinShade: '#d99a76', jacket: '#34444d', jacketDark: '#27343c', shirt: '#f4ead2', tie: '#d4502a',
  hat: '#7b5333', hatBand: '#33261b', brass: '#c9a24a', mustache: '#3a281b', eye: '#fbf7ea', iris: '#3a2c20', lip: '#b3594a',
  sleeve: '#2f4e47', cuff: '#efe6cf',
};
const matCache = new Map();
export function mat(key, rough = 0.72, extra = {}) {
  const k = key + rough + JSON.stringify(extra);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({color: COLORS[key] || key, roughness: rough, metalness: extra.metalness || 0, ...extra}));
  return matCache.get(k);
}
function put(mesh, {pos, rot, scale, shadow = true} = {}) {
  if (pos) mesh.position.set(...pos);
  if (rot) mesh.rotation.set(...rot);
  if (scale) mesh.scale.set(...scale);
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  return mesh;
}
export const ball = (r, material, opts = {}, seg = 28) => put(new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), material), opts);
// A capsule that starts at the joint origin and extends along +Y by `length`.
export const limb = (r, length, material, opts = {}) => {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, length - 2 * r), 8, 20), material);
  m.position.y = length / 2; return put(m, opts);
};

// Mitten-style hand: fingers +Y, back of hand +Z, palm faces -Z. thumbSign picks the thumb side.
export function buildHand(thumbSign, scale = 1) {
  const root = new THREE.Group(), skin = mat('skin', 0.6);
  root.add(ball(1, skin, {pos: [0, 0.13, 0], scale: [0.155, 0.17, 0.092]}));
  const fingers = [];
  const lengths = [0.19, 0.215, 0.2, 0.15];
  lengths.forEach((len, i) => {
    const pivot = new THREE.Group(); pivot.position.set(thumbSign * (0.115 - i * 0.077), 0.23, 0);
    const prox = limb(0.04, len * 0.55, skin), distal = new THREE.Group(); distal.position.y = len * 0.55;
    distal.add(limb(0.037, len * 0.5, skin)); prox.add(distal); pivot.add(prox);
    root.add(pivot); fingers.push({pivot, distal, prox});
  });
  const thumb = new THREE.Group(); thumb.position.set(thumbSign * 0.145, 0.1, -0.01);
  thumb.rotation.z = -thumbSign * 0.62; thumb.add(limb(0.05, 0.2, skin)); root.add(thumb);
  root.scale.setScalar(scale);
  const shape = {curl: 0.25, point: false};
  // curl 0 = flat, 1 = fist. point = index extended.
  function apply() {
    fingers.forEach((f, i) => {
      const c = shape.point && i === 0 ? 0 : shape.curl;
      f.pivot.rotation.x = -c * 1.25; f.distal.rotation.x = -c * 1.35;
    });
    thumb.rotation.x = -shape.curl * 0.5;
    thumb.rotation.z = -thumbSign * (0.62 - shape.curl * 0.45);
  }
  apply();
  return {
    root, thumbSign, scale,
    set(curl, point = false) { shape.curl = clamp(curl, 0, 1); shape.point = point; apply(); },
    // Index fingertip in the hand's local frame (before the hand's own scale).
    tip: V(thumbSign * 0.115, 0.23 + lengths[0] + 0.01, 0),
  };
}
// Analytic two-bone IK in world space. Returns joint positions; the caller orients the limb groups.
export function solveTwoBone(shoulder, target, upper, lower, pole) {
  const dir = target.clone().sub(shoulder);
  const d = clamp(dir.length(), Math.abs(upper - lower) + 0.01, upper + lower - 0.005);
  dir.normalize();
  const bend = pole.clone().sub(shoulder); bend.addScaledVector(dir, -bend.dot(dir));
  if (bend.lengthSq() < 1e-6) bend.set(0, 0, 1);
  bend.normalize();
  const along = (upper * upper - lower * lower + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, upper * upper - along * along));
  const elbow = shoulder.clone().addScaledVector(dir, along).addScaledVector(bend, h);
  const wrist = shoulder.clone().addScaledVector(dir, d);
  return {elbow, wrist, reach: d};
}
// Orient a group whose local +Y should point from `from` toward `to`.
export function aimY(group, from, to) {
  group.position.copy(from);
  group.quaternion.setFromUnitVectors(UP, to.clone().sub(from).normalize());
}

export const SIZES = {upper: 0.66, lower: 0.62, hand: 0.30};

export function buildArm(side, sleeveKey = 'jacket', girth = 1) {
  const sign = side === 'l' ? -1 : 1;
  const sleeve = mat(sleeveKey, 0.8);
  const upper = new THREE.Group(), lower = new THREE.Group();
  upper.add(limb(0.145 * girth, SIZES.upper, sleeve), ball(0.158 * girth, sleeve, {pos: [0, 0, 0]}));
  lower.add(limb(0.128 * girth, SIZES.lower, sleeve), ball(0.134 * girth, sleeve, {pos: [0, 0, 0]}));
  lower.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.142 * girth, 0.142 * girth, 0.1, 24), mat('cuff', 0.7)), {pos: [0, SIZES.lower - 0.03, 0]}));
  const hand = buildHand(sign > 0 ? 1 : -1, girth);
  const wrist = new THREE.Group(); wrist.add(hand.root); lower.add(wrist);
  wrist.position.y = SIZES.lower;
  return {side, sign, upper, lower, wrist, hand};
}

export function buildDetective() {
  const root = new THREE.Group();
  const jacket = mat('jacket', 0.78), shirt = mat('shirt', 0.7), skin = mat('skin', 0.58);
  // Torso: a rounded tapered body so shoulders read as a suit, not a box.
  const torso = new THREE.Group(); root.add(torso);
  torso.add(ball(1, jacket, {pos: [0, 0.42, 0], scale: [0.66, 0.86, 0.46]}));
  torso.add(ball(1, jacket, {pos: [0, 0.98, 0], scale: [0.6, 0.3, 0.4]}));
  torso.add(put(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.05), shirt), {pos: [0, 0.62, 0.46]}));
  const tie = put(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 4), mat('tie', 0.6)), {pos: [0, 0.55, 0.5], rot: [Math.PI, 0, 0], scale: [1, 1, 0.5]});
  torso.add(tie);
  for (const s of [-1, 1]) torso.add(put(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.56, 0.05), mat('jacketDark', 0.8)), {pos: [s * 0.22, 0.6, 0.46], rot: [0, 0, s * -0.22]}));
  // Neck, head, face. The head group carries nod / look-up motion.
  const neck = limb(0.15, 0.34, skin, {pos: [0, 1.08, 0]}); torso.add(neck);
  torso.add(put(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 12, 28), shirt), {pos: [0, 1.17, 0.03], rot: [Math.PI / 2, 0, 0]}));
  const head = new THREE.Group(); head.position.set(0, 1.62, 0.02); torso.add(head);
  head.add(ball(0.46, skin, {scale: [1, 1.04, 0.98]}));
  for (const s of [-1, 1]) {
    head.add(ball(0.12, skin, {pos: [s * 0.45, -0.02, 0], scale: [0.55, 1, 0.8]}));
    const eye = new THREE.Group(); eye.position.set(s * 0.17, 0.06, 0.41); head.add(eye);
    eye.add(ball(0.11, mat('eye', 0.3), {scale: [1, 1.08, 0.6]}));
    const iris = ball(0.052, mat('iris', 0.25), {pos: [0, 0, 0.055]}); eye.add(iris); eye.userData.iris = iris;
    const lid = ball(0.118, skin, {pos: [0, 0.2, 0.03], scale: [1, 1, 0.7]}); lid.visible = false; eye.add(lid); eye.userData.lid = lid;
    (head.userData.eyes ||= []).push(eye);
    const frame = put(new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.012, 10, 32), mat('brass', 0.35, {metalness: 0.7})), {pos: [s * 0.17, 0.06, 0.45]});
    head.add(frame);
    head.add(put(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.02), mat('mustache', 0.9)), {pos: [s * 0.17, 0.2, 0.43], rot: [0, 0, s * -0.12]}));
  }
  head.add(put(new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.01, 8, 16, Math.PI), mat('brass', 0.35, {metalness: 0.7})), {pos: [0, 0.07, 0.45], rot: [Math.PI, 0, 0]}));
  head.add(ball(0.06, skin, {pos: [0, -0.05, 0.46], scale: [1, 1.1, 1]}));
  head.add(ball(1, mat('mustache', 0.9), {pos: [0, -0.2, 0.43], scale: [0.2, 0.065, 0.07]}));
  const mouth = put(new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 16, Math.PI), mat('lip', 0.6)), {pos: [0, -0.285, 0.42], rot: [0, 0, Math.PI]}); head.add(mouth);
  // Fedora: crown, band, brim.
  const hat = new THREE.Group(); hat.position.set(0, 0.3, 0); head.add(hat);
  hat.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.34, 32), mat('hat', 0.85)), {pos: [0, 0.2, 0]}));
  hat.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.405, 0.41, 0.085, 32), mat('hatBand', 0.7)), {pos: [0, 0.08, 0]}));
  hat.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.035, 40), mat('hat', 0.85)), {pos: [0, 0.01, 0]}));
  const arms = {l: buildArm('l'), r: buildArm('r')};
  const shoulders = {l: V(-0.6, 1.0, 0), r: V(0.6, 1.0, 0)};
  for (const k of ['l', 'r']) { root.add(arms[k].upper); root.add(arms[k].lower); }
  const skinBlush = null; void skinBlush;
  return {root, torso, head, hat, mouth, arms, shoulders};
}
// ---- posing -------------------------------------------------------------------------------------
const HAND_BACK = 0.2;                       // wrist sits this far behind the hand target along the forearm

// Pure geometry: where every joint ends up for a given target. Used by the renderer AND by tests.
export function solveArm(shoulder, target, pole) {
  // The wrist sits HAND_BACK behind the hand target ALONG THE FOREARM, but the forearm direction
  // depends on where the wrist ends up, so iterate that fixed point until it settles.
  let fwd = target.clone().sub(shoulder).normalize();   // first guess: straight from the shoulder
  let solved = null;
  for (let i = 0; i < 8; i++) {
    solved = solveTwoBone(shoulder, target.clone().addScaledVector(fwd, -HAND_BACK), SIZES.upper, SIZES.lower, pole);
    const next = solved.wrist.clone().sub(solved.elbow).normalize();   // the hand extends along the forearm
    if (next.distanceToSquared(fwd) < 1e-10) break;
    fwd = next;
  }
  const forearm = solved.wrist.clone().sub(solved.elbow).normalize();
  return {shoulder, elbow: solved.elbow, wrist: solved.wrist, forearm, reach: solved.reach, target};
}

// Hand frame: fingers continue the forearm, back of the hand faces up, rolled inward when gripping.
export function handBasis(forearm, curl, sign) {
  const y = forearm.clone().normalize();                       // fingers continue the forearm
  let z = UP.clone().addScaledVector(y, -UP.dot(y));           // back of the hand faces up
  if (z.lengthSq() < 1e-4) z.set(0, 0, 1);
  z.normalize().applyAxisAngle(y, -sign * curl * 0.55);        // gripping rolls the hand inward
  const x = y.clone().cross(z).normalize();
  return new THREE.Matrix4().makeBasis(x, y, z);
}

export function placeArm(arm, solved, curl, point = false) {
  aimY(arm.upper, solved.shoulder, solved.elbow);
  aimY(arm.lower, solved.elbow, solved.wrist);
  const q = Q().setFromRotationMatrix(handBasis(solved.forearm, curl, arm.sign));
  arm.wrist.quaternion.copy(arm.lower.quaternion).invert().multiply(q);
  arm.hand.set(curl, point);
}

// Torso lean pivots about the hips, so shoulders move with it.
export function shoulderPositions(det, lean) {
  const m = new THREE.Matrix4().makeTranslation(0, 0.15, 0).multiply(new THREE.Matrix4().makeRotationX(lean)).multiply(new THREE.Matrix4().makeTranslation(0, -0.15, 0));
  return {l: det.shoulders.l.clone().applyMatrix4(m), r: det.shoulders.r.clone().applyMatrix4(m)};
}
export const POLES = {l: V(-1.2, 0.2, 0.1), r: V(1.2, 0.2, 0.1)};

// `targets` overrides clip hand positions (root-local) so the scene can attach hands to the paper, stamp, pen.
// Returns diagnostics: how far each hand fell short of its target, and any joint inside the body.
export function poseDetective(det, p, lifeState, targets = {}) {
  const lean = p.lean + lifeState.breath * 0.012;
  det.torso.rotation.x = lean;
  det.torso.position.y = lifeState.breath * 0.012;
  det.head.rotation.set(p.headX - lean * 0.6, p.headY, 0);
  det.hat.rotation.z = lifeState.hatSway;
  const sh = shoulderPositions(det, lean);
  const diag = {miss: 0, hits: []};
  const rot = new THREE.Matrix4().makeTranslation(0, 0.15, 0).multiply(new THREE.Matrix4().makeRotationX(lean)).multiply(new THREE.Matrix4().makeTranslation(0, -0.15, 0));
  const zones = BODY_ZONES.map(z => ({...z, c: z.c.clone().applyMatrix4(rot)}));
  for (const k of ['l', 'r']) {
    const target = targets[k] ? targets[k].clone() : V(...p[k]);
    const solved = solveArm(sh[k], target, POLES[k]);
    placeArm(det.arms[k], solved, p[k + 'Curl'], k === 'r' && p.rPoint > 0.5);
    diag.miss = Math.max(diag.miss, solved.wrist.clone().addScaledVector(solved.forearm, HAND_BACK).distanceTo(target));
    for (const [n, pt] of [['elbow', solved.elbow], ['wrist', solved.wrist], ['hand', target]]) for (const z of zones) if (insideZone(pt, z)) diag.hits.push(`${k}.${n}:${z.name}`);
  }
  for (const eye of det.head.userData.eyes) {
    eye.userData.iris.position.x = lifeState.eyeX * 0.045; eye.userData.iris.position.y = lifeState.eyeY * 0.03;
    eye.scale.y = 1 - lifeState.blink * 0.92;
  }
  return diag;
}

// Geometry used by the penetration test: capsule segments of an arm and solid zones of the body.
export const BODY_ZONES = [
  {name: 'torso', c: V(0, 0.42, 0), r: V(0.66, 0.86, 0.46)},
  {name: 'chest', c: V(0, 0.98, 0), r: V(0.6, 0.3, 0.4)},
  {name: 'head', c: V(0, 1.62, 0.02), r: V(0.46, 0.48, 0.45)},
];
export function insideZone(point, zone, margin = 0) {
  const d = point.clone().sub(zone.c);
  return (d.x / (zone.r.x - margin)) ** 2 + (d.y / (zone.r.y - margin)) ** 2 + (d.z / (zone.r.z - margin)) ** 2 < 1;
}

// First-person arms for the visitor. The group is meant to share the camera's orientation (x right, y up, -z forward)
// and is scaled up so the arms can reach across the room; shoulders are given in group-local units.
export const VIEWER = {scale: 1.7, shoulder: {l: V(-0.36, -0.46, -0.16), r: V(0.36, -0.46, -0.16)}, poles: {l: V(-0.9, -1.7, 0.5), r: V(0.9, -1.7, 0.5)}};
export function buildViewer() {
  const group = new THREE.Group(); group.scale.setScalar(VIEWER.scale);
  const arms = {l: buildArm('l', 'sleeve', 0.42), r: buildArm('r', 'sleeve', 0.42)};
  for (const k of ['l', 'r']) group.add(arms[k].upper, arms[k].lower);
  return {group, arms};
}
// targetsWorld: {l, r} Vector3 in world space (where the hand origin should go).
// tipWorld (optional): world point the RIGHT index fingertip should touch; overrides targetsWorld.r.
// Returns the worst reach miss in world units.
export function poseViewer(viewer, targetsWorld, curls, point = false, tipWorld = null) {
  viewer.group.updateMatrixWorld(true);
  let miss = 0;
  for (const k of ['l', 'r']) {
    let local = viewer.group.worldToLocal(targetsWorld[k].clone());
    if (k === 'r' && tipWorld) {
      const tipLocal = viewer.group.worldToLocal(tipWorld.clone());
      const dir = tipLocal.clone().sub(VIEWER.shoulder.r).normalize();
      const arm = viewer.arms.r;
      local = tipLocal.addScaledVector(dir, -arm.hand.tip.y * arm.hand.scale);   // fingers extend along the forearm
    }
    const solved = solveArm(VIEWER.shoulder[k], local, VIEWER.poles[k]);
    placeArm(viewer.arms[k], solved, curls[k], k === 'r' && point);
    miss = Math.max(miss, solved.wrist.clone().addScaledVector(solved.forearm, HAND_BACK).distanceTo(local));
  }
  return miss * VIEWER.scale;
}
