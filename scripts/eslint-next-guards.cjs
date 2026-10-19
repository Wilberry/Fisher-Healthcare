'use strict';

// Local, dependency-minimal Next.js navigation/performance guards.
// This does not claim to reproduce every rule in eslint-config-next.
// It preserves critical Link and script checks while the upstream braces
// advisory has no fix. Extend this module with coverage as needed.

function attribute(node, name) {
  return node.attributes.find(a => a.type === 'JSXAttribute'
    && a.name.name === name);
}
function valuePrefix(v) {
  if (!v) return null;
  if (v.type === 'Literal' && typeof v.value === 'string') return v.value;
  if (v.type === 'JSXExpressionContainer') return valuePrefix(v.expression);
  if (v.type === 'TemplateLiteral') return v.quasis[0]?.value?.cooked ?? null;
  if (v.type === 'BinaryExpression' && v.operator === '+') return valuePrefix(v.left);
  return null;
}
const next = {
  rules: {
    'no-internal-anchor': {
      meta: {
        type: 'problem',
        docs: { description: 'Use next/link for internal page navigation.' },
        schema: [],
        messages: { link: 'Use next/link instead of an HTML <a> for internal navigation.' }
      },
      create(context) {
        return {
          JSXOpeningElement(node) {
            if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'a') return;
            const href = attribute(node, 'href');
            const value = valuePrefix(href?.value);
            // Root-relative Next.js routes require Link. A dynamic prefix is
            // unknown and must not be assumed safe or unsafe.
            if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
              && !attribute(node, 'download')) {
              context.report({ node: href ?? node, messageId: 'link' });
            }
          }
        };
      }
    },
    'no-img-element': {
      meta: {
        type: 'suggestion',
        docs: { description: 'Prefer optimized next/image for app images.' },
        schema: [],
        messages: { image: 'Use next/image instead of an HTML <img> for application images.' }
      },
      create(context) {
        return {
          JSXOpeningElement(node) {
            if (node.name.type === 'JSXIdentifier' && node.name.name === 'img') {
              context.report({ node, messageId: 'image' });
            }
          }
        };
      }
    },
    'no-sync-script': {
      meta: {
        type: 'problem',
        docs: { description: 'Avoid blocking script tags in Next.js apps.' },
        schema: [],
        messages: { script: 'Use next/script rather than an unguarded script element.' }
      },
      create(context) {
        return {
          JSXOpeningElement(node) {
            if (node.name.type === 'JSXIdentifier' && node.name.name === 'script'
              && attribute(node, 'src') && !attribute(node, 'async')
              && !attribute(node, 'defer')) {
              context.report({ node, messageId: 'script' });
            }
          }
        };
      }
    }
  }
};
module.exports = next;
