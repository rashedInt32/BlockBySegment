import {
  DEFAULT_SETTINGS,
  SEGMENT_COUNTS,
  SEGMENT_HOURS,
  type RuleStatus,
  type SegmentCount,
  type Settings,
  type SiteRule,
} from '../shared/types.js';
import {
  getSettings,
  setSettings,
  getUsage,
  setUsage,
  getTracking,
  setTracking,
  getHistory,
  setHistory,
  getPinGuard,
  setPinGuard,
  usageForCurrentSegment,
} from '../shared/storage.js';
import { currentSegment, localDayKey } from '../shared/time.js';
import { statusForAll } from '../shared/status.js';
import { hostMatchesDomain, normalizeDomainInput } from '../shared/domains.js';
import { hashPin, randomSalt, safeEqual, isValidPinFormat } from '../shared/pin.js';
import type { Message, Response } from '../shared/messages.js';

const HISTORY_DAYS = 14;
const HEARTBEAT_CS_ID = 'bbs-heartbeat';

/** Hard cap on a single accounting delta. Protects against sleep/wake gaps. */
const MAX_DELTA_MS = 90_000;
const TICK_ALARM = 'tick';

// SW-lifetime state. Re-derived on spin-up; defaults are the safe "browser in use" case.
let browserFocused = true;
let idleState: chrome.idle.IdleState = 'active';

// ---------------------------------------------------------------------------
// Recompute pipeline (serialized so overlapping events can't race storage)
// ---------------------------------------------------------------------------

let chain: Promise<void> = Promise.resolve();
function recompute(): Promise<void> {
  chain = chain.then(doRecompute, doRecompute);
  return chain;
}

async function doRecompute(): Promise<void> {
  const now = Date.now();
  const settings = await getSettings();
  const usage = await getUsage();
  const tracking = await getTracking();

  const ruleById = new Map(settings.rules.map((r) => [r.id, r] as const));

  // Drop usage rows whose rule no longer exists.
  for (const id of Object.keys(usage)) if (!ruleById.has(id)) delete usage[id];

  // 0b. Archive any segment that has rolled over (before it gets reset below).
  const history = await getHistory();
  let historyChanged = false;
  for (const rule of settings.rules) {
    const entry = usage[rule.id];
    if (!entry) continue;
    const seg = currentSegment(rule.segments, now);
    if (entry.segmentStart !== seg.start && entry.secondsUsed >= 1) {
      history.push({
        day: localDayKey(entry.segmentStart),
        ruleId: rule.id,
        domain: rule.domain,
        segmentStart: entry.segmentStart,
        seconds: Math.round(entry.secondsUsed),
        budgetSeconds: rule.budgetMinutes * 60 + entry.bonusSeconds,
      });
      historyChanged = true;
    }
  }
  if (historyChanged) {
    const cutoff = now - HISTORY_DAYS * 24 * 60 * 60 * 1000;
    await setHistory(history.filter((h) => h.segmentStart >= cutoff));
  }

  // 1. Flush the time spent on the previously tracked rule since the last tick.
  const prev = tracking.ruleId ? ruleById.get(tracking.ruleId) : undefined;
  if (prev) {
    const deltaSec = Math.min(Math.max(0, now - tracking.lastTickMs), MAX_DELTA_MS) / 1000;
    if (deltaSec > 0) {
      const entry = usageForCurrentSegment(usage, prev.id, prev.segments, now);
      const budgetSec = prev.budgetMinutes * 60 + entry.bonusSeconds;
      entry.secondsUsed = Math.min(entry.secondsUsed + deltaSec, budgetSec + 5);
      const remaining = budgetSec - entry.secondsUsed;
      if (remaining <= 1 && !entry.warned1) {
        entry.warned1 = entry.warned5 = true;
        notify(`Time's up on ${prev.domain} for this segment.`);
      } else if (remaining <= 60 && !entry.warned1) {
        entry.warned1 = entry.warned5 = true;
        notify(`1 minute left on ${prev.domain} this segment.`);
      } else if (remaining <= 300 && !entry.warned5) {
        entry.warned5 = true;
        notify(`5 minutes left on ${prev.domain} this segment.`);
      }
    }
  }

  // 2. Decide which rule (if any) is being used right now.
  let activeRuleId: string | null = null;
  if (!settings.paused && browserFocused && idleState === 'active') {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const host = hostnameOf(tabs[0]?.url);
    if (host) {
      for (const rule of settings.rules) {
        if (!hostMatchesDomain(host, rule.domain)) continue;
        const entry = usageForCurrentSegment(usage, rule.id, rule.segments, now);
        const budgetSec = rule.budgetMinutes * 60 + entry.bonusSeconds;
        if (entry.secondsUsed < budgetSec) activeRuleId = rule.id;
        break;
      }
    }
  }

  // 3. Persist.
  tracking.ruleId = activeRuleId;
  tracking.lastTickMs = now;
  await setUsage(usage);
  await setTracking(tracking);

  // 4. Reconcile blocking rules + badge.
  const statuses = statusForAll(settings.rules, usage, now);
  const blockedDomains = settings.paused ? [] : statuses.filter((s) => s.blocked).map((s) => s.rule.domain);
  await syncDnrRules(blockedDomains);
  await updateBadge(activeRuleId, statuses);
}

function hostnameOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// declarativeNetRequest reconciliation
// ---------------------------------------------------------------------------

function blockedPageUrl(domain: string): string {
  return chrome.runtime.getURL(`blocked/blocked.html?domain=${encodeURIComponent(domain)}`);
}

async function syncDnrRules(blockedDomains: string[]): Promise<void> {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const existingDomains = new Set<string>();
  for (const r of existing) for (const d of r.condition.requestDomains ?? []) existingDomains.add(d);
  const desired = new Set(blockedDomains);

  const sameSet =
    existingDomains.size === desired.size && [...desired].every((d) => existingDomains.has(d));

  if (!sameSet) {
    const addRules = blockedDomains.map((domain, i) => ({
      id: i + 1,
      priority: 1,
      action: { type: 'redirect', redirect: { extensionPath: `/blocked/blocked.html?domain=${encodeURIComponent(domain)}` } },
      condition: { requestDomains: [domain], resourceTypes: ['main_frame'] },
    })) as unknown as chrome.declarativeNetRequest.Rule[];
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map((r) => r.id),
      addRules,
    });
  }

  // Anything that just became blocked: send its open tabs to the block page now.
  for (const domain of blockedDomains) {
    if (!existingDomains.has(domain)) await redirectTabsForDomain(domain);
  }
}

async function redirectTabsForDomain(domain: string): Promise<void> {
  const target = blockedPageUrl(domain);
  let tabs: chrome.tabs.Tab[];
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return;
  }
  for (const tab of tabs) {
    if (typeof tab.id !== 'number') continue;
    const host = hostnameOf(tab.url);
    if (host && hostMatchesDomain(host, domain)) {
      try {
        await chrome.tabs.update(tab.id, { url: target });
      } catch {
        /* tab closed / not navigable */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Heartbeat content script (registered only on currently-limited domains)
// ---------------------------------------------------------------------------

// Serialized so concurrent callers (init + storage.onChanged) can't race into a
// "Duplicate script ID" error.
let csChain: Promise<void> = Promise.resolve();
function syncContentScripts(domains: string[]): Promise<void> {
  const run = () => doSyncContentScripts(domains);
  csChain = csChain.then(run, run);
  return csChain;
}

async function doSyncContentScripts(domains: string[]): Promise<void> {
  const desired = [...new Set(domains.map((d) => `*://*.${d}/*`))].sort();
  let existing: chrome.scripting.RegisteredContentScript[] = [];
  try {
    existing = await chrome.scripting.getRegisteredContentScripts({ ids: [HEARTBEAT_CS_ID] });
  } catch {
    /* ignore */
  }
  const cur = existing[0];
  const curMatches = (cur?.matches ?? []).slice().sort();
  const same =
    !!cur === desired.length > 0 &&
    curMatches.length === desired.length &&
    curMatches.every((m, i) => m === desired[i]);
  if (same) return; // already in sync

  // Always tear down any existing registration first (ignore "not registered").
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [HEARTBEAT_CS_ID] });
  } catch {
    /* wasn't registered */
  }
  if (desired.length === 0) return;
  try {
    await chrome.scripting.registerContentScripts([
      {
        id: HEARTBEAT_CS_ID,
        js: ['content/heartbeat.js'],
        matches: desired,
        runAt: 'document_idle',
        allFrames: false,
        persistAcrossSessions: true,
      },
    ]);
  } catch (e) {
    console.error('registerContentScripts failed', e);
  }
}

// ---------------------------------------------------------------------------
// Badge + notifications
// ---------------------------------------------------------------------------

async function updateBadge(activeRuleId: string | null, statuses: RuleStatus[]): Promise<void> {
  let text = '';
  let color = '#0a84ff';
  const s = activeRuleId ? statuses.find((x) => x.rule.id === activeRuleId) : undefined;
  if (s) {
    if (s.blocked) {
      text = 'OFF';
      color = '#ff453a';
    } else {
      const mins = Math.ceil(s.remainingSeconds / 60);
      text = mins >= 100 ? `${Math.ceil(mins / 60)}h` : `${mins}m`;
      color = mins <= 5 ? '#ff9f0a' : '#30d158';
    }
  }
  try {
    await chrome.action.setBadgeText({ text });
    if (text) await chrome.action.setBadgeBackgroundColor({ color });
  } catch {
    /* ignore */
  }
}

function notify(message: string): void {
  try {
    chrome.notifications.create(`bbs-${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'BlockBySegment',
      message,
      priority: 1,
    });
  } catch {
    /* notifications may be disabled */
  }
}

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

async function checkPin(settings: Settings, pin: string): Promise<boolean> {
  if (!settings.pinHash || !settings.pinSalt) return false;
  return safeEqual(await hashPin(pin, settings.pinSalt), settings.pinHash);
}

/** Check a PIN with lockout/backoff after repeated failures. */
async function verifyPinGuarded(
  settings: Settings,
  pin: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = Date.now();
  const guard = await getPinGuard();
  if (guard.lockUntil > now) {
    return { ok: false, error: `Too many wrong attempts — wait ${Math.ceil((guard.lockUntil - now) / 1000)}s.` };
  }
  if (await checkPin(settings, pin)) {
    if (guard.fails !== 0 || guard.lockUntil !== 0) await setPinGuard({ fails: 0, lockUntil: 0 });
    return { ok: true };
  }
  const fails = guard.fails + 1;
  // 5th wrong try → 30s lock, doubling each further try, capped at 30 minutes.
  const lockUntil = fails >= 5 ? now + Math.min(30 * 60_000, 30_000 * 2 ** (fails - 5)) : 0;
  await setPinGuard({ fails, lockUntil });
  return {
    ok: false,
    error:
      lockUntil > now
        ? `Too many wrong attempts — locked for ${Math.ceil((lockUntil - now) / 1000)}s.`
        : 'Incorrect PIN.',
  };
}

function sanitizeRules(input: unknown): SiteRule[] | string {
  if (!Array.isArray(input)) return 'Malformed rules.';
  const out: SiteRule[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return 'Malformed rule entry.';
    const r = raw as Record<string, unknown>;
    const domain = normalizeDomainInput(String(r['domain'] ?? ''));
    if (!domain) return `Invalid domain: "${String(r['domain'])}"`;
    if (seen.has(domain)) continue;
    seen.add(domain);
    const segments = Number(r['segments']) as SegmentCount;
    if (!SEGMENT_COUNTS.includes(segments)) return `Pick a segment count for ${domain}.`;
    const maxBudget = SEGMENT_HOURS[segments] * 60;
    let budgetMinutes = Math.round(Number(r['budgetMinutes']));
    if (!Number.isFinite(budgetMinutes) || budgetMinutes < 1) return `Set a valid time budget for ${domain}.`;
    if (budgetMinutes > maxBudget) budgetMinutes = maxBudget;
    const id = typeof r['id'] === 'string' && r['id'] ? (r['id'] as string) : crypto.randomUUID();
    out.push({ id, domain, segments, budgetMinutes });
  }
  return out;
}

async function handleMessage(msg: Message): Promise<Response> {
  switch (msg.type) {
    case 'getState': {
      await recompute();
      const settings = await getSettings();
      const usage = await getUsage();
      return {
        ok: true,
        pinSet: settings.pinHash !== null,
        paused: settings.paused,
        rules: settings.rules,
        statuses: statusForAll(settings.rules, usage),
      };
    }
    case 'getHistory': {
      return { ok: true, entries: await getHistory() };
    }
    case 'heartbeat': {
      void recompute();
      return { ok: true };
    }
    case 'setupPin': {
      const settings = await getSettings();
      if (settings.pinHash) return { ok: false, error: 'A PIN is already set.' };
      if (!isValidPinFormat(msg.pin)) return { ok: false, error: 'PIN must be 4–8 digits.' };
      const salt = randomSalt();
      settings.pinSalt = salt;
      settings.pinHash = await hashPin(msg.pin, salt);
      await setSettings(settings);
      return { ok: true };
    }
    case 'verifyPin': {
      const settings = await getSettings();
      if (!settings.pinHash) return { ok: false, error: 'No PIN is set.' };
      return await verifyPinGuarded(settings, msg.pin);
    }
    case 'changePin': {
      const settings = await getSettings();
      if (!settings.pinHash) return { ok: false, error: 'No PIN is set.' };
      const v = await verifyPinGuarded(settings, msg.oldPin);
      if (!v.ok) return v;
      if (!isValidPinFormat(msg.newPin)) return { ok: false, error: 'New PIN must be 4–8 digits.' };
      const salt = randomSalt();
      settings.pinSalt = salt;
      settings.pinHash = await hashPin(msg.newPin, salt);
      await setSettings(settings);
      return { ok: true };
    }
    case 'saveRules':
    case 'setPaused':
    case 'grantExtra': {
      const settings = await getSettings();
      if (!settings.pinHash) return { ok: false, error: 'Set a parent PIN first.' };
      const v = await verifyPinGuarded(settings, msg.pin);
      if (!v.ok) return v;

      if (msg.type === 'saveRules') {
        const sanitized = sanitizeRules(msg.rules);
        if (typeof sanitized === 'string') return { ok: false, error: sanitized };
        settings.rules = sanitized;
        await setSettings(settings);
        const usage = await getUsage();
        const ids = new Set(sanitized.map((r) => r.id));
        for (const k of Object.keys(usage)) if (!ids.has(k)) delete usage[k];
        await setUsage(usage);
        await recompute();
        return { ok: true };
      }
      if (msg.type === 'setPaused') {
        settings.paused = !!msg.paused;
        await setSettings(settings);
        await recompute();
        return { ok: true };
      }
      // grantExtra
      if (!(Number.isFinite(msg.minutes) && msg.minutes > 0 && msg.minutes <= 24 * 60)) {
        return { ok: false, error: 'Invalid amount of extra time.' };
      }
      const usage = await getUsage();
      const rule = settings.rules.find((r) => r.id === msg.ruleId);
      if (!rule) return { ok: false, error: 'Unknown site.' };
      const entry = usageForCurrentSegment(usage, rule.id, rule.segments);
      entry.bonusSeconds += Math.round(msg.minutes) * 60;
      entry.warned1 = false;
      entry.warned5 = false;
      await setUsage(usage);
      await recompute();
      return { ok: true };
    }
    default:
      return { ok: false, error: 'Unknown message.' };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message as Message)
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true; // async response
});

// ---------------------------------------------------------------------------
// Lifecycle + event wiring
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  try {
    chrome.idle.setDetectionInterval(60);
  } catch {
    /* ignore */
  }
  try {
    idleState = await chrome.idle.queryState(60);
  } catch {
    /* ignore */
  }
  try {
    const w = await chrome.windows.getLastFocused();
    browserFocused = w.focused ?? true;
  } catch {
    /* no window yet */
  }
  await chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  // Seed default settings the first time only (avoids storage churn on every wake).
  const raw = await chrome.storage.local.get('settings');
  if (!raw['settings']) await setSettings({ ...DEFAULT_SETTINGS });
  await syncContentScripts((await getSettings()).rules.map((r) => r.domain));
  await recompute();
}

chrome.runtime.onInstalled.addListener(() => {
  void init();
});
chrome.runtime.onStartup.addListener(() => {
  void init();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM) void recompute();
});
chrome.tabs.onActivated.addListener(() => {
  void recompute();
});
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === 'complete') void recompute();
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  browserFocused = windowId !== chrome.windows.WINDOW_ID_NONE;
  void recompute();
});
chrome.idle.onStateChanged.addListener((state) => {
  idleState = state;
  void recompute();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['settings']) {
    const rules = (changes['settings'].newValue as Settings | undefined)?.rules ?? [];
    void syncContentScripts(rules.map((r) => r.domain));
    void recompute();
  }
});

// Cold-start (module top-level): also runs every time the SW is revived.
void init();
