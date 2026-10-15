import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Field from './page';
describe('field foundation', () => {
  it('keeps field data disabled and identifies later milestones', () => {
    const html = renderToStaticMarkup(createElement(Field));
    expect(html).toContain('Field operations have not been activated');
    expect(html).toContain('Phase 3');
  });
});
