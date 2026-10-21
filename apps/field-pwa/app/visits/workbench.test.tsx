import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import FieldTrainingWorkbench from './workbench';
describe('field workbench release boundary', () => {
  it('locks collection controls without signed staff access', () => {
    const html = renderToStaticMarkup(createElement(FieldTrainingWorkbench,{demo:false}));
    expect(html).toContain('locked pending signed field staff');
    expect(html).not.toContain('type="checkbox"');
  });
  it('keeps synthetic training explicitly non-persistent', () => {
    const html = renderToStaticMarkup(createElement(FieldTrainingWorkbench,{demo:true}));
    expect(html).toContain('No operational event is saved or transmitted');
    expect(html).toContain('Verify synthetic specimen label');
  });
});
