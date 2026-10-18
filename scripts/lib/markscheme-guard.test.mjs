import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardScheme, indexSchemes } from './markscheme-guard.mjs';
import { checkScheme, emitScheme, packModel, parseYaml } from './markscheme.mjs';
import { renderScheme } from './markscheme-render.mjs';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'markscheme');
const qbt = readFileSync(join(FIXTURE, 'qbt', '_QBT__Fixture.tex'), 'utf8');
const soln = readFileSync(join(FIXTURE, 'soln', '_QBT___Solns__Fixture.tex'), 'utf8');
const yaml = readFileSync(join(FIXTURE, 'ms', '_QBT___MS__Fixture.yaml'), 'utf8');
const pack = packModel(qbt, soln);
const tex = renderScheme(checkScheme(yaml, pack).scheme, pack);
const TODAY = new Date(2026, 9, 18);

const guard = (over = {}) => guardScheme({ yaml, tex, qbt, soln, ...over }, { today: TODAY });
const rules = (problems) => [...new Set(problems.map((p) => p.rule))];

/** The fixture's YAML with `change` applied to its data, written canonically. */
function editedYaml(change) {
  const data = parseYaml(yaml).value;
  change(data);
  return emitScheme(data);
}

describe('guardScheme', () => {
  it('passes the fixture scheme with its rendered .tex', () => {
    const result = guard();
    expect(result.errors).toEqual([]);
    expect(result.stale).toEqual([]);
  });

  it('reads a CRLF .tex as LF (rule 25)', () => {
    expect(guard({ tex: tex.replace(/\n/g, '\r\n') }).errors).toEqual([]);
  });

  it('refuses a hand-edited .tex, naming its first changed line (rule 25)', () => {
    const lines = tex.split('\n');
    const at = lines.findIndex((l) => l.includes('Total for Question 1'));
    lines[at] = lines[at].replace('Total for Question 1', 'Total for question 1');
    const { errors } = guard({ tex: lines.join('\n') });
    expect(rules(errors)).toEqual([25]);
    expect(errors[0].where).toBe(`.tex line ${at + 1}`);
    expect(errors[0].message).toMatch(/make the change in the YAML, then `npm run markscheme -- render <yaml>`/);
  });

  it('refuses a part whose \\marks changed without its scheme (rule 8), and does not render it', () => {
    const changed = qbt.replace('above $O$. \\marks{4}', 'above $O$. \\marks{5}');
    expect(changed).not.toBe(qbt);
    const { errors, stale } = guard({ qbt: changed });
    expect(rules(errors)).toEqual([8]);
    expect(errors[0].where).toBe('Q2(a)');
    expect(stale.map((s) => s.q)).toEqual([2]);
  });

  it('refuses a committed query and a committed flag (rule 24)', () => {
    const queried = editedYaml((d) => {
      d.questions[1].parts[0].rows[0].marks[0].query = { code: 'M1', why: 'It applies a formula.' };
    });
    expect(rules(guard({ yaml: queried, tex: null }).errors)).toEqual([24]);
    const flagged = editedYaml((d) => {
      const part = d.questions[0].parts[1];
      delete part.rows;
      part.flag = { kind: 'solution_error', why: 'The area is wrong.' };
    });
    expect(rules(guard({ yaml: flagged, tex: null }).errors)).toContain(24);
  });

  it('reports a stale stamp as rule 27, with the stamp to set', () => {
    const edited = soln.replace('The natural length of the string is $2a$.', 'The string has natural length $2a$.');
    expect(edited).not.toBe(soln);
    const { errors, stale } = guard({ soln: edited });
    expect(errors).toEqual([]);
    expect(stale).toHaveLength(1);
    expect(stale[0]).toMatchObject({ rule: 27, where: 'Q2', q: 2 });
    expect(stale[0].message).toMatch(/stamp <yaml> --only "2"/);
    expect(stale[0].message).toContain(packModel(qbt, edited).questions[1].stamp);
  });

  it('names a pack it cannot read', () => {
    const { errors } = guard({ qbt: 'nothing here' });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/its pack can't be read/);
  });
});

describe('indexSchemes (rule 26)', () => {
  const SEC = 'public/tex/further-maths/core-pure/polar';
  const PACK = [`${SEC}/qbt/_QBT__Polar.tex`, `${SEC}/qbt/_QBT__Polar.pdf`, `${SEC}/soln/_QBT___Solns__Polar.tex`, `${SEC}/soln/_QBT___Solns__Polar.pdf`];
  const MS = ['yaml', 'tex', 'pdf'].map((e) => `${SEC}/ms/_QBT___MS__Polar.${e}`);

  it('finds a complete scheme and its pack', () => {
    const { problems, schemes } = indexSchemes([...PACK, ...MS, 'src/data/resources.ts']);
    expect(problems).toEqual([]);
    expect(schemes).toEqual([
      { yaml: MS[0], tex: MS[1], pdf: MS[2], qbt: PACK[0], soln: PACK[2] },
    ]);
  });

  it('refuses a YAML without its .tex or PDF', () => {
    const { problems, schemes } = indexSchemes([...PACK, MS[0]]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: MS[0], rule: 26 });
    expect(problems[0].message).toMatch(/no \.tex or \.pdf/);
    expect(schemes).toHaveLength(1);
  });

  it('refuses a .tex or PDF without its YAML', () => {
    const { problems, schemes } = indexSchemes([...PACK, MS[1], MS[2]]);
    expect(problems.map((p) => p.message)).toEqual([expect.stringMatching(/no \.yaml.*come from its YAML/)]);
    expect(schemes).toEqual([]);
  });

  it('refuses a scheme with no pack in its section', () => {
    const other = MS.map((p) => p.replace('/polar/', '/other/'));
    const { problems, schemes } = indexSchemes([...PACK, ...other]);
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toMatch(/belongs to no pack in its section: .*other\/qbt\/_QBT__Polar\.tex and .*_QBT___Solns__Polar\.tex are not committed/);
    expect(schemes[0]).toMatchObject({ qbt: null, soln: null });
  });

  it('refuses any other file in ms/, or one nested in it', () => {
    const { problems } = indexSchemes([...PACK, ...MS, `${SEC}/ms/notes.txt`, `${SEC}/ms/build/_QBT___MS__Polar.pdf`]);
    expect(problems.map((p) => p.file)).toEqual([`${SEC}/ms/build/_QBT___MS__Polar.pdf`, `${SEC}/ms/notes.txt`]);
  });

  it('leaves packs without a scheme alone', () => {
    expect(indexSchemes(PACK)).toEqual({ problems: [], schemes: [] });
  });
});
