/**
 * Sound cues (design-system §8). Synthesized with Web Audio so the app ships no audio files and
 * works offline; each cue is < 400 ms. Replaceable by sample playback later without changing callers.
 */
export type SoundCue = 'dice' | 'reveal-good' | 'reveal-bad' | 'tick' | 'countdown-end' | 'wheel-stop';

interface Tone {
  frequency: number;
  /** seconds from cue start */
  at: number;
  duration: number;
  type: OscillatorType;
  gain: number;
}

const CUES: Readonly<Record<SoundCue, readonly Tone[]>> = {
  dice: [
    { frequency: 520, at: 0, duration: 0.05, type: 'square', gain: 0.25 },
    { frequency: 660, at: 0.06, duration: 0.05, type: 'square', gain: 0.25 },
    { frequency: 880, at: 0.12, duration: 0.09, type: 'square', gain: 0.3 },
  ],
  'reveal-good': [
    { frequency: 660, at: 0, duration: 0.12, type: 'sine', gain: 0.5 },
    { frequency: 990, at: 0.1, duration: 0.2, type: 'sine', gain: 0.45 },
  ],
  'reveal-bad': [
    { frequency: 220, at: 0, duration: 0.18, type: 'sawtooth', gain: 0.35 },
    { frequency: 165, at: 0.14, duration: 0.24, type: 'sawtooth', gain: 0.35 },
  ],
  tick: [{ frequency: 1200, at: 0, duration: 0.04, type: 'square', gain: 0.2 }],
  'countdown-end': [
    { frequency: 880, at: 0, duration: 0.12, type: 'sine', gain: 0.5 },
    { frequency: 880, at: 0.16, duration: 0.22, type: 'sine', gain: 0.5 },
  ],
  'wheel-stop': [{ frequency: 440, at: 0, duration: 0.3, type: 'triangle', gain: 0.5 }],
};

const ATTACK_SECONDS = 0.005;
const SILENCE = 0.0001;

let context: AudioContext | null = null;
let settings = { enabled: false, volume: 0.6 };
let muted = false;

export function configureSound(next: { enabled: boolean; volume: number }): void {
  settings = next;
}

/** Pause screen silences everything instantly (game-design §19). */
export function setSoundMuted(value: boolean): void {
  muted = value;
  if (muted && context?.state === 'running') void context.suspend().catch(() => undefined);
  if (!muted && context?.state === 'suspended') void context.resume().catch(() => undefined);
}

export function playCue(cue: SoundCue): void {
  if (!settings.enabled || muted || settings.volume <= 0) return;
  try {
    context ??= new AudioContext();
    const start = context.currentTime;
    for (const tone of CUES[cue]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = tone.type;
      oscillator.frequency.value = tone.frequency;
      const peak = tone.gain * settings.volume;
      gain.gain.setValueAtTime(SILENCE, start + tone.at);
      gain.gain.exponentialRampToValueAtTime(peak, start + tone.at + ATTACK_SECONDS);
      gain.gain.exponentialRampToValueAtTime(SILENCE, start + tone.at + tone.duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + tone.at);
      oscillator.stop(start + tone.at + tone.duration + ATTACK_SECONDS);
    }
  } catch (error) {
    // Audio is optional – never break the game over it
    console.warn('[sound] cue failed', error);
  }
}
