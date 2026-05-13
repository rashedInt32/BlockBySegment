import {
  DEFAULT_PIN_GUARD,
  DEFAULT_SETTINGS,
  type PinGuard,
  type Settings,
  type TrackingState,
  type UsageEntry,
  type UsageHistoryEntry,
  type UsageMap,
} from './types.js';
import { currentSegment } from './time.js';

const SETTINGS_KEY = 'settings';
const USAGE_KEY = 'usage';
const TRACKING_KEY = 'tracking';
const HISTORY_KEY = 'history';
const PIN_GUARD_KEY = 'pinGuard';

export async function getSettings(): Promise<Settings> {
  const got = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(got[SETTINGS_KEY] as Partial<Settings> | undefined) };
}

export async function setSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function getUsage(): Promise<UsageMap> {
  const got = await chrome.storage.local.get(USAGE_KEY);
  return (got[USAGE_KEY] as UsageMap | undefined) ?? {};
}

export async function setUsage(usage: UsageMap): Promise<void> {
  await chrome.storage.local.set({ [USAGE_KEY]: usage });
}

export async function getTracking(): Promise<TrackingState> {
  const got = await chrome.storage.local.get(TRACKING_KEY);
  return (got[TRACKING_KEY] as TrackingState | undefined) ?? { ruleId: null, lastTickMs: Date.now() };
}

export async function setTracking(tracking: TrackingState): Promise<void> {
  await chrome.storage.local.set({ [TRACKING_KEY]: tracking });
}

export async function getHistory(): Promise<UsageHistoryEntry[]> {
  const got = await chrome.storage.local.get(HISTORY_KEY);
  return (got[HISTORY_KEY] as UsageHistoryEntry[] | undefined) ?? [];
}

export async function setHistory(history: UsageHistoryEntry[]): Promise<void> {
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
}

export async function getPinGuard(): Promise<PinGuard> {
  const got = await chrome.storage.local.get(PIN_GUARD_KEY);
  return { ...DEFAULT_PIN_GUARD, ...(got[PIN_GUARD_KEY] as Partial<PinGuard> | undefined) };
}

export async function setPinGuard(guard: PinGuard): Promise<void> {
  await chrome.storage.local.set({ [PIN_GUARD_KEY]: guard });
}

export function freshUsageEntry(segmentStart: number): UsageEntry {
  return { segmentStart, secondsUsed: 0, bonusSeconds: 0, warned5: false, warned1: false };
}

/**
 * Return the usage entry for `rule`'s current segment, resetting it if the
 * stored entry belongs to an earlier segment. Mutates and returns `usage`.
 */
export function usageForCurrentSegment(
  usage: UsageMap,
  ruleId: string,
  segments: 2 | 4 | 6 | 8 | 12,
  now: number = Date.now(),
): UsageEntry {
  const seg = currentSegment(segments, now);
  const existing = usage[ruleId];
  if (!existing || existing.segmentStart !== seg.start) {
    const entry = freshUsageEntry(seg.start);
    usage[ruleId] = entry;
    return entry;
  }
  return existing;
}
