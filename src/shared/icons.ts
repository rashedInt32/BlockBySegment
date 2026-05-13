// Inline SVG icons (Feather-style, stroke = currentColor) used across the UI.

const A = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

export const ICON_TRASH = `<svg width="16" height="16" ${A}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
export const ICON_X = `<svg width="16" height="16" ${A}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
export const ICON_PLUS = `<svg width="15" height="15" ${A}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
export const ICON_CHECK = `<svg width="15" height="15" ${A}><polyline points="20 6 9 17 4 12"/></svg>`;
export const ICON_LOCK = `<svg width="14" height="14" ${A}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;
export const ICON_UNLOCK = `<svg width="14" height="14" ${A}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.7-1.5"/></svg>`;

/** Parse a constant icon string into an <svg> element. */
export function iconEl(svg: string): SVGSVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = svg.trim();
  return tpl.content.firstElementChild as SVGSVGElement;
}
