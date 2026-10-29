import {strict as assert} from 'node:assert';
import {describe,it} from 'node:test';
import {validateRenderSyntheticRuntime} from './phase6-render-start.mjs';
const ok=()=>({FISHER_RENDER_SYNTHETIC_ACK:'private-synthetic-no-phi',
 NODE_ENV:'production',FISHER_PHASE2_BOOKING_MODE:'disabled',
 FISHER_PHASE2_PAYMENT_MODE:'disabled',FISHER_API_BIND_HOST:'0.0.0.0',
 PORT:'10000',OIDC_ISSUER:'https://identity.example.test/realm',
 OIDC_JWKS_URI:'https://identity.example.test/realm/jwks',
 OIDC_AUDIENCE:'fisher-synthetic',DATABASE_URL:'postgresql://app:secret@db.internal/fisher'});
describe('Render synthetic runtime refusal policy',()=>{
 it('accepts only a fully declared synthetic private environment',()=>{
  const x=validateRenderSyntheticRuntime(ok());
  assert.equal(x.valid,true);assert.equal(x.productionClinicalAuthorized,false);
 });
 it('denies missing identity or database settings',()=>{
  for(const key of ['OIDC_ISSUER','OIDC_JWKS_URI','OIDC_AUDIENCE','DATABASE_URL']){
   const e=ok();delete e[key];assert.equal(validateRenderSyntheticRuntime(e).valid,false);
  }
 });
 it('denies live payment/email credentials and loopback authentication bypass',()=>{
  for(const key of ['PAYSTACK_SECRET_KEY','RESEND_API_KEY','FISHER_PHASE2_EMAIL_MODE','FISHER_AUTH_ALLOW_LOOPBACK_HTTP']){
   const e=ok();e[key]='enabled';assert.equal(validateRenderSyntheticRuntime(e).valid,false);
  }
 });
 it('denies disabled-safety changes and invalid issuer protocol',()=>{
  for(const [key,val] of [['FISHER_PHASE2_PAYMENT_MODE','staging'],['FISHER_PHASE2_BOOKING_MODE','synthetic'],['NODE_ENV','development'],['FISHER_RENDER_SYNTHETIC_ACK','']]){
   const e=ok();e[key]=val;assert.equal(validateRenderSyntheticRuntime(e).valid,false);
  }
  const e=ok();e.OIDC_ISSUER='http://identity.example.test';
  assert.equal(validateRenderSyntheticRuntime(e).valid,false);
 });
});
