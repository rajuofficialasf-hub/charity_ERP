import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../test/auth';
import { definition, field, section, T } from '../../../test/forms';
import { AnswerList } from './AnswerList';

// The answers of a record as text: a number table by its rows and columns, a calculated text by
// its label in the reader's language.
const form = definition(
  section('more', [
    field('q_livestock', 'number_table', {
      label: T('গবাদি পশু', 'Livestock'),
      settings: {
        table: {
          rows: [{ key: 'cow', label: T('গরু', 'Cow') }],
          cols: [
            { key: 'own', label: T('নিজের', 'Own') },
            { key: 'shared', label: T('বর্গা', 'Sharecropped') },
          ],
        },
      },
    }),
    field('q_band', 'calculation', {
      label: T('আয়ের ধরন', 'Income band'),
      settings: { results: [{ code: 'low', label: T('কম', 'Low') }] },
    }),
  ]),
);
const answers = [
  { fieldKey: 'q_livestock', value: { t: 'number_table', v: { cow: { own: 2, shared: 1 } } } },
  { fieldKey: 'q_band', value: { t: 'calculation', v: 'low' } },
] as never;

describe('the answers of a record', () => {
  it('reads a table by its rows and columns and a calculated text by its label', () => {
    renderApp(<AnswerList form={form} answers={answers} />);
    expect(screen.getByText('গরু: নিজের 2, বর্গা 1')).toBeInTheDocument();
    expect(screen.getByText('কম')).toBeInTheDocument();
  });

  it('reads them in English too', () => {
    renderApp(<AnswerList form={form} answers={answers} />, 'en');
    expect(screen.getByText('Cow: Own 2, Sharecropped 1')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
  });
});
