import type { RuleStatus, SiteRule, UsageHistoryEntry } from './types.js';

export type Message =
  | { type: 'getState' }
  | { type: 'getHistory' }
  | { type: 'heartbeat' }
  | { type: 'verifyPin'; pin: string }
  | { type: 'setupPin'; pin: string }
  | { type: 'changePin'; oldPin: string; newPin: string }
  | { type: 'saveRules'; pin: string; rules: SiteRule[] }
  | { type: 'setPaused'; pin: string; paused: boolean }
  | { type: 'grantExtra'; pin: string; ruleId: string; minutes: number };

export interface StateResponse {
  ok: true;
  pinSet: boolean;
  paused: boolean;
  rules: SiteRule[];
  statuses: RuleStatus[];
}

export interface HistoryResponse {
  ok: true;
  entries: UsageHistoryEntry[];
}

export type OkResponse = { ok: true };
export type ErrResponse = { ok: false; error: string };

export type Response = StateResponse | HistoryResponse | OkResponse | ErrResponse;

export async function request(message: Message): Promise<Response> {
  try {
    return (await chrome.runtime.sendMessage(message)) as Response;
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function getState(): Promise<StateResponse | ErrResponse> {
  const r = await request({ type: 'getState' });
  if (r.ok && 'statuses' in r) return r;
  return r.ok ? { ok: false, error: 'unexpected response' } : r;
}

export async function getHistory(): Promise<HistoryResponse | ErrResponse> {
  const r = await request({ type: 'getHistory' });
  if (r.ok && 'entries' in r) return r;
  return r.ok ? { ok: false, error: 'unexpected response' } : r;
}
