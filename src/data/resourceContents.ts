/**
 * Per-question contents lists shown as crawlable text on viewer pages, keyed by resource id.
 * Kept out of `rawResources` in resources.ts because scripts/lib/resources-derive.mjs parses
 * that array with regexes and would misread nested entries.
 */
export interface ContentsItem {
  area: string;
  summary: string;
}

export const resourceContents: Record<string, ContentsItem[]> = {
  'tmua-setA-paper1-solns': [
    { area: 'Exponentials & Logarithms', summary: 'Solving the inequality log₂x < logₓ2' },
    { area: 'Inequalities', summary: '|x − a| + |x + a| < 3|a| as distances on a number line' },
    { area: 'Differentiation', summary: 'Two parabolas with perpendicular tangents where they meet' },
    { area: 'Algebra', summary: 'Pairing factors of a quartic product to find x² + 7x' },
    { area: 'Integration', summary: 'Area enclosed between a cubic and its tangent' },
    { area: 'Coordinate Geometry', summary: 'A line through (2, 5) cutting a triangle of area 25 from the axes' },
    { area: 'Number', summary: 'Counting the digits of 8¹⁵ × 5⁴⁰' },
    { area: 'Sequences & Series', summary: 'A quadratic sequence from its 2nd, 5th and 8th terms' },
    { area: 'Geometry', summary: 'Two circles touching both axes and each other' },
    { area: 'Sequences & Series', summary: 'The recurrence aₙ₊₁ = 3aₙ² solved with logarithms' },
    { area: 'Number', summary: 'Terminating decimals with exactly two decimal places' },
    { area: 'Functions & Graphs', summary: 'A linear function with f(f(x)) = 4x + 3' },
    { area: 'Algebra', summary: 'Sum and product of the roots of x² − 7x + 1 = 0' },
    { area: 'Probability & Counting', summary: 'Right-angled triangles from the vertices of a cube' },
    { area: 'Probability & Counting', summary: 'Same-colour and different-colour draws without replacement' },
    { area: 'Polynomials', summary: 'Tangents to a cubic through a point on the y-axis' },
    { area: 'Trigonometry', summary: 'A quadratic in sin x with exactly one solution' },
    { area: 'Polynomials', summary: 'The quartic x⁴ + ax² + b with three distinct real roots' },
    { area: 'Functions & Graphs', summary: '|x² − 4x + 3| = kx with exactly three solutions' },
    { area: 'Geometry', summary: 'The alternate segment theorem and similar triangles' },
  ],
};
