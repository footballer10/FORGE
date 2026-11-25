import { describe, expect, it } from 'vitest';
import { BEEP_TOTAL_SEC, WAV_RATE, buildRestWav, buildSilentWav, wavDurationSec } from './restAudio';

const text = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.slice(at, at + n));

describe('rest alarm audio', () => {
  it('writes a valid 8-bit mono PCM WAV header', () => {
    const w = buildRestWav(2);
    const v = new DataView(w.buffer);
    expect(text(w, 0, 4)).toBe('RIFF');
    expect(text(w, 8, 4)).toBe('WAVE');
    expect(text(w, 12, 4)).toBe('fmt ');
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(WAV_RATE);
    expect(v.getUint16(34, true)).toBe(8);
    expect(text(w, 36, 4)).toBe('data');
    expect(v.getUint32(40, true)).toBe(w.length - 44);
    expect(v.getUint32(4, true)).toBe(w.length - 8);
  });

  it('is silent for the rest, then beeps right at the end', () => {
    const w = buildRestWav(90);
    expect(wavDurationSec(w)).toBeCloseTo(90 + BEEP_TOTAL_SEC, 3);
    const pcm = w.slice(44);
    const beepStart = 90 * WAV_RATE;
    expect(pcm.slice(0, beepStart).every((x) => x === 128)).toBe(true);
    const burst = pcm.slice(beepStart);
    expect(burst.some((x) => Math.abs(x - 128) > 100)).toBe(true); // loud
    // three separate beeps: count silent gaps between sound
    let runs = 0;
    let inSound = false;
    for (const x of burst) {
      const loud = Math.abs(x - 128) > 20;
      if (loud && !inSound) runs++;
      if (loud) inSound = true;
      else if (Math.abs(x - 128) === 0) inSound = false;
    }
    expect(runs).toBeGreaterThanOrEqual(3);
  });

  it('handles tiny and fractional rests and a silent unlock file', () => {
    expect(wavDurationSec(buildRestWav(0))).toBeCloseTo(BEEP_TOTAL_SEC, 3);
    expect(wavDurationSec(buildRestWav(0.5))).toBeCloseTo(0.5 + BEEP_TOTAL_SEC, 2);
    expect(buildSilentWav().slice(44).every((x) => x === 128)).toBe(true);
  });
});
