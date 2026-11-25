/**
 * The header's menus. Each is a `details` element, so it opens and closes
 * without script (and, sharing a `name`, one at a time where the browser
 * supports it); this adds what script can: opening one closes the other,
 * and Escape, a click or focus outside, and following a link close it, Escape
 * returning focus to the menu's name. Nothing opens on hover.
 */

/** What these helpers read of a menu: whether it is open and what it holds. */
export interface MenuLike {
  open: boolean;
  contains(node: Node | null): boolean;
}

/** The other open menus, which close when `opened` opens. */
export function othersOpen<T extends MenuLike>(menus: readonly T[], opened: T): T[] {
  return menus.filter((m) => m !== opened && m.open);
}

/** The open menus that do not hold `target`: a click or focus there closes them. */
export function openOutside<T extends MenuLike>(menus: readonly T[], target: Node | null): T[] {
  return menus.filter((m) => m.open && !m.contains(target));
}

/** The open menu Escape closes: the one holding focus, else the first open one. */
export function menuForEscape<T extends MenuLike>(menus: readonly T[], focused: Node | null): T | undefined {
  const open = menus.filter((m) => m.open);
  return open.find((m) => m.contains(focused)) ?? open[0];
}

export function initNavMenus(root: ParentNode = document): void {
  const menus = [...root.querySelectorAll<HTMLDetailsElement>('details[data-nav-menu]')];
  if (menus.length === 0) return;

  for (const menu of menus) {
    menu.addEventListener('toggle', () => {
      if (menu.open) othersOpen(menus, menu).forEach((m) => (m.open = false));
    });
    // Following a link closes its menu, so the page comes back from history closed.
    menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => (menu.open = false)));
  }

  document.addEventListener('click', (e) => {
    openOutside(menus, e.target as Node | null).forEach((m) => (m.open = false));
  });
  document.addEventListener('focusin', (e) => {
    openOutside(menus, e.target as Node | null).forEach((m) => (m.open = false));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const menu = menuForEscape(menus, document.activeElement);
    if (!menu) return;
    const hadFocus = menu.contains(document.activeElement) || document.activeElement === document.body;
    menu.open = false;
    if (hadFocus) menu.querySelector('summary')?.focus();
  });
}
