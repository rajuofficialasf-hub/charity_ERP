import axe from 'axe-core';

/**
 * Runs axe-core on a rendered container and fails with a readable list of violations.
 * Used by every component test (TEST_STRATEGY section 2, NFR-46).
 */
export async function expectNoAxeViolations(container: Element): Promise<void> {
  const results = await axe.run(container, {
    // Colour contrast needs real layout and is checked in Playwright instead (jsdom has none).
    rules: { 'color-contrast': { enabled: false } },
  });
  if (results.violations.length > 0) {
    const report = results.violations
      .map(
        (v) =>
          `${v.id} (${v.impact ?? 'n/a'}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`,
      )
      .join('\n');
    throw new Error(`Accessibility violations found:\n${report}`);
  }
}
