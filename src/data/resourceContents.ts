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
  ],  'tmua-setA-paper2-solns': [
    { area: 'Proof & Error Analysis', summary: 'Checking a proof that x + y ≥ 2 implies x² + y² ≥ 2' },
    { area: 'Trigonometry', summary: 'Area of a quadrilateral split into two right-angled triangles' },
    { area: 'Proof & Error Analysis', summary: 'First error in a proof about the roots of a quadratic with zero integral' },
    { area: 'Exponentials & Logarithms', summary: 'Values of a for which logₐ(3x − 1) = 2 + logₐ(x + 1) has one solution' },
    { area: 'Number', summary: 'The largest n = 2ᵃ3ᵇ below 200 with exactly 12 factors' },
    { area: 'Proof & Error Analysis', summary: 'A flawed proof that a + b and ab integers force a and b to be integers' },
    { area: 'Geometry', summary: 'Shaded areas from semicircles on the sides of a right-angled triangle' },
    { area: 'Coordinate Geometry', summary: 'Where the tangents to y = x² at the ends of a chord meet' },
    { area: 'Logic', summary: 'A counterexample to an integral inequality for 0 ≤ f(x) ≤ 1' },
    { area: 'Logic', summary: 'Necessary and sufficient conditions from a quadratic, a logarithm and an exponential' },
    { area: 'Probability & Counting', summary: 'Conditional probability for a three-digit code whose product is divisible by 6' },
    { area: 'Proof & Error Analysis', summary: 'First error in a proof about the point of inflection of a cubic' },
    { area: 'Integration', summary: 'The smallest n for which a sum built from ∫xⁿ dx exceeds 15' },
    { area: 'Logic', summary: 'Negating a “for all x, if … then …” statement' },
    { area: 'Proof & Error Analysis', summary: 'Whether a strictly increasing function must have f′(x) > 0' },
    { area: 'Sequences & Series', summary: 'Binomial coefficients of x⁴, x⁵ and x⁶ in arithmetic progression' },
    { area: 'Logic', summary: 'The condition on a for sin y to take every value in [−1, 1] with a ≤ y ≤ a + π' },
    { area: 'Logic', summary: 'A necessary but not sufficient condition for a cubic to be decreasing somewhere' },
    { area: 'Algebra', summary: 'Finding x⁶ + 1/x⁶ from x² − 3x + 1 = 0' },
    { area: 'Polynomials', summary: 'Values of p for which x³ − 3x + p = 0 has three distinct real roots' },
  ],
};
