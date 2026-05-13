export function $<T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`Element not found: ${sel}`);
  return el as T;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of children) node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}

let toastTimer: number | undefined;
export function toast(message: string, isError = false): void {
  let t = document.querySelector<HTMLDivElement>('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.append(t);
  }
  t.textContent = message;
  t.classList.toggle('error', isError);
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = self.setTimeout(() => t!.classList.remove('show'), 2600);
}
