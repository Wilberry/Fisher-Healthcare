import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Operations from './page';
describe('operations foundation', () => {
  it('is visibly non-operational and does not expose fake patient records', () => {
    const html = renderToStaticMarkup(createElement(Operations));
    expect(html).toContain('Operational access is not active');
    expect(html).toContain('Access governance');
    expect(html).not.toContain('Patient #');
  });
});
