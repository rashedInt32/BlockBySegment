// Injected (via chrome.scripting) only on currently-limited domains.
// It just pings the service worker while the page is in the foreground so the
// background can flush active time at ~15s granularity instead of ~60s, and so
// the segment budget is enforced even on single-page apps that don't reload.

const PING_INTERVAL_MS = 12_000;

function isForeground(): boolean {
  return document.visibilityState === 'visible' && document.hasFocus();
}

function ping(): void {
  try {
    void chrome.runtime.sendMessage({ type: 'heartbeat' })?.catch?.(() => {});
  } catch {
    /* extension reloading / context invalidated */
  }
}

let timer: number | undefined;
function loop(): void {
  if (isForeground()) ping();
  timer = self.setTimeout(loop, PING_INTERVAL_MS);
}

document.addEventListener('visibilitychange', () => {
  if (isForeground()) ping();
});
window.addEventListener('focus', ping);
window.addEventListener('pagehide', ping);

ping();
loop();
