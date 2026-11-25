import { describe, expect, it } from 'vitest';
import { menuForEscape, openOutside, othersOpen, type MenuLike } from './nav-menus';

/** A menu that holds the nodes it is given. */
function menu(open: boolean, ...holds: object[]): MenuLike {
  return { open, contains: (node) => node !== null && holds.includes(node) };
}

const inFm = {} as Node;
const inAdm = {} as Node;
const elsewhere = {} as Node;

describe('othersOpen', () => {
  it('names the other open menus, never the one just opened', () => {
    const fm = menu(true, inFm);
    const adm = menu(true, inAdm);
    expect(othersOpen([fm, adm], adm)).toEqual([fm]);
    expect(othersOpen([fm, adm], fm)).toEqual([adm]);
  });

  it('names no closed menu', () => {
    const fm = menu(false, inFm);
    const adm = menu(true, inAdm);
    expect(othersOpen([fm, adm], adm)).toEqual([]);
  });
});

describe('openOutside', () => {
  it('closes an open menu when the click or focus is outside it', () => {
    const fm = menu(true, inFm);
    const adm = menu(false, inAdm);
    expect(openOutside([fm, adm], elsewhere)).toEqual([fm]);
    expect(openOutside([fm, adm], inAdm)).toEqual([fm]);
    expect(openOutside([fm, adm], null)).toEqual([fm]);
  });

  it('keeps a menu open when the click or focus is inside it', () => {
    const fm = menu(true, inFm);
    expect(openOutside([fm], inFm)).toEqual([]);
  });
});

describe('menuForEscape', () => {
  it('takes the open menu holding focus', () => {
    const fm = menu(true, inFm);
    const adm = menu(true, inAdm);
    expect(menuForEscape([fm, adm], inAdm)).toBe(adm);
  });

  it('takes the open menu when focus is elsewhere, and none when all are closed', () => {
    const fm = menu(false, inFm);
    const adm = menu(true, inAdm);
    expect(menuForEscape([fm, adm], elsewhere)).toBe(adm);
    expect(menuForEscape([menu(false), menu(false)], elsewhere)).toBeUndefined();
  });
});
