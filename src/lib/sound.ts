// Move and drill sounds, synthesized with Web Audio: no files to ship or cache,
// and nothing to fetch offline. The moves are modelled on Lichess's standard
// set, which was measured, not copied: a sharp pulse a few milliseconds long,
// then a quiet, woody ring.

export type Sound =
  'move' | 'capture' | 'check' | 'castle' | 'correct' | 'wrong';

/** Which sound a ply makes, read from its SAN: check beats capture beats castle. */
export function soundFor(ply: { san: string; check?: boolean }): Sound {
  if (ply.check || /[+#]$/.test(ply.san)) return 'check';
  if (ply.san.includes('x')) return 'capture';
  if (ply.san.startsWith('O-O')) return 'castle';
  return 'move';
}

/** A sine that falls from one pitch to another, dying away over `len`. */
type Tone = {
  kind: 'tone';
  /** Hz, at the start and the end. */
  freq: [number, number];
  /** Seconds. */
  len: number;
  gain: number;
  /** Seconds after the sound starts. */
  at?: number;
};

/** Noise through a band-pass filter, dying away over `len`. */
type Noise = {
  kind: 'noise';
  freq: number;
  q: number;
  len: number;
  gain: number;
  at?: number;
};

/** A soft marimba-like note: a sine and a quick overtone. */
type Note = {
  kind: 'note';
  freq: number;
  len: number;
  gain: number;
  at?: number;
};

type Voice = Tone | Noise | Note;

/**
 * Lichess's move: a pulse of about 3 ms near 700 Hz, a bright tick near
 * 6 kHz, then a ring 25 to 40 dB down that fades in 60 ms.
 */
const move = (at = 0, gain = 1): Voice[] => [
  { kind: 'tone', at, freq: [700, 480], len: 0.01, gain: 0.9 * gain },
  { kind: 'noise', at, freq: 6000, q: 0.8, len: 0.004, gain: 0.25 * gain },
  { kind: 'noise', at, freq: 600, q: 1.2, len: 0.08, gain: 0.13 * gain },
  { kind: 'tone', at, freq: [290, 270], len: 0.05, gain: 0.03 * gain },
];

const SOUNDS: Record<Sound, Voice[]> = {
  move: move(),
  // Lichess's standard set gives a check no sound of its own.
  check: move(),
  // A capture is a lower, fuller pulse, then a second hit about 35 ms on.
  capture: [
    { kind: 'tone', freq: [220, 150], len: 0.012, gain: 0.8 },
    { kind: 'noise', freq: 2000, q: 0.8, len: 0.01, gain: 0.3 },
    { kind: 'noise', freq: 1800, q: 1, len: 0.09, gain: 0.15 },
    { kind: 'noise', freq: 700, q: 1.2, len: 0.1, gain: 0.1 },
    ...move(0.036, 0.25),
  ],
  castle: [...move(), ...move(0.11, 0.8)],
  // Two soft notes an octave apart, as on Lichess's confirmation.
  correct: [
    { kind: 'note', freq: 290, len: 0.12, gain: 0.3 },
    { kind: 'note', freq: 580, len: 0.35, gain: 0.3, at: 0.1 },
  ],
  // A short, dull, hollow buzz.
  wrong: [
    { kind: 'tone', freq: [226, 220], len: 0.14, gain: 0.35 },
    { kind: 'tone', freq: [657, 650], len: 0.14, gain: 0.12 },
  ],
};

let ctx: AudioContext | undefined;
let noise: AudioBuffer | undefined;

/** Gain that rises in a couple of milliseconds, then dies away: no click at the edges. */
function envelope(
  c: AudioContext,
  start: number,
  len: number,
  peak: number,
): GainNode {
  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.linearRampToValueAtTime(peak, start + Math.min(0.001, len / 4));
  amp.gain.exponentialRampToValueAtTime(0.001, start + len);
  amp.connect(c.destination);
  return amp;
}

function oscillator(
  c: AudioContext,
  start: number,
  len: number,
  peak: number,
  from: number,
  to = from,
) {
  const osc = c.createOscillator();
  osc.frequency.setValueAtTime(from, start);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, start + len);
  osc.connect(envelope(c, start, len, peak));
  osc.start(start);
  osc.stop(start + len);
}

function schedule(c: AudioContext, voice: Voice, t0: number) {
  const start = t0 + (voice.at ?? 0);
  if (voice.kind === 'tone') {
    oscillator(c, start, voice.len, voice.gain, ...voice.freq);
  } else if (voice.kind === 'note') {
    oscillator(c, start, voice.len, voice.gain, voice.freq);
    // The overtone dies sooner than the note, as on a wooden bar.
    oscillator(c, start, voice.len * 0.3, voice.gain * 0.3, voice.freq * 4);
  } else {
    noise ??= (() => {
      const buffer = c.createBuffer(1, c.sampleRate / 5, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      return buffer;
    })();
    const src = c.createBufferSource();
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = voice.freq;
    band.Q.value = voice.q;
    src.buffer = noise;
    src.connect(band).connect(envelope(c, start, voice.len, voice.gain));
    src.start(start, 0, voice.len);
  }
}

export function play(sound: Sound) {
  try {
    if (typeof AudioContext === 'undefined') return;
    // Made on first use, which follows a click or key: browsers refuse earlier.
    ctx ??= new AudioContext();
    void ctx.resume();
    const t0 = ctx.currentTime;
    for (const voice of SOUNDS[sound]) schedule(ctx, voice, t0);
  } catch {
    // ponytail: a sound that fails to play is not worth surfacing.
  }
}
