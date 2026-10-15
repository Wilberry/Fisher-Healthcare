import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Home from './page';
describe('patient launch foundation', () => {
  it('does not invite payments or claim online booking is active', () => {
    const html = renderToStaticMarkup(createElement(Home));
    expect(html).toContain('not yet accepting bookings');
    expect(html).toContain('How Fisher Healthcare will work');
    expect(html).toContain('aria-labelledby="hero-title"');
    expect(html).not.toContain('href="/checkout"');
  });
});
