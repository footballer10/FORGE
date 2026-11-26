import { buildBellWav, buildRestWav, buildSilentWav } from '../../domain/restAudio';

/**
 * Browser side of the rest alarm. One persistent <audio> element plays a generated file that is
 * silent for the rest and beeps at the end (see domain/restAudio.ts), so the beeps still sound
 * with the screen locked. iOS only lets an element play after a tap, so `unlockRestAudio` runs on
 * the first tap anywhere and later plays on the same element are allowed.
 */

export type RestAlert = 'off' | 'mix' | 'priority';
const KEY = 'forge.restAlert';

export const REST_ALERT_LABELS: Record<RestAlert, string> = {
  off: 'Off',
  mix: 'Sound (over your music, while the screen is on)',
  priority: 'Loud (also when locked; pauses music)',
};

export function getRestAlert(): RestAlert {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'off' || v === 'priority' ? v : 'mix';
  } catch {
    return 'mix';
  }
}

export function setRestAlert(v: RestAlert): void {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* storage unavailable: setting lasts for this session only */
  }
  if (v === 'off') stopRestAudio(true);
}

let el: HTMLAudioElement | null = null;
/** Separate element for the plain bell, rung when the app is open and the long file did not play. */
let bellEl: HTMLAudioElement | null = null;
let bellUrl: string | null = null;
let url: string | null = null;
let endMs = 0;
let unlocked = false;

const element = (): HTMLAudioElement => (el ??= new Audio());

function load(bytes: Uint8Array): void {
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'audio/wav' }));
  element().src = url;
}

/** 'ambient' mixes with other audio; 'playback' ignores the silent switch but interrupts music. */
function setSession(mode: RestAlert): void {
  try {
    const s = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (s) s.type = mode === 'priority' ? 'playback' : 'ambient';
  } catch {
    /* not supported: the browser default applies */
  }
}

function lockScreenLabel(): void {
  try {
    if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new MediaMetadata({ title: 'Rest timer', artist: 'Forge' });
    }
  } catch {
    /* cosmetic only */
  }
}

/** Call from a tap handler. Safe to call repeatedly. */
export async function unlockRestAudio(): Promise<void> {
  if (unlocked || typeof Audio === 'undefined') return;
  unlocked = true;
  try {
    setSession(getRestAlert());
    load(buildSilentWav());
    await element().play();
    // Unlock the bell element with the same tap, and preload the bell.
    bellEl ??= new Audio();
    bellUrl ??= URL.createObjectURL(new Blob([buildBellWav() as BlobPart], { type: 'audio/wav' }));
    bellEl.src = bellUrl;
    bellEl.muted = true;
    await bellEl.play().catch(() => undefined);
    bellEl.pause();
    bellEl.muted = false;
    bellEl.currentTime = 0;
  } catch {
    unlocked = false; // try again on the next tap
  }
}

/**
 * Match the audio to the rest timer: schedule the beeps for `endsAt`, or stop when it is cleared.
 * When the timer has just run out, the beeps are already playing, so a clear does not cut them off.
 */
export function syncRestAudio(endsAt: string | undefined, nowMs = Date.now()): void {
  if (typeof Audio === 'undefined') return;
  if (!endsAt) {
    stopRestAudio(false, nowMs);
    return;
  }
  const mode = getRestAlert();
  if (mode === 'off') return;
  const ends = Date.parse(endsAt);
  const remaining = (ends - nowMs) / 1000;
  if (remaining <= 0) return;
  endMs = ends;
  setSession(mode);
  lockScreenLabel();
  load(buildRestWav(remaining));
  void element().play().catch(() => undefined); // blocked until the first tap; silent fallback
}

export function stopRestAudio(force = false, nowMs = Date.now()): void {
  if (!el || !endMs) return;
  if (!force && nowMs >= endMs - 300) return; // beeps are sounding: let them finish
  el.pause();
  el.removeAttribute('src');
  el.load();
  endMs = 0;
}

/** Settings "Test": beeps after `delaySec` so the phone can be locked first. */
export function testRestAudio(delaySec = 10): void {
  const mode = getRestAlert();
  if (mode === 'off') return;
  void unlockRestAudio();
  syncRestAudio(new Date(Date.now() + delaySec * 1000).toISOString());
}

/**
 * Called by the on-screen timer when a rest ends while the app is visible. If the long file is playing
 * its bell right now, do nothing (no double ring); otherwise ring the bell directly. This covers the
 * cases where iOS stopped or never started the long file.
 */
export function ringIfSilent(): void {
  if (getRestAlert() === 'off' || !bellEl) return;
  const longPlaying = !!el && !el.paused && !el.ended && el.currentTime > 0;
  if (longPlaying) return;
  try {
    bellEl.currentTime = 0;
    void bellEl.play().catch(() => undefined);
  } catch {
    /* nothing more to try */
  }
}
