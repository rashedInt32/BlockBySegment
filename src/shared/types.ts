/** How many equal segments the 24h day is divided into. */
export type SegmentCount = 2 | 4 | 6 | 8 | 12;

export const SEGMENT_COUNTS: SegmentCount[] = [2, 4, 6, 8, 12];

/** Hours per segment for a given segment count. */
export const SEGMENT_HOURS: Record<SegmentCount, number> = {
  2: 12,
  4: 6,
  6: 4,
  8: 3,
  12: 2,
};

/** A site the parent has chosen to limit. */
export interface SiteRule {
  id: string;
  /** Registrable domain, e.g. "youtube.com". Matches the domain and all subdomains. */
  domain: string;
  segments: SegmentCount;
  /** Allowed active minutes per segment. */
  budgetMinutes: number;
}

/** Per-rule usage for the segment that is currently in progress. */
export interface UsageEntry {
  /** Epoch ms of the start of the segment this entry is for. Stale entries are reset. */
  segmentStart: number;
  /** Active seconds spent on the site during this segment. */
  secondsUsed: number;
  /** Bonus seconds granted by the parent for this segment. */
  bonusSeconds: number;
  /** Whether the "5 minutes left" / "1 minute left" notices already fired this segment. */
  warned5: boolean;
  warned1: boolean;
}

export interface Settings {
  schemaVersion: number;
  /** SHA-256 hex of (salt + pin). null until the parent sets a PIN. */
  pinHash: string | null;
  pinSalt: string | null;
  rules: SiteRule[];
  /** When true, nothing is blocked (parent override). */
  paused: boolean;
}

export type UsageMap = Record<string, UsageEntry>;

/** In-memory + persisted pointer to whichever rule is currently being timed. */
export interface TrackingState {
  ruleId: string | null;
  /** Epoch ms of the last accounting tick. */
  lastTickMs: number;
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  pinHash: null,
  pinSalt: null,
  rules: [],
  paused: false,
};

/** Failed-PIN-attempt tracking for lockout/backoff. */
export interface PinGuard {
  fails: number;
  /** Epoch ms until which PIN entry is locked. 0 = not locked. */
  lockUntil: number;
}

export const DEFAULT_PIN_GUARD: PinGuard = { fails: 0, lockUntil: 0 };

/** One archived segment's usage, kept for the recent-history view. */
export interface UsageHistoryEntry {
  /** Local YYYY-MM-DD of the segment's start. */
  day: string;
  ruleId: string;
  domain: string;
  segmentStart: number;
  /** Active seconds used during that segment. */
  seconds: number;
  /** Budget that applied (including any parent bonus). */
  budgetSeconds: number;
}

/** Status of one rule, as shown in the popup / blocked page. */
export interface RuleStatus {
  rule: SiteRule;
  usedSeconds: number;
  budgetSeconds: number;
  bonusSeconds: number;
  remainingSeconds: number;
  blocked: boolean;
  /** Epoch ms when the current segment ends (and the budget resets). */
  segmentEnd: number;
  segmentIndex: number;
}
