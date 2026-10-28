// Move and drill sounds, synthesized with Web Audio: no files to ship or cache,
// and nothing to fetch offline.

export type Sound =
  'move' | 'capture' | 'check' | 'castle' | 'correct' | 'wrong';

/** Which sound a ply makes, read from its SAN: check beats capture beats castle. */
export function soundFor(ply: { san: string; check?: boolean }): Sound {
  if (ply.check || /[+#]$/.test(ply.san)) return 'check';
  if (ply.san.includes('x')) return 'capture';
  if (ply.san.startsWith('O-O')) return 'castle';
  return 'move';
}

type Tone = {
  from: number;
  to?: number;
  /** Seconds. */
  len: number;
  wave: OscillatorType;
  gain: number;
  /** Seconds after the sound starts. */
  at?: number;
};

const SOUNDS: Record<Sound, Tone[]> = {
  move: [{ from: 240, to: 120, len: 0.07, wave: 'triangle', gain: 0.5 }],
  capture: [
    { from: 300, to: 100, len: 0.1, wave: 'square', gain: 0.2 },
    { from: 200, to: 80, len: 0.1, wave: 'triangle', gain: 0.5 },
  ],
  castle: [
    { from: 240, to: 120, len: 0.07, wave: 'triangle', gain: 0.5 },
    { from: 200, to: 100, len: 0.07, wave: 'triangle', gain: 0.5, at: 0.09 },
  ],
  check: [
    { from: 240, to: 120, len: 0.07, wave: 'triangle', gain: 0.5 },
    { from: 880, len: 0.12, wave: 'sine', gain: 0.25, at: 0.05 },
  ],
  correct: [
    { from: 523, len: 0.12, wave: 'sine', gain: 0.35 },
    { from: 784, len: 0.2, wave: 'sine', gain: 0.35, at: 0.1 },
  ],
  wrong: [{ from: 196, to: 130, len: 0.25, wave: 'sawtooth', gain: 0.18 }],
};

let ctx: AudioContext | undefined;

export function play(sound: Sound) {
  try {
    if (typeof AudioContext === 'undefined') return;
    // Made on first use, which follows a click or key: browsers refuse earlier.
    ctx ??= new AudioContext();
    void ctx.resume();
    const t0 = ctx.currentTime;
    for (const { from, to, len, wave, gain, at = 0 } of SOUNDS[sound]) {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      const start = t0 + at;
      osc.type = wave;
      osc.frequency.setValueAtTime(from, start);
      if (to) osc.frequency.exponentialRampToValueAtTime(to, start + len);
      amp.gain.setValueAtTime(gain, start);
      amp.gain.exponentialRampToValueAtTime(0.001, start + len);
      osc.connect(amp).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + len);
    }
  } catch {
    // ponytail: a sound that fails to play is not worth surfacing.
  }
}
