// 用 WebAudio 合成音效，无需音频文件
let ctx: AudioContext | null = null;

export function unlockAudio() {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function audioReady() {
  return ctx?.state === 'running';
}

/** 软萌闯关使用轻柔的木琴声，不复用足球的号角和哨声。 */
const ADVENTURE_NOTES = {
  clear: [523, 659, 784, 1047], collect: [880, 1175], jump: [440, 660], hurt: [330, 262],
  // 弹簧：一串往上蹦的音；踩中小怪或 Boss：低低的两下闷响
  bounce: [392, 587, 880], stomp: [196, 147],
};
export function sfxAdventure(kind: keyof typeof ADVENTURE_NOTES) {
  if (!ctx || ctx.state !== 'running') return;
  const notes = ADVENTURE_NOTES[kind];
  notes.forEach((frequency, i) => {
    const at = ctx!.currentTime + i * .075;
    const oscillator = ctx!.createOscillator(), gain = ctx!.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.09, at); gain.gain.exponentialRampToValueAtTime(.001, at + .22);
    oscillator.connect(gain).connect(ctx!.destination); oscillator.start(at); oscillator.stop(at + .24);
  });
}

function noise(dur: number) {
  const c = ctx!;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  return src;
}

export function sfxKick(power: number) {
  if (!ctx || ctx.state !== 'running') return;
  const c = ctx;
  const t = c.currentTime;
  const vol = Math.min(0.9, 0.25 + power / 1400);
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + 0.16);
}

export function sfxWhistle(long = false) {
  if (!ctx || ctx.state !== 'running') return;
  const c = ctx;
  const t = c.currentTime;
  const parts = long ? [0, 0.35, 0.7] : [0];
  for (const off of parts) {
    const dur = long && off === 0.7 ? 0.8 : 0.28;
    const o = c.createOscillator();
    const lfo = c.createOscillator();
    const lg = c.createGain();
    const g = c.createGain();
    o.frequency.value = 2900;
    lfo.frequency.value = 28;
    lg.gain.value = 120;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0, t + off);
    g.gain.linearRampToValueAtTime(0.18, t + off + 0.02);
    g.gain.setValueAtTime(0.18, t + off + dur - 0.05);
    g.gain.linearRampToValueAtTime(0, t + off + dur);
    o.connect(g).connect(c.destination);
    o.start(t + off);
    lfo.start(t + off);
    o.stop(t + off + dur);
    lfo.stop(t + off + dur);
  }
}

export function sfxGoal() {
  if (!ctx || ctx.state !== 'running') return;
  const c = ctx;
  const t = c.currentTime;
  // 观众欢呼：带通噪声起伏
  const n = noise(3);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 900;
  f.Q.value = 0.6;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.5, t + 0.3);
  g.gain.linearRampToValueAtTime(0.35, t + 1.5);
  g.gain.linearRampToValueAtTime(0, t + 3);
  n.connect(f).connect(g).connect(c.destination);
  n.start(t);
  // 号角
  for (const [i, fr] of [523, 659, 784].entries()) {
    const o = c.createOscillator();
    const og = c.createGain();
    o.type = 'sawtooth';
    o.frequency.value = fr;
    og.gain.setValueAtTime(0, t + i * 0.12);
    og.gain.linearRampToValueAtTime(0.06, t + i * 0.12 + 0.03);
    og.gain.linearRampToValueAtTime(0, t + 1.2);
    o.connect(og).connect(c.destination);
    o.start(t + i * 0.12);
    o.stop(t + 1.3);
  }
}
