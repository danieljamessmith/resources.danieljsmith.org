/**
 * Exam board filter for Further Maths strand pages.
 * Hides booklets that don't match, updates per-topic counts and announces the result.
 * Reads the localStorage key from `[data-board-storage-key]` on the page.
 */
export function initBoardFilter(): void {
  const root = document.querySelector<HTMLElement>('[data-board-storage-key]');
  const STORAGE_KEY = root?.dataset.boardStorageKey ?? 'fm-cp-board-filter';

  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-board-filter]')];
  const select = document.querySelector<HTMLSelectElement>('[data-board-select]');
  const status = document.querySelector<HTMLElement>('[data-filter-status]');
  const statusText = status?.querySelector<HTMLElement>('[data-filter-status-text]');
  const clearButton = status?.querySelector<HTMLButtonElement>('[data-filter-clear]');
  const live = document.querySelector<HTMLElement>('[data-filter-live]');

  const labels = new Map<string, string>();
  select?.querySelectorAll('option').forEach((o) => labels.set(o.value, o.textContent?.trim() ?? o.value));
  buttons.forEach((b) => {
    if (b.dataset.boardFilter) labels.set(b.dataset.boardFilter, b.dataset.boardLabel ?? b.dataset.boardFilter);
  });
  const isBoardId = (s: string | null): s is string => s !== null && labels.has(s);

  function readInitialBoard(): string {
    const q = new URLSearchParams(window.location.search).get('board');
    if (isBoardId(q)) return q;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isBoardId(stored)) return stored;
    } catch { /* Filtering remains available without storage. */ }
    return 'all';
  }

  function persist(board: string) {
    const url = new URL(window.location.href);
    if (board === 'all') url.searchParams.delete('board');
    else url.searchParams.set('board', board);
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    try { localStorage.setItem(STORAGE_KEY, board); } catch { /* Storage is optional. */ }
  }

  function matches(dataBoards: string | undefined, board: string): boolean {
    if (board === 'all' || !dataBoards || dataBoards === 'all') return true;
    return dataBoards.split(',').includes(board);
  }

  const plural = (n: number, label: string) => `${label}${n === 1 ? '' : 's'}`;

  function apply(board: string, announce: boolean) {
    let shown = 0;
    let total = 0;

    document.querySelectorAll<HTMLElement>('[data-topic-section]').forEach((section) => {
      const rows = section.querySelectorAll<HTMLElement>('[data-boards]');
      let visible = 0;
      rows.forEach((row) => {
        const match = matches(row.dataset.boards, board);
        row.hidden = !match;
        if (match) visible++;
      });
      shown += visible;
      total += rows.length;

      const count = section.querySelector<HTMLElement>('[data-topic-count]');
      if (count) {
        const sectionTotal = Number(count.dataset.total ?? rows.length);
        const label = plural(sectionTotal, count.dataset.label ?? 'booklet');
        count.textContent = board === 'all' ? `${sectionTotal} ${label}` : `${visible} of ${sectionTotal} ${label}`;
      }
      const empty = section.querySelector<HTMLElement>('[data-topic-empty]');
      if (empty) empty.hidden = rows.length === 0 || visible > 0;
    });

    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.boardFilter === board)));
    if (select) select.value = board;

    const message =
      board === 'all'
        ? `Showing all ${total} booklets.`
        : `Showing ${shown} of ${total} ${plural(total, 'booklet')} for ${labels.get(board)}.`;
    if (status && statusText) {
      status.hidden = board === 'all';
      statusText.textContent = message;
    }
    if (announce && live) live.textContent = message;
  }

  function choose(board: string) {
    if (!isBoardId(board)) return;
    apply(board, true);
    persist(board);
  }

  const initial = readInitialBoard();
  apply(initial, false);
  if (initial !== 'all') persist(initial);

  buttons.forEach((b) => b.addEventListener('click', () => choose(b.dataset.boardFilter ?? 'all')));
  select?.addEventListener('change', () => choose(select.value));
  clearButton?.addEventListener('click', () => choose('all'));
}
