/**
 * Rest-timer alarm as an audio file.
 *
 * iPhone suspends JavaScript timers when the screen locks, but audio that is already playing keeps
 * going. So instead of waiting for a timer to fire, the app plays ONE file that is silent for the
 * whole rest and ends with three beeps. The beeps arrive on time with the phone locked, with no
 * code running. Pure: builds the bytes of an 8-bit mono WAV; the browser side lives in
 * `features/train/restAudio.ts`.
 */

export const WAV_RATE = 8000;
const BEEP_HZ = 1046;
const BEEP_ON_SEC = 0.22;
const BEEP_GAP_SEC = 0.14;
const BEEP_COUNT = 3;
const FADE_SEC = 0.01;
const SILENCE = 128; // 8-bit unsigned PCM midpoint

/** Length of the beep burst appended after the silence, seconds. */
export const BEEP_TOTAL_SEC = BEEP_COUNT * BEEP_ON_SEC + (BEEP_COUNT - 1) * BEEP_GAP_SEC;

function beepBurst(): Uint8Array {
  const n = Math.round(BEEP_TOTAL_SEC * WAV_RATE);
  const out = new Uint8Array(n).fill(SILENCE);
  const on = Math.round(BEEP_ON_SEC * WAV_RATE);
  const fade = Math.round(FADE_SEC * WAV_RATE);
  for (let b = 0; b < BEEP_COUNT; b++) {
    const start = Math.round(b * (BEEP_ON_SEC + BEEP_GAP_SEC) * WAV_RATE);
    for (let i = 0; i < on; i++) {
      const env = Math.min(1, i / fade, (on - 1 - i) / fade);
      const v = Math.sin((2 * Math.PI * BEEP_HZ * i) / WAV_RATE) * 0.9 * env;
      out[start + i] = Math.round(SILENCE + v * 127);
    }
  }
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
  const beeps = beepBurst();
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
