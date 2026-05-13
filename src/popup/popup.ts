import { $, el, toast } from '../shared/dom.js';
import { iconEl, ICON_LOCK, ICON_UNLOCK } from '../shared/icons.js';
import { request, getState } from '../shared/messages.js';
import { formatDuration, formatClock } from '../shared/time.js';
import type { RuleStatus } from '../shared/types.js';

const settingsBtn = $('#settings-btn');
const parentBtn = $<HTMLButtonElement>('#parent-btn');
const pinBanner = $('#pin-banner');
const pinBannerLink = $('#pin-banner-link');
const pinForm = $<HTMLFormElement>('#pin-form');
const pinInput = $<HTMLInputElement>('#pin-input');
const pinCancel = $('#pin-cancel');
const parentControls = $('#parent-controls');
const pauseToggle = $<HTMLInputElement>('#pause-toggle');
const list = $('#list');
const empty = $('#empty');
const emptyLink = $('#empty-link');

let parentPin: string | null = null; // held in memory only while popup is open
let lastStatuses: RuleStatus[] = [];
let pinSet = false;
let paused = false;

function openOptions(): void {
  chrome.runtime.openOptionsPage();
}
settingsBtn.addEventListener('click', openOptions);
emptyLink.addEventListener('click', openOptions);
pinBannerLink.addEventListener('click', openOptions);

parentBtn.addEventListener('click', () => {
  if (parentPin) {
    // already unlocked -> lock again
    parentPin = null;
    render();
    return;
  }
  if (!pinSet) {
    openOptions();
    return;
  }
  pinForm.classList.toggle('hidden');
  if (!pinForm.classList.contains('hidden')) pinInput.focus();
});
pinCancel.addEventListener('click', () => {
  pinForm.classList.add('hidden');
  pinInput.value = '';
});
pinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pin = pinInput.value.trim();
  if (!pin) return;
  const r = await request({ type: 'verifyPin', pin });
  if (r.ok) {
    parentPin = pin;
    pinForm.classList.add('hidden');
    pinInput.value = '';
    toast('Unlocked');
    render();
  } else {
    toast(r.ok === false ? r.error : 'Incorrect PIN', true);
  }
});

pauseToggle.addEventListener('change', async () => {
  if (!parentPin) return;
  const r = await request({ type: 'setPaused', pin: parentPin, paused: pauseToggle.checked });
  if (!r.ok) {
    toast(r.error, true);
    pauseToggle.checked = paused;
    return;
  }
  await refresh();
});

async function grantExtra(ruleId: string, minutes: number): Promise<void> {
  if (!parentPin) return;
  const r = await request({ type: 'grantExtra', pin: parentPin, ruleId, minutes });
  if (!r.ok) {
    toast(r.error, true);
    return;
  }
  toast(`+${minutes} min granted`);
  await refresh();
}

function statusPill(s: RuleStatus): HTMLElement {
  if (s.blocked) return el('span', { className: 'pill blocked', textContent: 'Blocked' });
  if (s.remainingSeconds <= 300) return el('span', { className: 'pill warn', textContent: 'Low' });
  return el('span', { className: 'pill ok', textContent: 'Active' });
}

function renderSite(s: RuleStatus): HTMLElement {
  const card = el('div', { className: 'card site' });

  const top = el('div', { className: 'site-top' }, [
    el('span', { className: 'site-domain', textContent: s.rule.domain }),
    el('span', { className: 'spacer' }),
    statusPill(s),
  ]);
  card.append(top);

  const pct = s.budgetSeconds > 0 ? Math.min(100, (s.usedSeconds / s.budgetSeconds) * 100) : 0;
  const barCls = s.blocked ? 'bar blocked' : s.remainingSeconds <= 300 ? 'bar warn' : 'bar';
  const fill = el('span');
  fill.style.width = `${pct}%`;
  card.append(el('div', { className: barCls }, [fill]));

  const usedMin = Math.round(s.usedSeconds / 60);
  const budgetMin = Math.round(s.budgetSeconds / 60);
  const meta = el('div', { className: 'site-meta' });
  meta.append(
    el('span', { textContent: 'Used ' }),
    el('b', { textContent: `${usedMin}/${budgetMin} min` }),
  );
  if (s.blocked) {
    meta.append(
      el('span', { textContent: ' · unlocks ' }),
      el('b', { textContent: formatClock(s.segmentEnd) }),
      el('span', { textContent: ` (in ${formatDuration((s.segmentEnd - Date.now()) / 1000)})` }),
    );
  } else {
    meta.append(
      el('span', { textContent: ' · ' }),
      el('b', { textContent: `${formatDuration(s.remainingSeconds)} left` }),
      el('span', { textContent: ' this segment' }),
    );
  }
  card.append(meta);

  if (parentPin) {
    const extra = el('div', { className: 'site-extra' }, [el('span', { className: 'label', textContent: 'Give more' })]);
    for (const m of [15, 30, 60]) {
      const b = el('button', { textContent: `+${m}m` });
      b.addEventListener('click', () => void grantExtra(s.rule.id, m));
      extra.append(b);
    }
    card.append(extra);
  }
  return card;
}

function render(): void {
  parentBtn.replaceChildren(
    iconEl(parentPin ? ICON_LOCK : ICON_UNLOCK),
    el('span', { textContent: parentPin ? 'Lock' : 'Parent' }),
  );
  pinBanner.classList.toggle('hidden', pinSet);
  parentControls.classList.toggle('hidden', !parentPin);
  pauseToggle.checked = paused;

  list.replaceChildren(...lastStatuses.map(renderSite));
  empty.classList.toggle('hidden', lastStatuses.length > 0);
}

async function refresh(): Promise<void> {
  const r = await getState();
  if (!r.ok) {
    toast('Could not reach the extension.', true);
    return;
  }
  pinSet = r.pinSet;
  paused = r.paused;
  lastStatuses = r.statuses.slice().sort((a, b) => a.rule.domain.localeCompare(b.rule.domain));
  render();
}

void refresh();
// Refresh data periodically; re-render every second so countdowns tick.
setInterval(() => void refresh(), 5000);
setInterval(render, 1000);
