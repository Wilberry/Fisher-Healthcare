'use strict';
const assert = require('node:assert/strict');
const { RuleTester } = require('eslint');
const plugin = require('./eslint-next-guards.cjs');
const tester = new RuleTester({ languageOptions: { parserOptions: { ecmaVersion: 'latest', ecmaFeatures: { jsx: true } } } });
const lint = plugin.rules['no-internal-anchor'];

tester.run('no-internal-anchor', lint, {
  valid: [
    '<Link href="/tests">Tests</Link>',
    '<a href="https://example.com">External</a>',
    '<a href="#details">Details</a>',
    '<a href="//cdn.example.com/file">CDN</a>',
    '<a download href="/files/report.pdf">Download</a>',
    '<a href={url}>Unknown route</a>'
  ],
  invalid: [
    { code: '<a href="/tests">Tests</a>', errors: [{ messageId: 'link' }] },
    { code: '<a href={"/account/" + id}>Account</a>', errors: [{ messageId: 'link' }] },
    { code: '<a href={\`/book/\${id}\`}>Booking</a>', errors: [{ messageId: 'link' }] }
  ]
});
tester.run('no-img-element', plugin.rules['no-img-element'], {
  valid: ['<Image src="/logo.png" alt="logo"/>'],
  invalid: [{ code: '<img src="/logo.png" alt="logo"/>', errors: [{ messageId:'image' }] }]
});
tester.run('no-sync-script', plugin.rules['no-sync-script'], {
  valid: ['<script src="/app.js" async />', '<Script src="/app.js" />'],
  invalid: [{ code: '<script src="/app.js" />', errors: [{ messageId:'script' }] }]
});
assert.ok(true);
console.info('PASS: standalone Next.js navigation and script ESLint guard tests');
