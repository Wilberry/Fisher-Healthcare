import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DispatchWorkbench from './workbench';
describe('dispatch training access boundary', () => {
  it('does not reveal synthetic queue items when not explicitly enabled', () => {
    const html = renderToStaticMarkup(createElement(DispatchWorkbench,{demo:false}));
    expect(html).toContain('authenticated staff session');
    expect(html).not.toContain('SYN-DSP-001');
  });
  it('labels the optional development-only data clearly', () => {
    const html = renderToStaticMarkup(createElement(DispatchWorkbench,{demo:true}));
    expect(html).toContain('Synthetic sample records');
    expect(html).toContain('SYN-DSP-001');
  });
});
