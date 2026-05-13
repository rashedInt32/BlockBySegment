import { $, toast } from '../shared/dom.js';
import { request, getState } from '../shared/messages.js';
import { formatDuration, formatClock } from '../shared/time.js';
import type { RuleStatus } from '../shared/types.js';

const params = new URLSearchParams(location.search);
const domain = (params.get('domain') ?? '').toLowerCase();

const headline = $('#headline');
const domainEl = $('#domain');
const subEl = $('#sub');
const countdownEl = $('#countdown');
const toggleOverride = $('#toggle-override');
const overrideForm = $<HTMLFormElement>('#override-form');
const ovPin = $<HTMLInputElement>('#ov-pin');
const ovMinutes = $<HTMLSelectElement>('#ov-minutes');

domainEl.textContent = domain || 'this site';

let current: RuleStatus | null = null;

function goToSite(): void {
  if (domain) location.replace(`https://${domain}/`);
}

function renderCountdown(): void {
  if (!current || !current.blocked) return;
  const ms = current.segmentEnd - Date.now();
  if (ms <= 0) {
    countdownEl.textContent = 'Refreshing…';
    return;
  }
  countdownEl.textContent = `Available again at ${formatClock(current.segmentEnd)} — in ${formatDuration(ms / 1000)}`;
}

async function poll(): Promise<void> {
  const r = await getState();
  if (!r.ok) {
    headline.textContent = "Can't reach BlockBySegment";
    subEl.textContent = 'Try reloading the page.';
    return;
  }
  const status = r.statuses.find((s) => s.rule.domain === domain) ?? null;

  if (!status) {
    // No longer limited at all.
    headline.textContent = 'You can visit this site';
    subEl.textContent = '';
    countdownEl.textContent = '';
    goToSite();
    return;
  }
  if (!status.blocked) {
    // Unlocked again (new segment, or parent granted time).
    headline.textContent = "You're good — opening the site…";
    goToSite();
    return;
  }

  current = status;
  headline.textContent = "Time's up for now";
  const usedMin = Math.round(status.usedSeconds / 60);
  const budgetMin = Math.round(status.budgetSeconds / 60);
  subEl.textContent = `You've used your ${budgetMin} minutes here for this segment (used ${usedMin}).`;
  renderCountdown();
}

toggleOverride.addEventListener('click', () => {
  overrideForm.classList.toggle('hidden');
  if (!overrideForm.classList.contains('hidden')) ovPin.focus();
});

overrideForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!current) return;
  const pin = ovPin.value.trim();
  const minutes = Number(ovMinutes.value);
  if (!pin) return;
  const r = await request({ type: 'grantExtra', pin, ruleId: current.rule.id, minutes });
  if (!r.ok) {
    toast(r.error, true);
    return;
  }
  toast(`Unlocked for ${minutes} more minutes`);
  setTimeout(goToSite, 500);
});

void poll();
setInterval(() => void poll(), 10000);
setInterval(renderCountdown, 1000);
