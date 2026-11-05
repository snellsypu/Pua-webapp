// Soft rainforest birdsong, synthesised with Web Audio (no audio files).
// On/off is a per-device choice in Settings (localStorage "pua:birdsong", default on).
const KEY = "pua:birdsong";
let ctx: AudioContext | null = null;

export const birdsongOn = () => localStorage.getItem(KEY) !== "off";
export const setBirdsong = (on: boolean) => localStorage.setItem(KEY, on ? "on" : "off");

function chirp(ac: AudioContext, t: number, f0: number, f1: number, dur: number, vol: number, pan: number) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  const p = ac.createStereoPanner();
  o.type = "sine";
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.7);
  o.frequency.exponentialRampToValueAtTime(f0 * 0.9, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  p.pan.value = pan;
  o.connect(g).connect(p).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** ~2.5 s of two birds calling back and forth over a hush of leaves. */
export function playBirdsong(force = false) {
  if (!force && !birdsongOn()) return;
  try {
    ctx ??= new AudioContext();
    const ac = ctx;
    void ac.resume();
    const t0 = ac.currentTime + 0.05;
    // leaf rustle: filtered noise, very quiet
    const buf = ac.createBuffer(1, ac.sampleRate * 2.6, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const n = ac.createBufferSource();
    n.buffer = buf;
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.0001, t0);
    ng.gain.exponentialRampToValueAtTime(0.012, t0 + 0.6);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.5);
    n.connect(bp).connect(ng).connect(ac.destination);
    n.start(t0);
    // bird A: quick rising trills (left)
    [0, 0.12, 0.24, 0.9, 1.02].forEach((d, i) => chirp(ac, t0 + d, 2600 + i * 80, 4200, 0.09, 0.05, -0.5));
    // bird B: slower falling whistles (right)
    [0.45, 0.7, 1.5, 1.75].forEach((d) => chirp(ac, t0 + d, 3600, 2300, 0.2, 0.04, 0.5));
    // a far-away coo
    chirp(ac, t0 + 1.95, 900, 700, 0.45, 0.025, 0);
  } catch {
    /* audio not available */
  }
}
