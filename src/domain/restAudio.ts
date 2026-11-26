/**
 * Rest-timer alarm as an audio file.
 *
 * iPhone suspends JavaScript timers when the screen locks, but audio that is already playing keeps
 * going. So instead of waiting for a timer to fire, the app plays ONE file that is silent for the
 * whole rest and ends with a boxing bell. The beeps arrive on time with the phone locked, with no
 * code running. Pure: builds the bytes of an 8-bit mono WAV; the browser side lives in
 * `features/train/restAudio.ts`.
 */

export const WAV_RATE = 11025;
const SILENCE = 128; // 8-bit unsigned PCM midpoint

/**
 * Boxing-bell sound (like the "ding ding ding" at the end of a round, which is what Strong plays):
 * three quick strikes of a bright bell. Each strike is a few inharmonic partials with fast attack and
 * exponential decay, the way a struck metal bell sounds, rather than a pure beep.
 */
const BELL_HZ = 1180;
const BELL_PARTIALS: readonly { ratio: number; amp: number; decaySec: number }[] = [
  { ratio: 1, amp: 1, decaySec: 0.55 },
  { ratio: 2.32, amp: 0.55, decaySec: 0.32 },
  { ratio: 3.86, amp: 0.3, decaySec: 0.2 },
];
export const BELL_STRIKES = 3;
export const BELL_GAP_SEC = 0.32;
const BELL_TAIL_SEC = 1.1;
/** Length of the bell sound appended after the silence, seconds. */
export const BELL_TOTAL_SEC = (BELL_STRIKES - 1) * BELL_GAP_SEC + BELL_TAIL_SEC;
/** Kept for callers of the old name. */
export const BEEP_TOTAL_SEC = BELL_TOTAL_SEC;

function bell(): Uint8Array {
  const n = Math.round(BELL_TOTAL_SEC * WAV_RATE);
  const mix = new Float32Array(n);
  const attack = Math.round(0.002 * WAV_RATE);
  for (let k = 0; k < BELL_STRIKES; k++) {
    const start = Math.round(k * BELL_GAP_SEC * WAV_RATE);
    for (let i = 0; start + i < n; i++) {
      const t = i / WAV_RATE;
      const rise = i < attack ? i / attack : 1;
      let v = 0;
      for (const p of BELL_PARTIALS) v += p.amp * Math.exp(-t / p.decaySec) * Math.sin(2 * Math.PI * BELL_HZ * p.ratio * t);
      mix[start + i]! += rise * v;
    }
  }
  let peak = 0;
  for (const v of mix) peak = Math.max(peak, Math.abs(v));
  const out = new Uint8Array(n);
  const gain = peak > 0 ? 0.95 / peak : 0;
  for (let i = 0; i < n; i++) out[i] = Math.max(0, Math.min(255, Math.round(SILENCE + mix[i]! * gain * 127)));
  return out;
}

function wav(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(44 + data.length);
  const view = new DataView(out.buffer);
  const ascii = (at: number, text: string) => [...text].forEach((c, i) => (out[at + i] = c.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + data.length, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, WAV_RATE, true);
  view.setUint32(28, WAV_RATE, true); // byte rate (1 byte per sample)
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, data.length, true);
  out.set(data, 44);
  return out;
}

/** Silence for `silenceSec`, then the beeps. The beeps START exactly `silenceSec` into the file. */
export function buildRestWav(silenceSec: number): Uint8Array {
  const lead = new Uint8Array(Math.max(0, Math.round(silenceSec * WAV_RATE))).fill(SILENCE);
  const beeps = bell();
  const data = new Uint8Array(lead.length + beeps.length);
  data.set(lead, 0);
  data.set(beeps, lead.length);
  return wav(data);
}

/** A short silent file, played once on the first tap to unlock audio playback on iOS. */
export function buildSilentWav(sec = 0.1): Uint8Array {
  return wav(new Uint8Array(Math.max(1, Math.round(sec * WAV_RATE))).fill(SILENCE));
}

/** Playing time of a file made by this module, seconds. */
export function wavDurationSec(bytes: Uint8Array): number {
  return (bytes.length - 44) / WAV_RATE;
}

/** The bell on its own, for when the app is open and the long file was interrupted. */
export function buildBellWav(): Uint8Array {
  return buildRestWav(0);
}
