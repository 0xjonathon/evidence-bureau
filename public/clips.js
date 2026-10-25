// Hand-authored performance clips. Pure data + math (no three.js import) so tests can sample them.
// Space: the detective's local frame. +X right (camera view), +Y up, +Z toward the viewer.
// The desk top is at DESK_Y; hands must never be authored below DESK_Y + HAND_CLEARANCE.
export const DESK_Y = 0.0;              // detective-local height of the desk surface under the hands
export const HAND_CLEARANCE = 0.03;     // palm/fingers stay at least this far above the desk
export const REST = {l: [-0.5, 0.05, 0.95], r: [0.5, 0.05, 0.95]};

const easeInOut = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
// Overshoot-and-settle: anticipation reads as "weight". `k` is how far past the target we go.
export const settle = (t, k = 0.12) => { const u = Math.min(1, Math.max(0, t)); return u < 1 ? 1 - Math.pow(1 - u, 3) + Math.sin(u * Math.PI) * k * (1 - u) : 1; };

// A track is [[time, value], ...]; value is a number or an array. Sampled with ease-in-out between keys.
export function sample(track, t) {
  if (t <= track[0][0]) return track[0][1];
  const last = track[track.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 0; i < track.length - 1; i++) {
    const [t0, a] = track[i], [t1, b] = track[i + 1];
    if (t >= t0 && t <= t1) {
      const u = easeInOut((t - t0) / (t1 - t0));
      return Array.isArray(a) ? a.map((x, j) => lerp(x, b[j], u)) : lerp(a, b, u);
    }
  }
  return last[1];
}

// Each clip: duration (s) and tracks. Hand tracks: position [x,y,z], curl 0..1, point (bool via 0/1).
// `paper` tracks the sheet in the same frame; it is what hands "hold", so it is authored with them.
export const CLIPS = {
  idle: {duration: 4, loop: true, tracks: {
    l: [[0, REST.l], [2, [-0.5, 0.06, 0.96]], [4, REST.l]],
    r: [[0, REST.r], [2, [0.5, 0.06, 0.96]], [4, REST.r]],
    lCurl: [[0, 0.3], [4, 0.3]], rCurl: [[0, 0.3], [4, 0.3]],
    headY: [[0, 0], [1.5, 0.05], [3, -0.04], [4, 0]], headX: [[0, 0], [2, 0.02], [4, 0]],
  }},
  // He lifts the sheet from the desk, offers it forward, holds while the visitor takes it, then withdraws.
  offer: {duration: 3.6, tracks: {
    l: [[0, REST.l], [0.4, [-0.5, 0.1, 0.95]], [0.65, [-0.5, 0.1, 0.95]], [1.2, [-0.5, 0.8, 1.0]], [2.0, [-0.46, 0.86, 1.45]], [2.8, [-0.46, 0.86, 1.5]], [3.6, REST.l]],
    r: [[0, REST.r], [0.4, [0.5, 0.1, 0.95]], [0.65, [0.5, 0.1, 0.95]], [1.2, [0.5, 0.8, 1.0]], [2.0, [0.46, 0.86, 1.45]], [2.8, [0.46, 0.86, 1.5]], [3.6, REST.r]],
    lCurl: [[0, 0.3], [0.4, 0.15], [0.65, 0.5], [2.4, 0.5], [2.8, 0.1], [3.6, 0.3]],
    rCurl: [[0, 0.3], [0.4, 0.15], [0.65, 0.5], [2.4, 0.5], [2.8, 0.1], [3.6, 0.3]],
    headX: [[0, 0], [0.9, -0.12], [2.2, -0.1], [3.6, 0]], headY: [[0, 0], [3.6, 0]],
    lean: [[0, 0], [1.1, 0.05], [2.2, 0.16], [3.6, 0]],
  }},
  // Takes the sheet from the visitor (forward hold at 1.1) and lays it on the blotter.
  receive: {duration: 3.0, tracks: {
    l: [[0, REST.l], [0.6, [-0.48, 0.55, 1.45]], [1.1, [-0.46, 0.84, 1.5]], [1.7, [-0.46, 0.7, 1.1]], [2.2, [-0.5, 0.1, 0.95]], [3.0, REST.l]],
    r: [[0, REST.r], [0.6, [0.48, 0.55, 1.45]], [1.1, [0.46, 0.84, 1.5]], [1.7, [0.46, 0.7, 1.1]], [2.2, [0.5, 0.1, 0.95]], [3.0, REST.r]],
    lCurl: [[0, 0.3], [0.6, 0.1], [1.1, 0.55], [2.2, 0.55], [2.6, 0.1], [3.0, 0.3]],
    rCurl: [[0, 0.3], [0.6, 0.1], [1.1, 0.55], [2.2, 0.55], [2.6, 0.1], [3.0, 0.3]],
    headX: [[0, 0], [1.1, 0.08], [2.2, -0.14], [3.0, 0]], headY: [[0, 0], [3.0, 0]],
    lean: [[0, 0], [1.0, 0.14], [3.0, 0]],
  }},
  // Right hand fetches the rubber stamp (rests at local 1.0,.581,1.25), carries it over the sheet, hammers (1.8-2.0), returns it.
  // Hand heights are the GRIP heights: the palm rests on top of the handle, so the hand stays well above the desk.
  stamp: {duration: 3.6, tracks: {
    r: [[0, REST.r], [0.5, [1.0, 0.9, 1.2]], [0.85, [1.0, 0.581, 1.25]], [1.05, [1.0, 0.581, 1.25]], [1.45, [0.286, 0.906, 1.12]], [1.8, [0.286, 0.581, 1.12]], [2.0, [0.286, 0.581, 1.12]], [2.4, [0.286, 0.906, 1.12]], [2.85, [1.0, 0.581, 1.25]], [3.0, [1.0, 0.581, 1.25]], [3.6, REST.r]],
    l: [[0, REST.l], [0.8, [-0.5, 0.1, 0.95]], [3.0, [-0.5, 0.1, 0.95]], [3.6, REST.l]],
    rCurl: [[0, 0.3], [0.5, 0.2], [0.85, 0.9], [3.0, 0.9], [3.15, 0.3], [3.6, 0.3]], lCurl: [[0, 0.3], [0.8, 0.2], [3.0, 0.2], [3.6, 0.3]],
    headX: [[0, 0], [1.3, 0.1], [1.8, 0.18], [2.6, 0], [3.6, 0]], headY: [[0, 0], [3.6, 0]],
    lean: [[0, 0], [1.3, 0.1], [1.8, 0.2], [2.6, 0.04], [3.6, 0]],
  }},
  // Marks a cross with a pen. Pen-down targets are the REAL stroke endpoints on the sheet lying at the desk
  // (A->B then C->D); the hand sits 0.10 above the tip. Stroke 1: 1.2-1.75, stroke 2: 2.2-2.7.
  cross: {duration: 3.2, tracks: {
    r: [[0, REST.r], [0.5, [0.6, 0.3, 1.0]], [0.9, [0.191, 0.26, 0.99]], [1.2, [0.191, 0.16, 0.99]], [1.75, [0.374, 0.16, 1.149]], [1.95, [0.374, 0.26, 1.149]], [2.1, [0.374, 0.26, 0.99]], [2.2, [0.374, 0.16, 0.99]], [2.7, [0.191, 0.16, 1.149]], [2.9, [0.191, 0.26, 1.149]], [3.2, REST.r]],
    l: [[0, REST.l], [0.8, [-0.5, 0.1, 0.95]], [2.7, [-0.5, 0.1, 0.95]], [3.2, REST.l]],
    rCurl: [[0, 0.3], [0.5, 0.75], [2.9, 0.75], [3.2, 0.3]], lCurl: [[0, 0.3], [0.8, 0.2], [2.7, 0.2], [3.2, 0.3]], rPoint: [[0, 0], [3.2, 0]],
    headX: [[0, 0], [1.0, 0.16], [2.7, 0.12], [3.2, 0]], headY: [[0, 0], [3.2, 0]],
    lean: [[0, 0], [1.0, 0.14], [2.7, 0.1], [3.2, 0]],
  }},
  // Lifts the finished sheet from the desk and presents it forward; forward hold 1.35-2.15.
  present: {duration: 2.75, tracks: {
    l: [[0, REST.l], [0.3, [-0.5, 0.1, 0.95]], [0.5, [-0.5, 0.1, 0.95]], [1.0, [-0.46, 0.8, 1.15]], [1.35, [-0.44, 0.86, 1.48]], [2.15, [-0.44, 0.86, 1.5]], [2.75, REST.l]],
    r: [[0, REST.r], [0.3, [0.5, 0.1, 0.95]], [0.5, [0.5, 0.1, 0.95]], [1.0, [0.46, 0.8, 1.15]], [1.35, [0.44, 0.86, 1.48]], [2.15, [0.44, 0.86, 1.5]], [2.75, REST.r]],
    lCurl: [[0, 0.3], [0.3, 0.2], [0.5, 0.5], [1.75, 0.5], [2.1, 0.1], [2.75, 0.3]],
    rCurl: [[0, 0.3], [0.3, 0.2], [0.5, 0.5], [1.75, 0.5], [2.1, 0.1], [2.75, 0.3]],
    headX: [[0, 0], [1.2, -0.1], [2.75, 0]], headY: [[0, 0], [2.75, 0]], lean: [[0, 0], [1.6, 0.15], [2.75, 0]],
  }},
  // Reads the screen: head turns toward the monitor, fingers tap the keyboard.
  type: {duration: 1.2, loop: true, tracks: {
    l: [[0, [-0.4, 0.05, 0.9]], [0.3, [-0.4, 0.02, 0.9]], [0.6, [-0.4, 0.07, 0.9]], [1.2, [-0.4, 0.05, 0.9]]],
    r: [[0, [0.85, 0.06, 0.75]], [0.2, [0.85, 0.02, 0.75]], [0.5, [0.85, 0.08, 0.75]], [0.9, [0.85, 0.03, 0.75]], [1.2, [0.85, 0.06, 0.75]]],
    lCurl: [[0, 0.5], [1.2, 0.5]], rCurl: [[0, 0.55], [1.2, 0.55]],
    headY: [[0, 0.32], [1.2, 0.32]], headX: [[0, 0.04], [0.6, 0.07], [1.2, 0.04]], lean: [[0, 0.04], [1.2, 0.04]],
  }},
  shrug: {duration: 2.2, tracks: {
    l: [[0, REST.l], [0.5, [-0.7, 0.36, 0.7]], [1.5, [-0.7, 0.36, 0.7]], [2.2, REST.l]],
    r: [[0, REST.r], [0.5, [0.7, 0.36, 0.7]], [1.5, [0.7, 0.36, 0.7]], [2.2, REST.r]],
    lCurl: [[0, 0.3], [0.5, 0], [1.5, 0], [2.2, 0.3]], rCurl: [[0, 0.3], [0.5, 0], [1.5, 0], [2.2, 0.3]],
    headX: [[0, 0], [0.6, -0.1], [1.5, -0.1], [2.2, 0]], headY: [[0, 0], [0.5, 0.18], [1.1, -0.18], [1.6, 0.1], [2.2, 0]], lean: [[0, 0], [2.2, 0]],
  }},
};

// Names of the tracks every clip may contain, with neutral defaults.
export const NEUTRAL = {lCurl: 0.3, rCurl: 0.3, headX: 0, headY: 0, lean: 0, rPoint: 0};

export function pose(clipName, time) {
  const clip = CLIPS[clipName];
  const t = clip.loop ? time % clip.duration : Math.min(time, clip.duration);
  const out = {l: sample(clip.tracks.l, t), r: sample(clip.tracks.r, t)};
  for (const k of Object.keys(NEUTRAL)) out[k] = clip.tracks[k] ? sample(clip.tracks[k], t) : NEUTRAL[k];
  return out;
}

// Crossfade helper: blends two poses (b over a) by `w` 0..1.
export function blendPose(a, b, w) {
  const u = easeInOut(Math.min(1, Math.max(0, w)));
  const mixV = (p, q) => p.map((x, i) => lerp(x, q[i], u));
  const out = {l: mixV(a.l, b.l), r: mixV(a.r, b.r)};
  for (const k of Object.keys(NEUTRAL)) out[k] = lerp(a[k], b[k], u);
  return out;
}

// Procedural life layered on any clip: breathing, blink schedule, eye drift. Deterministic in time.
export function life(time) {
  const breath = Math.sin(time * 1.5) * 0.5 + 0.5;
  const phase = time % 4.3;
  const blink = phase > 4.12 ? Math.sin((phase - 4.12) / 0.18 * Math.PI) : 0;       // ~0.18s blink every 4.3s
  const eyeX = Math.sin(time * 0.37) * 0.35 + Math.sin(time * 0.91) * 0.1;
  const eyeY = Math.sin(time * 0.29 + 1) * 0.18;
  const hatSway = Math.sin(time * 1.1) * 0.012;
  return {time,breath, blink, eyeX, eyeY, hatSway};
}

// Linear mix of two poses (no easing); used for per-frame smoothing toward a target pose.
export function mixPose(a, b, u) {
  const m = (p, q) => p.map((x, i) => x + (q[i] - x) * u);
  const out = {l: m(a.l, b.l), r: m(a.r, b.r)};
  for (const k of Object.keys(NEUTRAL)) out[k] = a[k] + (b[k] - a[k]) * u;
  return out;
}

// Which clips drive the detective during each scene sequence, and when they start (seconds into the sequence).
// Starts are chosen so the clip's forward-hold window contains the sequence's `contact` cue (see tests/rig.test.mjs).
export function sequencePlan(name, verdict) {
  if (name === 'onboard') return [{clip: 'offer', start: 0.85}];
  if (name === 'submit') return [{clip: 'receive', start: 0.5}];
  if (name === 'return') return [{clip: 'offer', start: -0.1}];
  if (name === 'result') {
    const plan = [];
    if (verdict === 'supported') plan.push({clip: 'stamp', start: 0.53});
    else if (verdict === 'refuted') plan.push({clip: 'cross', start: 0.3});
    plan.push({clip: 'present', start: 3.55});
    return plan;
  }
  return [];
}
const smooth = u => { const x = Math.min(1, Math.max(0, u)); return x * x * (3 - 2 * x); };
// Pose at time t for a sequence plan. Overlapping clips cross-fade over their overlap; the first clip fades in from `fallback`.
export function composePose(plan, t, fallback) {
  let out = fallback, prevEnd = -Infinity;
  for (const e of plan) {
    const local = t - e.start;
    if (local < 0) break;
    const dur = CLIPS[e.clip].duration;
    const p = pose(e.clip, Math.min(local, dur));
    const fade = e.start < prevEnd ? prevEnd - e.start : 0.25;
    out = local >= fade ? p : mixPose(out, p, smooth(local / fade));
    prevEnd = e.start + dur;
  }
  return out;
}
