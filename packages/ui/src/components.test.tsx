import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { TextField } from './text-field';
import { SiteShell } from './site-shell';
import { Notice } from './notice';

describe('accessible Fisher UI primitives', () => {
  it('defaults buttons to non-submitting type', () => {
    const html = renderToStaticMarkup(createElement(Button, { children: 'Continue' }));
    expect(html).toContain('type="button"');
    expect(html).toContain('Continue');
  });
  it('connects input labels, descriptions and error state', () => {
    const html = renderToStaticMarkup(createElement(TextField, {
      id: 'email', label: 'Email', error: 'Enter a valid email address'
    }));
    expect(html).toContain('for="email"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="email-description"');
  });
  it('offers a keyboard skip target and labeled navigation', () => {
    const html = renderToStaticMarkup(createElement(SiteShell, {
      navigation: [{ href: '#services', label: 'Services' }],
      children: createElement('p', null, 'Content')
    }));
    expect(html).toContain('href="#main-content"');
    expect(html).toContain('id="main-content"');
    expect(html).toContain('aria-label="Main navigation"');
  });
  it('announces the service pilot notice', () => {
    const html = renderToStaticMarkup(createElement(Notice, {
      title: 'Pilot preparation', children: 'Not yet taking bookings.'
    }));
    expect(html).toContain('role="status"');
  });
});
