/**
 * ESLint rule `css/no-literal-ui-text` (docs/ui/I18N.md, "No hard-coded strings: rule and
 * enforcement"): user-facing text must come from the catalogue (t()) or from bilingual data,
 * never from a literal in JSX. Reports JSX text and string literals in text props that contain a
 * letter of any script; punctuation, digits and symbols alone (for example "-", "·", "৳") are
 * allowed.
 */
const LETTER = /\p{L}/u;

/** Props whose value is shown or announced to people. */
export const TEXT_PROPS = new Set([
  'aria-label',
  'aria-description',
  'aria-valuetext',
  'alt',
  'title',
  'placeholder',
  'label',
  'helper',
  'error',
  'message',
  'description',
  'subtitle',
  'reason',
  'meta',
  'delta',
  'unit',
  'header',
  'confirmLabel',
  'reasonLabel',
  'selectAllLabel',
  'previousValue',
  'lockedReason',
  'searchPlaceholder',
  'maxSizeText',
]);

function literalText(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0)
    return node.quasis.map((q) => q.value.cooked).join('');
  if (node.type === 'JSXExpressionContainer') return literalText(node.expression);
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'disallow literal user-facing text in JSX; use the i18n catalogue' },
    schema: [],
    messages: {
      text: 'User-facing text "{{text}}" is hard-coded; use t() from the catalogue (I18N 4).',
      prop: 'Prop "{{prop}}" has hard-coded text "{{text}}"; use t() from the catalogue (I18N 4).',
    },
  },
  create(context) {
    return {
      JSXText(node) {
        const text = node.value.trim();
        if (text && LETTER.test(text)) context.report({ node, messageId: 'text', data: { text } });
      },
      JSXExpressionContainer(node) {
        if (node.parent?.type !== 'JSXElement' && node.parent?.type !== 'JSXFragment') return;
        const text = literalText(node.expression);
        if (text && LETTER.test(text)) context.report({ node, messageId: 'text', data: { text } });
      },
      JSXAttribute(node) {
        const prop = typeof node.name.name === 'string' ? node.name.name : node.name.name?.name;
        if (!TEXT_PROPS.has(prop)) return;
        const text = literalText(node.value);
        if (text && LETTER.test(text))
          context.report({ node, messageId: 'prop', data: { prop, text } });
      },
    };
  },
};
