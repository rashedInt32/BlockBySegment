import { $, el, toast } from '../shared/dom.js';
import { iconEl, ICON_TRASH } from '../shared/icons.js';
import { request, getState, getHistory } from '../shared/messages.js';
import { parseDomainList } from '../shared/domains.js';
import { formatDayLabel } from '../shared/time.js';
import { SEGMENT_COUNTS, SEGMENT_HOURS, type SegmentCount, type SiteRule } from '../shared/types.js';

const createPinSec = $('#create-pin');
const unlockSec = $('#unlock');
const mainSec = $('#main');

const createPinForm = $<HTMLFormElement>('#create-pin-form');
const newPin1 = $<HTMLInputElement>('#new-pin-1');
const newPin2 = $<HTMLInputElement>('#new-pin-2');

const unlockForm = $<HTMLFormElement>('#unlock-form');
const unlockPin = $<HTMLInputElement>('#unlock-pin');

const pauseToggle = $<HTMLInputElement>('#pause-toggle');
const rulesBody = $('#rules-body');
const noRules = $('#no-rules');

const addDomains = $<HTMLTextAreaElement>('#add-domains');
const addSegments = $<HTMLSelectElement>('#add-segments');
const addMinutes = $<HTMLInputElement>('#add-minutes');
const addBtn = $('#add-btn');
const addHint = $('#add-hint');

const saveBtn = $<HTMLButtonElement>('#save-btn');
const dirtyNote = $('#dirty-note');
const historyBox = $('#history');
const changePinBtn = $('#changepin-btn');
const changePinSec = $('#changepin');
const changePinForm = $<HTMLFormElement>('#changepin-form');
const cpOld = $<HTMLInputElement>('#cp-old');
const cpNew1 = $<HTMLInputElement>('#cp-new1');
const cpNew2 = $<HTMLInputElement>('#cp-new2');

let parentPin: string | null = null;
let rules: SiteRule[] = [];
let dirty = false;

function maxMinutes(segments: SegmentCount): number {
  return SEGMENT_HOURS[segments] * 60;
}

function segmentLabel(n: SegmentCount): string {
  return `${n} segments (${SEGMENT_HOURS[n]}h each)`;
}

function fillSegmentSelect(select: HTMLSelectElement, selected: SegmentCount): void {
  select.replaceChildren(
    ...SEGMENT_COUNTS.map((n) => el('option', { value: String(n), textContent: segmentLabel(n), selected: n === selected })),
  );
}

function setDirty(v: boolean): void {
  dirty = v;
  dirtyNote.classList.toggle('hidden', !v);
}

// ---- screen switching ----------------------------------------------------

function show(screen: 'create' | 'unlock' | 'main'): void {
  createPinSec.classList.toggle('hidden', screen !== 'create');
  unlockSec.classList.toggle('hidden', screen !== 'unlock');
  mainSec.classList.toggle('hidden', screen !== 'main');
}

// ---- rules list ----------------------------------------------------------

function renderRules(): void {
  rulesBody.replaceChildren(
    ...rules.map((rule) => {
      const segSel = el('select');
      fillSegmentSelect(segSel, rule.segments);
      const minInput = el('input', { type: 'number', min: '1', value: String(rule.budgetMinutes) });
      const maxHint = el('span', { className: 'max-hint', textContent: `max ${maxMinutes(rule.segments)} min` });

      segSel.addEventListener('change', () => {
        rule.segments = Number(segSel.value) as SegmentCount;
        const mx = maxMinutes(rule.segments);
        minInput.max = String(mx);
        maxHint.textContent = `max ${mx} min`;
        if (rule.budgetMinutes > mx) {
          rule.budgetMinutes = mx;
          minInput.value = String(mx);
        }
        setDirty(true);
      });
      minInput.max = String(maxMinutes(rule.segments));
      minInput.addEventListener('change', () => {
        let v = Math.round(Number(minInput.value));
        const mx = maxMinutes(rule.segments);
        if (!Number.isFinite(v) || v < 1) v = 1;
        if (v > mx) v = mx;
        rule.budgetMinutes = v;
        minInput.value = String(v);
        setDirty(true);
      });

      const del = el('button', { className: 'danger btn-icon', title: 'Remove site', ariaLabel: 'Remove site' }, [
        iconEl(ICON_TRASH),
      ]);
      del.addEventListener('click', () => {
        rules = rules.filter((r) => r.id !== rule.id);
        setDirty(true);
        renderRules();
      });

      return el('div', { className: 'rule-row' }, [
        el('span', { className: 'rule-domain', textContent: rule.domain }),
        segSel,
        el('div', { className: 'rule-allowed' }, [minInput, maxHint]),
        del,
      ]);
    }),
  );
  noRules.classList.toggle('hidden', rules.length > 0);
}

addBtn.addEventListener('click', () => {
  const { valid, invalid } = parseDomainList(addDomains.value);
  const segments = Number(addSegments.value) as SegmentCount;
  let minutes = Math.round(Number(addMinutes.value));
  const mx = maxMinutes(segments);
  if (!Number.isFinite(minutes) || minutes < 1) minutes = 1;
  if (minutes > mx) minutes = mx;

  const existing = new Set(rules.map((r) => r.domain));
  let added = 0;
  let skipped = 0;
  for (const domain of valid) {
    if (existing.has(domain)) {
      skipped++;
      continue;
    }
    existing.add(domain);
    rules.push({ id: crypto.randomUUID(), domain, segments, budgetMinutes: minutes });
    added++;
  }

  const bits: string[] = [];
  if (added) bits.push(`Added ${added}.`);
  if (skipped) bits.push(`${skipped} already listed.`);
  if (invalid.length) bits.push(`Couldn't parse: ${invalid.join(', ')}.`);
  addHint.textContent = bits.join(' ') || 'Nothing to add.';

  if (added) {
    addDomains.value = '';
    setDirty(true);
    renderRules();
  }
});

saveBtn.addEventListener('click', async () => {
  if (!parentPin) return;
  saveBtn.disabled = true;
  const r = await request({ type: 'saveRules', pin: parentPin, rules });
  saveBtn.disabled = false;
  if (!r.ok) {
    toast(r.error, true);
    return;
  }
  toast('Saved');
  setDirty(false);
  await reloadFromBackground();
});

pauseToggle.addEventListener('change', async () => {
  if (!parentPin) return;
  const prev = !pauseToggle.checked;
  const r = await request({ type: 'setPaused', pin: parentPin, paused: pauseToggle.checked });
  if (!r.ok) {
    toast(r.error, true);
    pauseToggle.checked = prev;
  } else {
    toast(pauseToggle.checked ? 'Blocking paused' : 'Blocking resumed');
  }
});

changePinBtn.addEventListener('click', () => changePinSec.classList.toggle('hidden'));
changePinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const oldPin = cpOld.value.trim();
  const n1 = cpNew1.value.trim();
  const n2 = cpNew2.value.trim();
  if (n1 !== n2) {
    toast('New PINs do not match.', true);
    return;
  }
  const r = await request({ type: 'changePin', oldPin, newPin: n1 });
  if (!r.ok) {
    toast(r.error, true);
    return;
  }
  parentPin = n1;
  cpOld.value = cpNew1.value = cpNew2.value = '';
  changePinSec.classList.add('hidden');
  toast('PIN updated');
});

// ---- gate forms ----------------------------------------------------------

createPinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const p1 = newPin1.value.trim();
  const p2 = newPin2.value.trim();
  if (p1 !== p2) {
    toast('PINs do not match.', true);
    return;
  }
  const r = await request({ type: 'setupPin', pin: p1 });
  if (!r.ok) {
    toast(r.error, true);
    return;
  }
  parentPin = p1;
  newPin1.value = newPin2.value = '';
  toast('PIN set');
  await reloadFromBackground();
});

unlockForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pin = unlockPin.value.trim();
  if (!pin) return;
  const r = await request({ type: 'verifyPin', pin });
  if (!r.ok) {
    toast(r.error, true);
    return;
  }
  parentPin = pin;
  unlockPin.value = '';
  await reloadFromBackground();
});

// ---- recent usage --------------------------------------------------------

interface DayTotals {
  seconds: number;
  segments: number;
  blocked: number;
}

async function renderHistory(): Promise<void> {
  const r = await getHistory();
  if (!r.ok) {
    historyBox.replaceChildren();
    return;
  }
  if (r.entries.length === 0) {
    historyBox.replaceChildren(
      el('p', { className: 'muted small', textContent: 'No history yet — totals appear here once a segment ends.' }),
    );
    return;
  }
  const byDay = new Map<string, Map<string, DayTotals>>();
  for (const e of r.entries) {
    let perSite = byDay.get(e.day);
    if (!perSite) byDay.set(e.day, (perSite = new Map()));
    let v = perSite.get(e.domain);
    if (!v) perSite.set(e.domain, (v = { seconds: 0, segments: 0, blocked: 0 }));
    v.seconds += e.seconds;
    v.segments += 1;
    if (e.seconds >= e.budgetSeconds) v.blocked += 1;
  }
  const days = [...byDay.keys()].sort().reverse();
  historyBox.replaceChildren(
    ...days.map((day) => {
      const block = el('div', { className: 'hist-day' }, [
        el('div', { className: 'hist-day-label', textContent: formatDayLabel(day) }),
      ]);
      const sites = [...byDay.get(day)!.entries()].sort((a, b) => b[1].seconds - a[1].seconds);
      for (const [domain, v] of sites) {
        const parts = [`${Math.round(v.seconds / 60)} min`, `${v.segments} segment${v.segments === 1 ? '' : 's'}`];
        if (v.blocked) parts.push(`hit limit ${v.blocked}×`);
        block.append(
          el('div', { className: 'hist-row' }, [
            el('span', { className: 'hist-domain', textContent: domain }),
            el('span', { className: 'spacer' }),
            el('span', { className: 'muted small', textContent: parts.join(' · ') }),
          ]),
        );
      }
      return block;
    }),
  );
}

// ---- bootstrap -----------------------------------------------------------

async function reloadFromBackground(): Promise<void> {
  const r = await getState();
  if (!r.ok) {
    toast('Could not reach the extension.', true);
    return;
  }
  if (!r.pinSet) {
    parentPin = null;
    show('create');
    return;
  }
  if (!parentPin) {
    show('unlock');
    return;
  }
  pauseToggle.checked = r.paused;
  rules = r.rules.map((x) => ({ ...x }));
  setDirty(false);
  renderRules();
  show('main');
  void renderHistory();
}

fillSegmentSelect(addSegments, 4);
addSegments.addEventListener('change', () => {
  const mx = maxMinutes(Number(addSegments.value) as SegmentCount);
  addMinutes.max = String(mx);
  if (Number(addMinutes.value) > mx) addMinutes.value = String(mx);
});
addMinutes.max = String(maxMinutes(4));

window.addEventListener('beforeunload', (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

void reloadFromBackground();
