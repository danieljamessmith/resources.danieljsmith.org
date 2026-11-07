/**
 * Document viewer: one PDF, or two side by side from 1024px.
 *
 * Every document in the pack has its own iframe, loaded the first time it is
 * shown. Side by side assigns iframes to the left and right grid columns by
 * `data-slot`; an iframe is never moved in the page, because moving one
 * reloads it and loses the reader's place. Unused iframes are hidden with
 * `visibility` and taken out of the grid.
 *
 * Side by side is stored in the address as `?left=<type>&right=<type>`
 * (`?split=1` still opens the starting layout), and the browser remembers
 * whether it was on and which document was on the right.
 */

export type DocType = 'questions' | 'answers' | 'markscheme' | 'solutions' | 'notes';
export type Side = 'left' | 'right';

export interface Layout {
  left: DocType;
  right: DocType;
}

export interface Remembered {
  split: boolean;
  right?: DocType;
}

export const LAYOUT_STORAGE_KEY = 'resources-viewer-layout';

const DOC_TYPES: readonly DocType[] = ['questions', 'answers', 'markscheme', 'solutions', 'notes'];

function isDocType(types: readonly DocType[], value: unknown): value is DocType {
  return typeof value === 'string' && (types as readonly string[]).includes(value);
}

export function otherSide(side: Side): Side {
  return side === 'left' ? 'right' : 'left';
}

/**
 * The layout side by side opens with: questions on the left; on the right the
 * page's own document, or, on the questions page, the document last chosen for
 * the right pane, else the solutions. `null` when the pack has one document.
 */
export function startingLayout(
  types: readonly DocType[],
  page: DocType,
  rememberedRight?: DocType,
): Layout | null {
  if (types.length < 2) return null;
  const left: DocType = types.includes('questions') ? 'questions' : types[0];
  const right = [page, rememberedRight, 'solutions', ...types].find(
    (t): t is DocType => isDocType(types, t) && t !== left,
  );
  return right ? { left, right } : null;
}

/** Shows `type` on `side`; if the other pane already shows it, the panes swap. */
export function pick(layout: Layout, side: Side, type: DocType): Layout {
  if (layout[side] === type) return layout;
  if (layout[otherSide(side)] === type) return swap(layout);
  return side === 'left' ? { left: type, right: layout.right } : { left: layout.left, right: type };
}

export function swap(layout: Layout): Layout {
  return { left: layout.right, right: layout.left };
}

/** `?left=…&right=…`, when both name different documents of this pack. */
export function layoutFromParams(params: URLSearchParams, types: readonly DocType[]): Layout | null {
  const left = params.get('left');
  const right = params.get('right');
  if (isDocType(types, left) && isDocType(types, right) && left !== right) return { left, right };
  return null;
}

/**
 * Where the page opens: the address's layout, else side by side's starting
 * layout when the address says `?split=1` or side by side was last left on.
 */
export function initialState(
  params: URLSearchParams,
  types: readonly DocType[],
  page: DocType,
  remembered: Remembered,
): { split: boolean; layout: Layout | null } {
  const fromAddress = layoutFromParams(params, types);
  if (fromAddress) return { split: true, layout: fromAddress };
  const layout = startingLayout(types, page, remembered.right);
  if (!layout) return { split: false, layout: null };
  return { split: params.get('split') === '1' || remembered.split, layout };
}

/** The address's query with the layout written in (or taken out), other parameters kept. */
export function withLayoutParams(search: string, split: boolean, layout: Layout | null): string {
  const params = new URLSearchParams(search);
  params.delete('split');
  params.delete('left');
  params.delete('right');
  if (split && layout) {
    params.set('left', layout.left);
    params.set('right', layout.right);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function readRemembered(raw: string | null): Remembered {
  try {
    const value: unknown = JSON.parse(raw ?? '');
    if (typeof value !== 'object' || value === null) return { split: false };
    const { split, right } = value as Record<string, unknown>;
    return { split: split === true, ...(isDocType(DOC_TYPES, right) ? { right } : {}) };
  } catch {
    return { split: false };
  }
}

export function serialiseRemembered(remembered: Remembered): string {
  return JSON.stringify(remembered.right ? { split: remembered.split, right: remembered.right } : { split: remembered.split });
}

/** "Mark scheme on the left, solutions on the right." */
export function describeLayout(layout: Layout, labelOf: (type: DocType) => string): string {
  return `${labelOf(layout.left)} on the left, ${labelOf(layout.right).toLowerCase()} on the right.`;
}

/**
 * The iframe URL for a PDF. Firefox fits the page width with `view=FitH`;
 * Chromium over-zooms inside iframes with it, so it gets the plain URL.
 */
export function pdfSrc(src: string, isFirefox: boolean, page: string | null): string {
  const hash: string[] = [];
  if (isFirefox) hash.push('view=FitH');
  if (page) hash.push(`page=${page}`);
  return hash.length ? `${src.split('#')[0]}#${hash.join('&')}` : src;
}

function storageGet(): string | null {
  try {
    return localStorage.getItem(LAYOUT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storageSet(value: string): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, value);
  } catch {
    /* Side by side still works without storage. */
  }
}

export function initViewer(): void {
  const root = document.querySelector<HTMLElement>('[data-viewer-root]');
  const panes = document.querySelector<HTMLElement>('[data-panes]');
  if (!root || !panes) return;

  const docs = new Map<DocType, HTMLElement>();
  panes.querySelectorAll<HTMLElement>('[data-doc]').forEach((el) => docs.set(el.dataset.doc as DocType, el));
  const types = [...docs.keys()];
  const page = (panes.dataset.pageType ?? types[0]) as DocType;
  const labelOf = (type: DocType) => docs.get(type)?.dataset.label ?? type;

  const isFirefox = /Firefox\//.test(navigator.userAgent);
  const params = new URLSearchParams(window.location.search);
  const pageParam = params.get('page');
  const pageNumber = pageParam && /^\d+$/.test(pageParam) ? pageParam : null;
  const wide = window.matchMedia('(min-width: 1024px)');

  const toggle = root.querySelector<HTMLButtonElement>('[data-split-toggle]');
  const toggleLabel = toggle?.querySelector<HTMLElement>('[data-split-label]');
  const toggleDefault = toggleLabel?.textContent ?? 'Side by side';
  const live = root.querySelector<HTMLElement>('[data-viewer-live]');
  const swapButton = panes.querySelector<HTMLButtonElement>('[data-swap]');

  let remembered = readRemembered(storageGet());
  let { split, layout } = initialState(params, types, page, remembered);

  function load(type: DocType) {
    const el = docs.get(type);
    const iframe = el?.querySelector<HTMLIFrameElement>('iframe');
    if (!el || !iframe || iframe.dataset.loaded === '1' || !iframe.dataset.src) return;
    iframe.dataset.loaded = '1';
    iframe.src = pdfSrc(iframe.dataset.src, isFirefox, type === page ? pageNumber : null);
    const skeleton = el.querySelector<HTMLElement>('[data-skeleton]');
    if (skeleton) {
      const hide = () => { skeleton.style.opacity = '0'; };
      iframe.addEventListener('load', hide, { once: true });
      // Some browsers don't fire 'load' reliably on embedded PDFs.
      setTimeout(hide, 4000);
    }
  }

  function updateHead(side: Side, current: Layout) {
    const head = panes!.querySelector<HTMLElement>(`[data-head="${side}"]`);
    if (!head) return;
    const mine = current[side];
    const other = otherSide(side);
    head.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((button) => {
      const type = button.dataset.pick as DocType;
      const checked = type === mine;
      button.setAttribute('aria-checked', String(checked));
      button.tabIndex = checked ? 0 : -1;
      const marker = button.querySelector<HTMLElement>('[data-other-marker]');
      if (type === current[other]) {
        if (marker) marker.textContent = other;
        button.setAttribute('aria-label', `${labelOf(type)}, in the ${other} pane`);
      } else {
        if (marker) marker.textContent = '';
        button.removeAttribute('aria-label');
      }
    });
    const doc = docs.get(mine);
    if (!doc) return;
    const name = labelOf(mine).toLowerCase();
    const file = doc.dataset.file ?? '';
    const alone = head.querySelector<HTMLAnchorElement>('[data-tool="alone"]');
    if (alone) {
      alone.href = doc.dataset.href ?? '';
      alone.setAttribute('aria-label', `Open ${name} alone`);
      alone.title = `Open ${name} alone`;
    }
    const download = head.querySelector<HTMLAnchorElement>('[data-tool="download"]');
    if (download) {
      download.href = file;
      download.download = doc.dataset.downloadName ?? '';
      download.setAttribute('aria-label', `Download ${name}`);
      download.title = `Download ${name}`;
    }
    const tab = head.querySelector<HTMLAnchorElement>('[data-tool="tab"]');
    if (tab) {
      tab.href = mine === page && pageNumber ? `${file}#page=${pageNumber}` : file;
      tab.setAttribute('aria-label', `Open ${name} in a new tab`);
      tab.title = `Open ${name} in a new tab`;
    }
  }

  function render(announce: boolean) {
    const shown = split && layout !== null && wide.matches ? layout : null;
    root!.toggleAttribute('data-split', shown !== null);
    panes!.toggleAttribute('data-split', shown !== null);
    for (const [type, el] of docs) {
      const slot = shown
        ? type === shown.left ? 'left' : type === shown.right ? 'right' : 'hidden'
        : type === page ? 'left' : 'hidden';
      el.dataset.slot = slot;
      if (slot !== 'hidden') load(type);
    }
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(shown !== null));
      if (toggleLabel) toggleLabel.textContent = shown ? 'Single view' : toggleDefault;
    }
    if (shown) {
      updateHead('left', shown);
      updateHead('right', shown);
    }
    if (announce && live) live.textContent = shown ? describeLayout(shown, labelOf) : 'Single view.';
  }

  function persist() {
    remembered = { split, ...(layout ? { right: layout.right } : {}) };
    storageSet(serialiseRemembered(remembered));
    const url = new URL(window.location.href);
    history.replaceState(history.state, '', url.pathname + withLayoutParams(url.search, split, layout) + url.hash);
  }

  function change(next: Layout) {
    layout = next;
    persist();
    render(true);
  }

  toggle?.addEventListener('click', () => {
    if (toggle.getAttribute('aria-pressed') === 'true') {
      split = false;
    } else {
      split = true;
      layout = startingLayout(types, page, remembered.right);
    }
    persist();
    render(true);
  });

  swapButton?.addEventListener('click', () => {
    if (layout) change(swap(layout));
  });

  // Open alone leaves side by side, so the page it opens isn't put back into two panes.
  panes.querySelectorAll<HTMLAnchorElement>('[data-tool="alone"]').forEach((a) => {
    a.addEventListener('click', () => {
      storageSet(serialiseRemembered({ ...remembered, split: false }));
    });
  });

  panes.querySelectorAll<HTMLElement>('[data-head]').forEach((head) => {
    const side = head.dataset.head as Side;
    const radios = [...head.querySelectorAll<HTMLButtonElement>('[data-pick]')];
    const choose = (button: HTMLButtonElement) => {
      if (!layout) return;
      change(pick(layout, side, button.dataset.pick as DocType));
      button.focus();
    };
    radios.forEach((button) => button.addEventListener('click', () => choose(button)));
    head.addEventListener('keydown', (event) => {
      const index = radios.indexOf(event.target as HTMLButtonElement);
      if (index === -1) return;
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      const target =
        event.key === 'Home' ? 0 : event.key === 'End' ? radios.length - 1
          : step !== undefined ? (index + step + radios.length) % radios.length : null;
      if (target === null) return;
      event.preventDefault();
      choose(radios[target]);
    });
  });

  wide.addEventListener('change', () => render(false));

  if (split && layout && wide.matches) {
    // Normalise `?split=1` or a remembered layout into the address.
    const url = new URL(window.location.href);
    history.replaceState(history.state, '', url.pathname + withLayoutParams(url.search, true, layout) + url.hash);
  }
  render(false);

  if (pageNumber) {
    document.querySelectorAll<HTMLAnchorElement>('[data-pdf-link]').forEach((a) => {
      const href = a.getAttribute('href');
      if (href && !href.includes('#')) a.setAttribute('href', `${href}#page=${pageNumber}`);
    });
    document.querySelectorAll<HTMLAnchorElement>('[data-pair-link]').forEach((a) => {
      try {
        const url = new URL(a.getAttribute('href') ?? '', window.location.origin);
        url.searchParams.set('page', pageNumber);
        a.setAttribute('href', url.pathname + url.search);
      } catch { /* Leave the link as it is. */ }
    });
  }

  const fsButton = root.querySelector<HTMLButtonElement>('[data-fullscreen]');
  const fsTarget = document.getElementById('viewer-container');
  if (fsButton && fsTarget && document.fullscreenEnabled) {
    fsButton.hidden = false;
    fsButton.addEventListener('click', () => { fsTarget.requestFullscreen().catch(() => {}); });
    root.querySelector('[data-exit-fullscreen]')?.addEventListener('click', () => { document.exitFullscreen(); });
  }

  initMoreMenu();
}

function initMoreMenu(): void {
  const menuToggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const menu = document.getElementById('viewer-more');
  if (!menuToggle || !menu) return;
  const setMenu = (open: boolean, focusToggle: boolean) => {
    menu.hidden = !open;
    menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) menu.querySelector<HTMLElement>('a, button')?.focus();
    else if (focusToggle) menuToggle.focus();
  };
  menuToggle.addEventListener('click', () => setMenu(menu.hidden !== false, false));
  menu.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a, button')) setMenu(false, false);
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !(e.target as Element).closest('[data-viewer-menu]')) setMenu(false, false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) setMenu(false, true);
  });
  menu.addEventListener('focusout', (e) => {
    const next = e.relatedTarget as Element | null;
    if (next && !next.closest('[data-viewer-menu]')) setMenu(false, false);
  });
  // Clicks inside the PDF iframe never reach this document; focus leaving the window does.
  window.addEventListener('blur', () => { if (!menu.hidden) setMenu(false, false); });
}
