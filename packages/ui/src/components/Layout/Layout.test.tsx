import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations, renderWithUi } from '../../testing/index.js';
import { DescriptionList, Grid, Stack, Text } from './Layout.js';

describe('layout pieces of the set', () => {
  it('a stack is a column by default and a wrapping row on request, with a token gap', () => {
    renderWithUi(
      <>
        <Stack gap={2} aria-label="column">
          <span>a</span>
        </Stack>
        <Stack
          as="ul"
          direction="row"
          wrap
          align="center"
          justify="between"
          gap={4}
          aria-label="row"
        >
          <li>b</li>
        </Stack>
      </>,
    );
    expect(screen.getByLabelText('column')).toHaveClass('ui-stack', 'ui-gap-2');
    expect(screen.getByLabelText('column')).not.toHaveClass('ui-stack-row');
    const row = screen.getByRole('list', { name: 'row' });
    expect(row).toHaveClass(
      'ui-stack',
      'ui-stack-row',
      'ui-stack-wrap',
      'ui-align-center',
      'ui-justify-between',
      'ui-gap-4',
    );
  });

  it('a grid sets its columns and gap, and no gap class without a gap', () => {
    renderWithUi(
      <>
        <Grid columns={5} gap={1} aria-label="five">
          <span>a</span>
        </Grid>
        <Grid aria-label="plain">
          <span>b</span>
        </Grid>
      </>,
    );
    expect(screen.getByLabelText('five')).toHaveClass('ui-grid', 'ui-grid-5', 'ui-gap-1');
    expect(screen.getByLabelText('plain').className).toBe('ui-grid');
  });

  it('a description list pairs each label with its value', async () => {
    const { container } = renderWithUi(
      <DescriptionList
        labelWidth="lg"
        items={[
          { label: 'Name', value: 'Rahima Khatun' },
          { label: 'Mobile', value: '01700000103', lang: 'en' },
        ]}
      />,
    );
    const list = container.querySelector('dl')!;
    expect(list).toHaveClass('ui-dl', 'ui-dl-lg');
    expect(
      within(list)
        .getAllByRole('term')
        .map((t) => t.textContent),
    ).toEqual(['Name', 'Mobile']);
    expect(within(list).getAllByRole('definition')[1]).toHaveTextContent('01700000103');
    expect(within(list).getAllByRole('definition')[1]).toHaveAttribute('lang', 'en');
    // a label and its value share one group
    expect(within(list).getByText('Mobile').parentElement).toContainElement(
      within(list).getByText('01700000103'),
    );
    await expectNoAxeViolations(container);
  });

  it('text is a paragraph by default, muted or bold on request', () => {
    renderWithUi(
      <>
        <Text>plain</Text>
        <Text as="span" tone="muted" weight="bold">
          note
        </Text>
      </>,
    );
    expect(screen.getByText('plain').tagName).toBe('P');
    expect(screen.getByText('plain')).toHaveClass('ui-text');
    expect(screen.getByText('note').tagName).toBe('SPAN');
    expect(screen.getByText('note')).toHaveClass('ui-text', 'ui-text-muted', 'ui-text-bold');
  });
});
