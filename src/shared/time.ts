import { SEGMENT_HOURS, type SegmentCount } from './types.js';

export interface Segment {
  index: number;
  start: number;
  end: number;
  durationMs: number;
}

/**
 * The segment that contains `now`, aligned to local midnight.
 *
 * Note: on DST-transition days the calendar day is 23h or 25h, so the last
 * segment of such a day is slightly shorter/longer. That's acceptable.
 */
export function currentSegment(segments: SegmentCount, now: number = Date.now()): Segment {
  const d = new Date(now);
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const durationMs = SEGMENT_HOURS[segments] * 60 * 60 * 1000;
  const index = Math.floor((now - startOfDay) / durationMs);
  const start = startOfDay + index * durationMs;
  return { index, start, end: start + durationMs, durationMs };
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export function formatClock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Local calendar day key, e.g. "2026-05-13". */
export function localDayKey(epochMs: number): string {
  const d = new Date(epochMs);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function formatDayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}
