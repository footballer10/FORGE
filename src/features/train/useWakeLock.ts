import { useEffect } from 'react';

/**
 * Keeps the screen on while `active`. The browser drops the lock whenever the page is hidden,
 * so it is requested again when the page becomes visible. Unsupported browsers do nothing.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const s = await navigator.wakeLock.request('screen');
        if (cancelled) void s.release();
        else sentinel = s;
      } catch {
        // Denied (low power mode, not visible). Retried on the next visibility change.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
