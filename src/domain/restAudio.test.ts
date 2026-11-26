import { describe, expect, it } from 'vitest';
import { BEEP_TOTAL_SEC, BELL_GAP_SEC, BELL_STRIKES, BELL_TOTAL_SEC, WAV_RATE, buildBellWav, buildRestWav, buildSilentWav, wavDurationSec } from './restAudio';

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

  it('is silent for the rest, then rings a three-strike bell right at the end', () => {
    const w = buildRestWav(90);
    expect(wavDurationSec(w)).toBeCloseTo(90 + BEEP_TOTAL_SEC, 2);
    const pcm = w.slice(44);
    const start = 90 * WAV_RATE;
    expect(pcm.slice(0, start).every((x) => x === 128)).toBe(true);
    const loudAround = (sec: number) => pcm.slice(start + Math.round(sec * WAV_RATE), start + Math.round((sec + 0.03) * WAV_RATE)).some((x) => Math.abs(x - 128) > 90);
    for (let k = 0; k < BELL_STRIKES; k++) expect(loudAround(k * BELL_GAP_SEC)).toBe(true);
    // and it decays: the last 50 ms are much quieter than a strike
    const tail = pcm.slice(pcm.length - Math.round(0.05 * WAV_RATE));
    expect(tail.every((x) => Math.abs(x - 128) < 40)).toBe(true);
    expect(wavDurationSec(buildBellWav())).toBeCloseTo(BELL_TOTAL_SEC, 2);
  });

  it('handles tiny and fractional rests and a silent unlock file', () => {
    expect(wavDurationSec(buildRestWav(0))).toBeCloseTo(BEEP_TOTAL_SEC, 3);
    expect(wavDurationSec(buildRestWav(0.5))).toBeCloseTo(0.5 + BEEP_TOTAL_SEC, 2);
    expect(buildSilentWav().slice(44).every((x) => x === 128)).toBe(true);
  });
});
