import * as THREE from 'three';
import {createSkinHand,createSleeve,installHandSurface} from './skin-hand.js';
let characterAsset=null;
export function installCharacterAssets(model,hand){characterAsset=model;installHandSurface(hand);}
// Authored anime head and suit, continuous skinned sleeves and sixteen-joint hands.
// Analytic arm IK and explicit palm frames preserve contact throughout handovers.
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Q = () => new THREE.Quaternion();
const UP = V(0, 1, 0);
const clamp = THREE.MathUtils.clamp;

export const COLORS = {
  skin: '#eeb48e', skinShade: '#d99a76', jacket: '#17365e', jacketDark: '#203955', shirt: '#f4ead2', tie: '#d4502a',
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
export function buildHand(thumbSign, scale = 1) {return createSkinHand(thumbSign,scale,mat('skin',.65));}
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
  const surface=createSleeve(SIZES.upper,SIZES.lower,girth,sleeve);
  lower.add(put(new THREE.Mesh(new THREE.CylinderGeometry(0.109 * girth, 0.109 * girth, 0.1, 24), mat('cuff', 0.7)), {pos: [0, SIZES.lower - 0.03, 0]}));
  const hand = buildHand(sign > 0 ? 1 : -1, girth);
  const wrist = new THREE.Group(); wrist.add(hand.root); lower.add(wrist);
  wrist.position.y = SIZES.lower;
  return {side, sign, upper, lower, wrist, hand, surface};
}

export function buildDetective() {
 const root=new THREE.Group(),torso=new THREE.Group();root.add(torso);
 const asset=characterAsset?.clone(true),head=asset?.getObjectByName('AnimeHead')||new THREE.Group();
 if(asset){head.removeFromParent();for(const o of [...asset.children])torso.add(o);}
 head.position.set(0,1.64,.02);torso.add(head);
 const eyes=[];head.traverse(o=>{if(o.isMesh){o.castShadow=true;if(o.name.startsWith('Eye_white')||o.name.startsWith('Eye white'))eyes.push(o);}});head.userData.eyes=eyes;
 const arms={l:buildArm('l'),r:buildArm('r')},shoulders={l:V(-.56,.94,0),r:V(.56,.94,0)};
 for(const k of ['l','r'])root.add(arms[k].upper,arms[k].lower,arms[k].surface.mesh);
 const hat=new THREE.Group();head.add(hat);const mouth=new THREE.Group();head.add(mouth);
 return {root,torso,head,hat,mouth,arms,shoulders};
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
  arm.surface.a.position.copy(solved.shoulder);arm.surface.a.quaternion.copy(arm.upper.quaternion);
  arm.surface.b.quaternion.copy(arm.upper.quaternion).invert().multiply(arm.lower.quaternion);
}

// Pinch pose: thumb at the sheet edge, fingertips curl behind it. The palm anchor is authoritative.
export function placePalm(arm,shoulder,anchor,pole,forward,normal){
 const y=forward.clone().normalize(),z=normal.clone().normalize(),x=y.clone().cross(z).normalize();z.copy(x).cross(y).normalize();
 const q=Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
 const wrist=anchor.clone().addScaledVector(y,-.135*arm.hand.scale);
 const solved=solveTwoBone(shoulder,wrist,SIZES.upper,SIZES.lower,pole);
 placeArm(arm,{...solved,shoulder,forearm:solved.wrist.clone().sub(solved.elbow).normalize()},.13,false);
 arm.wrist.quaternion.copy(arm.lower.quaternion).invert().multiply(q);arm.hand.grip();
 return solved.wrist.clone().addScaledVector(y,.135*arm.hand.scale).distanceTo(anchor);
}

// Torso lean pivots about the hips, so shoulders move with it.
export function shoulderPositions(det, lean) {
  const m = new THREE.Matrix4().makeTranslation(0, 0.15, 0).multiply(new THREE.Matrix4().makeRotationX(lean)).multiply(new THREE.Matrix4().makeTranslation(0, -0.15, 0));
  return {l: det.shoulders.l.clone().applyMatrix4(m), r: det.shoulders.r.clone().applyMatrix4(m)};
}
export const POLES = {l: V(-1.2, 0.2, 0.1), r: V(1.2, 0.2, 0.1)};

// `targets` overrides clip hand positions (root-local) so the scene can attach hands to the paper, stamp, pen.
// Returns diagnostics: how far each hand fell short of its target, and any joint inside the body.
export function poseDetective(det, p, lifeState, targets = {},grips=null) {
  const lean = p.lean + lifeState.breath * 0.012;
  det.torso.rotation.x = lean;
  det.torso.position.y = .15*(1-Math.cos(lean))+lifeState.breath*.012;det.torso.position.z=.15*Math.sin(lean);
  det.head.rotation.set(p.headX - lean * 0.6, p.headY, 0);
  det.hat.rotation.z = lifeState.hatSway;
  const sh = shoulderPositions(det, lean);
  const diag = {miss: 0, hits: []};
  const rot = new THREE.Matrix4().makeTranslation(0, 0.15, 0).multiply(new THREE.Matrix4().makeRotationX(lean)).multiply(new THREE.Matrix4().makeTranslation(0, -0.15, 0));
  const zones = BODY_ZONES.map(z => ({...z, c: z.c.clone().applyMatrix4(rot)}));
  for (const k of ['l', 'r']) {
    const target = targets[k] ? targets[k].clone() : V(...p[k]);
    if(grips?.[k]){const g=grips[k];diag.miss=Math.max(diag.miss,placePalm(det.arms[k],sh[k],g.position,POLES[k],g.forward,g.normal));continue;}
    const solved = solveArm(sh[k], target, POLES[k]);
    placeArm(det.arms[k], solved, p[k + 'Curl'], k === 'r' && p.rPoint > 0.5);
    diag.miss = Math.max(diag.miss, solved.wrist.clone().addScaledVector(solved.forearm, HAND_BACK).distanceTo(target));
    for (const [n, pt] of [['elbow', solved.elbow], ['wrist', solved.wrist], ['hand', target]]) for (const z of zones) if (insideZone(pt, z)) diag.hits.push(`${k}.${n}:${z.name}`);
  }
  det.head.scale.y=1-lifeState.blink*.035;
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
  for (const k of ['l', 'r']) group.add(arms[k].upper, arms[k].lower, arms[k].surface.mesh);
  return {group, arms};
}
// targetsWorld: {l, r} Vector3 in world space (where the hand origin should go).
// tipWorld (optional): world point the RIGHT index fingertip should touch; overrides targetsWorld.r.
// Returns the worst reach miss in world units.
export function poseViewer(viewer, targetsWorld, curls, point = false, tipWorld = null,gripFrame=null) {
  viewer.group.updateMatrixWorld(true);
  let miss = 0;
  for (const k of ['l', 'r']) {
    let local = viewer.group.worldToLocal(targetsWorld[k].clone());
    if(gripFrame&&!point){const inv=viewer.group.getWorldQuaternion(Q()).invert();miss=Math.max(miss,placePalm(viewer.arms[k],VIEWER.shoulder[k],local,VIEWER.poles[k],gripFrame.forward.clone().applyQuaternion(inv),gripFrame.normal.clone().applyQuaternion(inv)));continue;}
    if (k === 'r' && tipWorld) {
      const tipLocal = viewer.group.worldToLocal(tipWorld.clone());
      const dir = tipLocal.clone().sub(VIEWER.shoulder.r).normalize();
      const arm = viewer.arms.r;
      local = tipLocal.addScaledVector(dir, -arm.hand.tip.y * arm.hand.scale);   // fingers extend along the forearm
    }
    const solved = solveArm(VIEWER.shoulder[k], local, VIEWER.poles[k]);
    placeArm(viewer.arms[k], solved, curls[k], k === 'r' && point);
    if(k==='r'&&tipWorld){for(let i=0;i<4;i++){viewer.group.updateMatrixWorld(true);const actual=viewer.group.worldToLocal(viewer.arms.r.hand.tipWorld()),wanted=viewer.group.worldToLocal(tipWorld.clone());local.add(wanted.sub(actual));const adjusted=solveArm(VIEWER.shoulder[k],local,VIEWER.poles[k]);placeArm(viewer.arms[k],adjusted,curls[k],true);}}
    miss = Math.max(miss, solved.wrist.clone().addScaledVector(solved.forearm, HAND_BACK).distanceTo(local));
  }
  return miss * VIEWER.scale;
}
