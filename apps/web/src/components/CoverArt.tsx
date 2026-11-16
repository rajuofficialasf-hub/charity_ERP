/**
 * The drawn cover of a program or a project without a photo (docs/ui/DESIGN_SYSTEM.md, "Card /
 * Stat"): green hills under a pale sun, in the asf greens through the page tokens, so it follows
 * the light and dark modes. The same seed (the record's id) always draws the same picture, and
 * another seed another one. It stands beside the card's title, so it is hidden from screen
 * readers. Solid fills only: the asf look has no gradient fill.
 */

/** A number from 0 to 1, the same for the same seed and position (FNV-1a, then a step of xorshift). */
function random(seed: string): () => number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

const WIDTH = 320;
const HEIGHT = 150;
/**
 * From the back hill to the front one: lighter to darker, as the approved design draws them, in
 * both modes. The fills take the art tokens, which keep their asf shade in dark mode (the text
 * token `--color-brand-primary-dark` turns light there).
 */
const HILLS = [
  'var(--color-art-primary-main)',
  'var(--color-art-primary-dark)',
  'var(--color-art-primary-darker)',
];

/** The outline of one hill: a gentle wave across the width, closed along the bottom edge. */
function hill(base: number, amplitude: number, wavelength: number, phase: number): string {
  const points: string[] = [];
  for (let x = 0; x <= WIDTH; x += 8) {
    const y = base - Math.sin(x / wavelength + phase) * amplitude;
    points.push(`${x} ${y.toFixed(1)}`);
  }
  return `M0 ${HEIGHT} L${points.join(' L')} L${WIDTH} ${HEIGHT} Z`;
}

export function CoverArt({ seed }: { seed: string }) {
  const next = random(seed);
  const sun = { x: WIDTH * (0.6 + next() * 0.3), y: HEIGHT * 0.32, r: 18 + next() * 10 };
  const hills = HILLS.map((fill, i) => ({
    fill,
    d: hill(HEIGHT * (0.55 + i * 0.14), 10 + next() * 16, 60 + i * 30, next() * 6),
  }));
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
      data-cover-seed={seed}
    >
      <rect width={WIDTH} height={HEIGHT} fill="var(--color-art-primary-lighter)" />
      <circle
        cx={sun.x.toFixed(1)}
        cy={sun.y.toFixed(1)}
        r={sun.r.toFixed(1)}
        fill="var(--color-art-sun)"
        opacity="0.7"
      />
      {hills.map((h) => (
        <path key={h.fill} d={h.d} fill={h.fill} />
      ))}
    </svg>
  );
}
