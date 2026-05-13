import type { RuleStatus, SiteRule, UsageMap } from './types.js';
import { currentSegment } from './time.js';
import { usageForCurrentSegment } from './storage.js';

/** Compute the live status of one rule. Mutates `usage` only to reset stale segments. */
export function statusForRule(rule: SiteRule, usage: UsageMap, now: number = Date.now()): RuleStatus {
  const seg = currentSegment(rule.segments, now);
  const entry = usageForCurrentSegment(usage, rule.id, rule.segments, now);
  const budgetSeconds = rule.budgetMinutes * 60 + entry.bonusSeconds;
  const usedSeconds = entry.secondsUsed;
  const remainingSeconds = Math.max(0, budgetSeconds - usedSeconds);
  return {
    rule,
    usedSeconds,
    budgetSeconds,
    bonusSeconds: entry.bonusSeconds,
    remainingSeconds,
    blocked: usedSeconds >= budgetSeconds,
    segmentEnd: seg.end,
    segmentIndex: seg.index,
  };
}

export function statusForAll(rules: SiteRule[], usage: UsageMap, now: number = Date.now()): RuleStatus[] {
  return rules.map((r) => statusForRule(r, usage, now));
}
