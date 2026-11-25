import { CHANGED_EVENT } from './repositories/base';
import { syncRepo } from './repositories/sync';

/** Wait this long after the last change before syncing, so one workout is one sync, not fifty. */
export const SYNC_DEBOUNCE_MS = 8_000;
const MIN_GAP_MS = 60_000;
const POLL_MS = 5 * 60_000;

/**
 * Keeps the cloud copy fresh so the Claude connector sees recent training without anyone tapping
 * "Sync now". Does nothing until sync is set up in Settings. Triggers: shortly after any change,
 * when the app comes back to the foreground, when the network returns, and every 5 minutes while open.
 * Returns a function that stops it.
 */
export function startAutoSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = 0;
  let running = false;

  const run = async () => {
    if (running || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    running = true;
    try {
      if ((await syncRepo.status()).configured) await syncRepo.sync();
    } catch {
      /* sync() records its own errors; nothing to do here */
    } finally {
      running = false;
      last = Date.now();
    }
  };
  const schedule = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => void run(), ms);
  };
  const onChange = () => schedule(SYNC_DEBOUNCE_MS);
  const onVisible = () => {
    if (document.visibilityState === 'visible' && Date.now() - last > MIN_GAP_MS) schedule(500);
  };
  const onOnline = () => schedule(1_000);
  const poll = setInterval(() => {
    if (document.visibilityState === 'visible') schedule(500);
  }, POLL_MS);

  window.addEventListener(CHANGED_EVENT, onChange);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  schedule(3_000);
  return () => {
    clearTimeout(timer);
    clearInterval(poll);
    window.removeEventListener(CHANGED_EVENT, onChange);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
  };
}
