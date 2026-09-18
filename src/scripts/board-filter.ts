/**
 * Exam board filter + row click navigation for Further Maths section pages.
 * Reads localStorage key from `[data-board-storage-key]` on the page.
 */
export function initBoardFilter(): void {
  const root = document.querySelector<HTMLElement>('[data-board-storage-key]');
  const STORAGE_KEY = root?.dataset.boardStorageKey ?? 'fm-cp-board-filter';

  const boardIds = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-board-filter]'),
    (btn) => btn.dataset.boardFilter,
  ).filter((id): id is string => id !== undefined);
  type BoardId = string;

  function isBoardId(s: string): boolean {
    return boardIds.includes(s);
  }

  function readInitialBoard(): BoardId {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('board');
    if (q && isBoardId(q)) return q;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && isBoardId(stored)) return stored;
    } catch { /* Filtering remains available without storage. */ }
    return 'all';
  }

  function syncUrlAndStorage(board: BoardId) {
    const url = new URL(window.location.href);
    if (board === 'all') url.searchParams.delete('board');
    else url.searchParams.set('board', board);
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    try { localStorage.setItem(STORAGE_KEY, board); } catch { /* Storage is optional. */ }
  }

  function cardMatches(dataBoards: string | undefined | null, board: BoardId): boolean {
    if (!dataBoards || dataBoards === 'all') return true;
    if (board === 'all') return true;
    return dataBoards.split(',').includes(board);
  }

  const sidebarInactive =
    'block w-full text-left border-l-2 border-transparent pl-4 py-2 text-sm text-muted hover:border-rule hover:text-ink transition-colors duration-150';
  const sidebarActive =
    'block w-full text-left border-l-2 border-rule pl-4 py-2 text-sm font-medium text-ink';

  const mobileSelect = document.querySelector<HTMLSelectElement>('[data-board-select]');

  function setButtonActive(board: BoardId) {
    if (mobileSelect) mobileSelect.value = board;
    document.querySelectorAll<HTMLButtonElement>('[data-board-filter]').forEach((btn) => {
      const id = btn.dataset.boardFilter;
      if (!id || !isBoardId(id)) return;
      const active = id === board;
      btn.className = active ? sidebarActive : sidebarInactive;
      if (active) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    });
  }

  function applyBoardFilter(board: BoardId) {
    document.querySelectorAll<HTMLElement>('[data-boards]').forEach((card) => {
      const v = card.dataset.boards;
      const match = cardMatches(v, board);
      card.classList.toggle('opacity-40', !match);
      card.classList.toggle('opacity-100', match);
      card.dataset.boardDimmed = match ? 'false' : 'true';
    });

    document.querySelectorAll<HTMLElement>('[data-topic-section]').forEach((section) => {
      const sectionCards = section.querySelectorAll<HTMLElement>('[data-boards]');
      if (sectionCards.length === 0) return;
      let allDimmed = true;
      sectionCards.forEach((c) => {
        if (c.dataset.boardDimmed !== 'true') allDimmed = false;
      });
      const dimHeading = allDimmed && board !== 'all';
      section.querySelectorAll<HTMLElement>('.topic-section-heading').forEach((h) => {
        h.classList.toggle('opacity-40', dimHeading);
        h.classList.toggle('opacity-100', !dimHeading);
      });
    });
  }

  const current = readInitialBoard();
  try { localStorage.setItem(STORAGE_KEY, current); } catch { /* Storage is optional. */ }
  setButtonActive(current);
  applyBoardFilter(current);

  document.querySelectorAll<HTMLButtonElement>('[data-board-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.boardFilter;
      if (!id || !isBoardId(id)) return;
      setButtonActive(id);
      applyBoardFilter(id);
      syncUrlAndStorage(id);
    });
  });

  mobileSelect?.addEventListener('change', () => {
    const board = mobileSelect.value;
    if (!isBoardId(board)) return;
    setButtonActive(board);
    applyBoardFilter(board);
    syncUrlAndStorage(board);
  });

  document.querySelectorAll<HTMLElement>('[data-card-href]').forEach((card) => {
    card.addEventListener('click', (e) => {
      if ((e.target as Element).closest('a')) return;
      const href = card.dataset.cardHref;
      if (!href) return;
      if (window.matchMedia('(max-width: 767px)').matches && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        window.location.assign(href);
      } else {
        window.open(href, '_blank', 'noopener');
      }
    });
  });
}
