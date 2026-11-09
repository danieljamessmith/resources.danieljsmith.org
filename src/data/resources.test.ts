import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import rows from './resources.json';
import counts from './question-counts.json';
import strandRows from './topics.json';
import examBoards from './exam-boards.json';
import { EXAM_BOARD_IDS } from './examBoards';
import { FM_PREFIX, inTeachingOrder, orderGroup, type Resource } from './resources';

/**
 * The rows test: `resources.json`, `topics.json` and `question-counts.json`
 * as the site reads them. Each rule here is one a page relies on.
 */

const dataDir = dirname(fileURLToPath(import.meta.url));
const publicDir = join(dataDir, '..', '..', 'public');

type Row = Resource;
const ROWS = rows as unknown as Row[];
const COUNTS = counts as Record<string, number>;

interface TopicRow {
  id: string;
  topic: string;
  title: string;
  navLabel: string;
}
interface StrandRow {
  category: string;
  title: string;
  href: string;
  boardsKey: string;
  boardStorageKey: string;
  topics: TopicRow[];
}
const STRANDS = strandRows as StrandRow[];

const TYPES = ['questions', 'solutions', 'answers', 'markscheme', 'notes'] as const;
const FIELDS = [
  'id', 'title', 'description', 'file', 'category', 'type',
  'pairId', 'paperId', 'topic', 'boards', 'note', 'canonicalId', 'order',
] as const;

const byId = new Map(ROWS.map((r) => [r.id, r]));

/** The row a row follows in teaching order: its paper, or itself. */
function leader(r: Row): Row {
  if (r.type === 'solutions' && r.pairId) return byId.get(r.pairId) ?? r;
  if ((r.type === 'answers' || r.type === 'markscheme') && r.paperId) return byId.get(r.paperId) ?? r;
  return r;
}

/** The text a JSON data file is kept in: two-space indent, one final newline. */
function canonical(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Every deployed PDF under `public/tex/`, as its `/tex/...` path. */
function deployedPdfs(dir = join(publicDir, 'tex')): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'build' && entry.name !== 'aux') out.push(...deployedPdfs(full));
    } else if (entry.name.endsWith('.pdf')) {
      out.push(full.slice(publicDir.length).replace(/\\/g, '/'));
    }
  }
  return out;
}

describe('the data files', () => {
  it.each(['resources.json', 'topics.json', 'question-counts.json'])('%s is in its one written form', (name) => {
    const text = readFileSync(join(dataDir, name), 'utf8').replace(/\r\n/g, '\n');
    expect(text).toBe(canonical(JSON.parse(text)));
  });

  it('question-counts.json lists its paths in order', () => {
    const keys = Object.keys(COUNTS);
    expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b, 'en')));
  });
});

describe('every row', () => {
  it.each(ROWS.map((r) => [r.id, r] as const))('%s is well formed', (_id, r) => {
    for (const key of Object.keys(r)) expect(FIELDS).toContain(key);
    expect(r.id).toMatch(/^[a-z0-9][A-Za-z0-9-]*$/);
    expect(typeof r.title).toBe('string');
    expect(r.title.trim()).not.toBe('');
    expect(typeof r.description).toBe('string');
    expect(r.file).toMatch(/^\/tex\/[^?#]+\.pdf$/);
    expect(TYPES).toContain(r.type);
    expect(Number.isInteger(r.order)).toBe(true);
    if (r.note !== undefined) expect(typeof r.note).toBe('string');
    const categories = ['TMUA', ...STRANDS.map((s) => s.category)];
    expect(categories).toContain(r.category);
  });

  it('has its own id', () => {
    const ids = ROWS.map((r) => r.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('names a PDF that is there', () => {
    expect(ROWS.filter((r) => !existsSync(join(publicDir, r.file))).map((r) => r.file)).toEqual([]);
  });

  it('names its own PDF, and every deployed PDF has a row', () => {
    const files = ROWS.map((r) => r.file);
    expect(files.filter((f, i) => files.indexOf(f) !== i)).toEqual([]);
    expect(deployedPdfs().filter((f) => !files.includes(f))).toEqual([]);
  });
});

describe('pairs and papers', () => {
  it('pair a questions row with a solutions row, both ways', () => {
    for (const r of ROWS.filter((x) => x.pairId)) {
      const partner = byId.get(r.pairId!);
      expect(partner, `${r.id} pairId`).toBeDefined();
      expect(partner!.pairId, `${partner!.id} pairId`).toBe(r.id);
      expect(new Set([r.type, partner!.type])).toEqual(new Set(['questions', 'solutions']));
      expect([partner!.category, partner!.topic]).toEqual([r.category, r.topic]);
    }
  });

  it('give paperId to answer keys and mark schemes only, naming a questions row', () => {
    for (const r of ROWS) {
      if (r.type !== 'answers' && r.type !== 'markscheme') {
        expect(r.paperId, r.id).toBeUndefined();
        continue;
      }
      const paper = byId.get(r.paperId ?? '');
      expect(paper, `${r.id} paperId`).toBeDefined();
      expect(paper!.type).toBe('questions');
      expect(paper!.category).toBe(r.category);
      expect(r.pairId, r.id).toBeUndefined();
    }
  });

  it('give a paper one answer key and one mark scheme at most', () => {
    const keys = ROWS.filter((r) => r.paperId).map((r) => `${r.type} ${r.paperId}`);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });

  it("give a mark scheme its pack's id, title, topic, file and no boards", () => {
    for (const r of ROWS.filter((x) => x.type === 'markscheme')) {
      const paper = byId.get(r.paperId!)!;
      const solutions = byId.get(paper.pairId ?? '');
      expect(solutions?.type, `${paper.id} solutions`).toBe('solutions');
      expect(r.id).toBe(solutions!.id.replace(/-solns$/, '-ms'));
      expect([r.title, r.topic, r.description]).toEqual([paper.title, paper.topic, 'Mark scheme']);
      expect(r.file).toBe(paper.file.replace(/\/qbt\/_QBT__([^/]+)$/, '/ms/_QBT___MS__$1'));
      expect(r.boards, r.id).toBeUndefined();
    }
  });
});

describe('strands, topics and boards', () => {
  it('topics.json names each strand and section once, with a board list that exists', () => {
    const categories = STRANDS.map((s) => s.category);
    expect(new Set(categories).size).toBe(categories.length);
    for (const s of STRANDS) {
      expect(s.category.startsWith(FM_PREFIX)).toBe(true);
      expect(s.href).toMatch(/^\/further-maths\/[a-z-]+\/$/);
      expect(Object.keys(examBoards)).toContain(s.boardsKey);
      const ids = s.topics.map((t) => t.id);
      const topics = s.topics.map((t) => t.topic);
      expect(new Set(ids).size).toBe(ids.length);
      expect(new Set(topics).size).toBe(topics.length);
      for (const t of s.topics) {
        expect(t.id).toMatch(/^[a-z0-9-]+$/);
        for (const v of [t.topic, t.title, t.navLabel]) expect(v.trim()).not.toBe('');
      }
    }
  });

  it("file a Further Maths row under one of its strand's sections, with its strand's boards", () => {
    for (const r of ROWS.filter((x) => x.category.startsWith(FM_PREFIX))) {
      const strand = STRANDS.find((s) => s.category === r.category)!;
      expect(strand.topics.map((t) => t.topic), r.id).toContain(r.topic);
      const strandBoards = (examBoards as unknown as Record<string, { boards: { id: string }[] }>)[
        strand.boardsKey
      ].boards.map((b) => b.id);
      for (const board of r.boards ?? []) {
        expect(EXAM_BOARD_IDS as readonly string[]).toContain(board);
        expect(strandBoards, r.id).toContain(board);
      }
    }
  });

  it('keep boards to questions and notes rows', () => {
    expect(ROWS.filter((r) => r.boards && r.type !== 'questions' && r.type !== 'notes').map((r) => r.id)).toEqual([]);
  });
});

/** The types of row a pack published in a second strand repeats there. */
const SECOND_TYPES = ['questions', 'solutions', 'markscheme'];

/**
 * The faults in `rows`' `canonicalId`s, one line each: a `canonicalId` names a
 * Further Maths row of the same type and title, in another strand, which has
 * none itself; no notes, answers or TMUA row carries one.
 */
function canonicalIdFaults(rows: readonly Row[]): string[] {
  const ids = new Map(rows.map((r) => [r.id, r]));
  const faults: string[] = [];
  for (const r of rows.filter((x) => x.canonicalId !== undefined)) {
    if (!r.category.startsWith(FM_PREFIX) || !SECOND_TYPES.includes(r.type ?? '')) {
      faults.push(`${r.id}: a ${r.category} ${r.type} row has no canonicalId`);
      continue;
    }
    const home = ids.get(r.canonicalId!);
    if (!home) {
      faults.push(`${r.id}: canonicalId ${r.canonicalId} is not a row`);
      continue;
    }
    if (home.type !== r.type) faults.push(`${r.id}: canonicalId ${home.id} is a ${home.type} row`);
    if (home.title !== r.title) faults.push(`${r.id}: canonicalId ${home.id} has another title`);
    if (home.category === r.category || !home.category.startsWith(FM_PREFIX)) {
      faults.push(`${r.id}: canonicalId ${home.id} is not in another strand`);
    }
    if (home.canonicalId !== undefined) faults.push(`${r.id}: canonicalId ${home.id} has a canonicalId itself`);
  }
  return faults;
}

describe('second publications', () => {
  const pack = (id: string, category: string, type: Row['type'], extra: Partial<Row> = {}): Row => ({
    id,
    title: 'Groups',
    description: '',
    file: `/tex/${id}.pdf`,
    category,
    type,
    topic: 'Groups',
    order: 1,
    ...extra,
  });
  const HOME = [
    pack('cp-groups', 'FM - Core Pure', 'questions'),
    pack('cp-groups-solns', 'FM - Core Pure', 'solutions'),
    pack('cp-groups-ms', 'FM - Core Pure', 'markscheme'),
  ];
  const SECOND = [
    pack('fm-ap-groups', 'FM - Additional Pure', 'questions', { canonicalId: 'cp-groups' }),
    pack('fm-ap-groups-solns', 'FM - Additional Pure', 'solutions', { canonicalId: 'cp-groups-solns' }),
    pack('fm-ap-groups-ms', 'FM - Additional Pure', 'markscheme', { canonicalId: 'cp-groups-ms' }),
  ];

  it('accept a canonicalId naming the home row of the same type and title', () => {
    expect(canonicalIdFaults([...HOME, ...SECOND])).toEqual([]);
  });

  it.each([
    ['names no row', { canonicalId: 'cp-nothing' }],
    ['names a row of another type', { canonicalId: 'cp-groups-solns' }],
    ['names a row of another title', { title: 'Rings' }],
    ['names a row of its own strand', { category: 'FM - Core Pure' }],
    ['is not a string', { canonicalId: 7 as unknown as string }],
  ])('refuse a canonicalId that %s', (_what, change) => {
    const rows = [...HOME, { ...SECOND[0], ...change }];
    expect(canonicalIdFaults(rows)).toHaveLength(1);
  });

  it('refuse a canonicalId naming a row that has one itself', () => {
    const rows = [{ ...HOME[0], canonicalId: 'fm-ap-groups' }, ...HOME.slice(1), ...SECOND];
    expect(canonicalIdFaults(rows).length).toBeGreaterThan(0);
  });

  it.each([
    ['notes', pack('fm-ap-notes', 'FM - Additional Pure', 'notes', { canonicalId: 'cp-groups' })],
    ['answers', pack('tmua-a', 'FM - Additional Pure', 'answers', { canonicalId: 'cp-groups' })],
    ['TMUA', pack('tmua-q', 'TMUA', 'questions', { canonicalId: 'cp-groups' })],
  ])('refuse a canonicalId on a %s row', (_what, row) => {
    expect(canonicalIdFaults([...HOME, row])).toHaveLength(1);
  });

  it('hold for every row', () => {
    expect(canonicalIdFaults(ROWS)).toEqual([]);
  });
});

describe('teaching order', () => {
  it('is the order of the file', () => {
    expect(inTeachingOrder(ROWS).map((r) => r.id)).toEqual(ROWS.map((r) => r.id));
  });

  it("keeps each group's rows together", () => {
    const groups = ROWS.map(orderGroup).filter((g, i, all) => i === 0 || all[i - 1] !== g);
    expect(groups.filter((g, i) => groups.indexOf(g) !== i)).toEqual([]);
  });

  it("gives a paper's family its order, and no two papers or notes the same one", () => {
    for (const r of ROWS) expect(r.order, r.id).toBe(leader(r).order);
    const leaders = ROWS.filter((r) => leader(r) === r).map((r) => `${orderGroup(r)} ${r.order}`);
    expect(leaders.filter((k, i) => leaders.indexOf(k) !== i)).toEqual([]);
  });
});

describe('question counts', () => {
  it('give every counted questions row its count, and nothing else one', () => {
    const counted = ROWS.filter(
      (r) => r.type === 'questions' && (r.category === 'TMUA' || /\/qbt\//.test(r.file)),
    ).map((r) => r.file);
    expect(Object.keys(COUNTS).sort()).toEqual([...counted].sort());
  });

  it('are whole numbers above zero', () => {
    for (const [file, n] of Object.entries(COUNTS)) {
      expect(Number.isInteger(n) && n > 0, file).toBe(true);
    }
  });
});
