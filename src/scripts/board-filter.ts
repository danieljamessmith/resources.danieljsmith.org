/**
 * Exam board filter + row click navigation for Further Maths section pages.
 * Reads localStorage key from `[data-board-storage-key]` on the page.
 */
export function initBoardFilter(): void {
  const root = document.querySelector<HTMLElement>('[data-board-storage-key]');
  const STORAGE_KEY = root?.dataset.boardStorageKey ?? 'fm-cp-board-filter';
  // Accent is per-strand (e.g. Core Pure = purple, Further Mechanics = teal); falls back to purple.
  const accent = root?.dataset.boardAccent === 'teal' ? 'teal' : 'purple';

  const BOARD_IDS = ['all', 'edexcel', 'ocr-a', 'ocr-mei', 'aqa', 'cie'] as const;
  type BoardId = (typeof BOARD_IDS)[number];

  function isBoardId(s: string): s is BoardId {
    return (BOARD_IDS as readonly string[]).includes(s);
  }

  function readInitialBoard(): BoardId {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('board');
    if (q && isBoardId(q)) return q;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isBoardId(stored)) return stored;
    return 'all';
  }

  function syncUrlAndStorage(board: BoardId) {
    const url = new URL(window.location.href);
    if (board === 'all') url.searchParams.delete('board');
    else url.searchParams.set('board', board);
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    localStorage.setItem(STORAGE_KEY, board);
  }

  function cardMatches(dataBoards: string | undefined | null, board: BoardId): boolean {
    if (!dataBoards || dataBoards === 'all') return true;
    if (board === 'all') return true;
    return dataBoards.split(',').includes(board);
  }

  const sidebarInactive =
    'block w-full text-left border-l-2 border-transparent pl-4 py-2 text-sm text-slate-400 hover:border-slate-400 hover:text-white transition-colors duration-150';
  // Full class strings per accent so Tailwind JIT includes them at build time.
  const sidebarActive =
    accent === 'teal'
      ? 'block w-full text-left border-l-2 border-teal-500 pl-4 py-2 text-sm font-medium text-white'
      : 'block w-full text-left border-l-2 border-purple-500 pl-4 py-2 text-sm font-medium text-white';
  const mobileInactive =
    accent === 'teal'
      ? 'flex-shrink-0 whitespace-nowrap rounded-full border border-slate-600/80 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-teal-500/50 hover:text-white'
      : 'flex-shrink-0 whitespace-nowrap rounded-full border border-slate-600/80 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-purple-500/50 hover:text-white';
  const mobileActive =
    accent === 'teal'
      ? 'flex-shrink-0 whitespace-nowrap rounded-full border border-teal-500 bg-teal-500/15 px-3 py-1.5 text-xs font-medium text-white'
      : 'flex-shrink-0 whitespace-nowrap rounded-full border border-purple-500 bg-purple-500/15 px-3 py-1.5 text-xs font-medium text-white';

  function setButtonActive(board: BoardId) {
    document.querySelectorAll<HTMLButtonElement>('[data-board-filter]').forEach((btn) => {
      const id = btn.dataset.boardFilter;
      if (!id || !isBoardId(id)) return;
      const active = id === board;
      const isSidebar = btn.matches('[data-board-filter-link="sidebar"]');
      if (isSidebar) {
        btn.className = active ? sidebarActive : sidebarInactive;
      } else {
        btn.className = active ? mobileActive : mobileInactive;
      }
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
  localStorage.setItem(STORAGE_KEY, current);
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

  document.querySelectorAll<HTMLElement>('[data-card-href]').forEach((card) => {
    card.addEventListener('click', (e) => {
      if ((e.target as Element).closest('a')) return;
      const href = card.dataset.cardHref;
      if (href) window.open(href, '_blank', 'noopener');
    });
  });
}
