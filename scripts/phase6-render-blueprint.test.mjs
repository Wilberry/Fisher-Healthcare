import {readFileSync} from 'node:fs';
import {strict as assert} from 'node:assert';
import {describe,it} from 'node:test';
const src=readFileSync(new URL('../infra/render/render.synthetic.yaml',import.meta.url),'utf8');
describe('Render synthetic-only blueprint static safety contract',()=>{
 it('defines a private service without public web',()=>{
  assert.match(src,/type: pserv/);
  assert.doesNotMatch(src,/type: web\b/);
  assert.match(src,/autoDeployTrigger: off/);
 });
 it('uses an internally reachable database with restricted external IP access',()=>{
  assert.match(src,/ipAllowList: \[\]/);
  assert.match(src,/fromDatabase:/);
  assert.match(src,/property: connectionString/);
 });
 it('avoids clinical, public and payment service activation',()=>{
  assert.doesNotMatch(src,/PAYSTACK_SECRET_KEY|RESEND_API_KEY|FISHER_PHASE2_PAYMENT_MODE\s*\n\s*value: staging/);
  assert.match(src,/FISHER_PHASE2_PAYMENT_MODE\s*\n\s*value: disabled/);
 });
 it('requires OIDC supplied in dashboard, not hardcoded',()=>{
  for(const key of ['OIDC_ISSUER','OIDC_AUDIENCE','OIDC_JWKS_URI'])
    assert.match(src,new RegExp('key: '+key+'\\s*\\n\\s*sync: false'));
 });
});
