import {afterEach,describe,expect,it,vi} from 'vitest';
import {stagingResultEmailSettings,dispatchResultEmail,claimResultEmail} from './result-delivery';
afterEach(()=>vi.unstubAllEnvs());
describe('result availability notification',()=>{
  it('is disabled without synthetic acknowledgment, allowlist and HTTPS portal',()=>{
    expect(stagingResultEmailSettings()).toBeNull();
    vi.stubEnv('NODE_ENV','test');
    vi.stubEnv('FISHER_PHASE4_OPERATION_MODE','synthetic-only');
    vi.stubEnv('FISHER_DISPOSABLE_DB_ACK','disposable-test-only');
    vi.stubEnv('FISHER_PHASE4_RESULT_EMAIL_MODE','staging');
    vi.stubEnv('DATABASE_URL','postgres://tester@localhost:5432/fisher_test');
    vi.stubEnv('RESEND_API_KEY','synthetic-test-key');
    vi.stubEnv('FISHER_PHASE4_RESULT_EMAIL_FROM','alerts@example.test');
    vi.stubEnv('FISHER_PHASE4_RESULT_EMAIL_ALLOWLIST','test@example.test');
    vi.stubEnv('FISHER_PHASE4_RESULT_PORTAL_URL','https://fisher.example.test/');
    expect(stagingResultEmailSettings()?.allowed).toEqual(['test@example.test']);
    vi.stubEnv('FISHER_PHASE4_RESULT_PORTAL_URL','http://fisher.example.test/');
    expect(stagingResultEmailSettings()).toBeNull();
    vi.stubEnv('FISHER_PHASE4_RESULT_PORTAL_URL','https://fisher.example.test/');
    vi.stubEnv('NODE_ENV','production');
    expect(stagingResultEmailSettings()).toBeNull();
  });
  it('makes no network or database calls when the email worker is disabled',async()=>{
    vi.stubEnv('FISHER_PHASE4_RESULT_EMAIL_MODE','');
    const query=vi.fn();const send=vi.fn();
    const didSend=await dispatchResultEmail({query} as never,send as never);
    expect(didSend).toBe(false);expect(query).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });  it('restricts queued result emails to explicit active consent',async()=>{
    const query=vi.fn().mockResolvedValue({rows:[]});
    expect(await claimResultEmail({query} as never,['synthetic@example.test'])).toBeNull();
    const sql=String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('phase4_result_email_preferences');
    expect(sql).toContain('pref.enabled');
    expect(sql).toContain('rel.can_view_results');
    expect(sql).toContain('rel.revoked_at IS NULL');
  });

  it('sends no clinical information or attachment and records only provider acknowledgment',async()=>{
    vi.stubEnv('NODE_ENV','test');
    vi.stubEnv('FISHER_PHASE4_OPERATION_MODE','synthetic-only');
    vi.stubEnv('FISHER_DISPOSABLE_DB_ACK','disposable-test-only');
    vi.stubEnv('FISHER_PHASE4_RESULT_EMAIL_MODE','staging');
    vi.stubEnv('DATABASE_URL','postgres://tester@localhost:5432/fisher_test');
    vi.stubEnv('RESEND_API_KEY','synthetic-test-key');
    vi.stubEnv('FISHER_PHASE4_RESULT_EMAIL_FROM','alerts@example.test');
    vi.stubEnv('FISHER_PHASE4_RESULT_EMAIL_ALLOWLIST','test@example.test');
    vi.stubEnv('FISHER_PHASE4_RESULT_PORTAL_URL','https://fisher.example.test/');
    const resultId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const claim={result_id:resultId,recipient:'test@example.test',
      lease_token:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',attempts:1};
    const db=vi.fn()
      .mockResolvedValueOnce({rowCount:0,rows:[]})
      .mockResolvedValueOnce({rowCount:1,rows:[claim]})
      .mockResolvedValueOnce({rowCount:1,rows:[{ok:1}]})
      .mockResolvedValueOnce({rowCount:1,rows:[{result_id:resultId}]});
    const send=vi.fn().mockResolvedValue(Response.json({id:'provider-ack-1234'}));
    expect(await dispatchResultEmail({query:db} as never,send as never)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    const [url,options]=send.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(options.headers['Idempotency-Key']).toContain(resultId);
    const body=JSON.parse(options.body);
    expect(body.to).toEqual(['test@example.test']);
    expect(body.text).toContain('/account/results');
    expect(body.text).not.toContain(resultId);
    expect(body.attachments).toBeUndefined();
    expect(body.html).toBeUndefined();
    expect(db.mock.calls[3]?.[0]).toContain("status='delivered'");
  });
  it('never records a delivered status after an ambiguous provider failure',async()=>{
    vi.stubEnv('NODE_ENV','test');
    vi.stubEnv('FISHER_PHASE4_OPERATION_MODE','synthetic-only');
    vi.stubEnv('FISHER_DISPOSABLE_DB_ACK','disposable-test-only');
    vi.stubEnv('FISHER_PHASE4_RESULT_EMAIL_MODE','staging');
    vi.stubEnv('DATABASE_URL','postgres://tester@localhost:5432/fisher_test');
    vi.stubEnv('RESEND_API_KEY','synthetic-test-key');
    vi.stubEnv('FISHER_PHASE4_RESULT_EMAIL_FROM','alerts@example.test');
    vi.stubEnv('FISHER_PHASE4_RESULT_EMAIL_ALLOWLIST','test@example.test');
    vi.stubEnv('FISHER_PHASE4_RESULT_PORTAL_URL','https://fisher.example.test/');
    const claim={result_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      recipient:'test@example.test',lease_token:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',attempts:1};
    const db=vi.fn().mockResolvedValueOnce({rowCount:0,rows:[]})
      .mockResolvedValueOnce({rows:[claim],rowCount:1})
      .mockResolvedValueOnce({rowCount:1,rows:[{ok:1}]})
      .mockResolvedValueOnce({rowCount:1});
    const send=vi.fn().mockRejectedValue(new Error('ambiguous network response'));
    expect(await dispatchResultEmail({query:db} as never,send as never)).toBe(true);
    expect(db.mock.calls[3]?.[0]).toContain("THEN 'failed' ELSE 'pending'");
    expect(db.mock.calls[3]?.[0]).not.toContain("status='delivered'");
  });  it('does not contact the provider when consent was revoked after the claim',async()=>{
    vi.stubEnv('NODE_ENV','test');
    vi.stubEnv('FISHER_PHASE4_OPERATION_MODE','synthetic-only');
    vi.stubEnv('FISHER_DISPOSABLE_DB_ACK','disposable-test-only');
    vi.stubEnv('FISHER_PHASE4_RESULT_EMAIL_MODE','staging');
    vi.stubEnv('DATABASE_URL','postgres://tester@localhost:5432/fisher_test');
    vi.stubEnv('RESEND_API_KEY','synthetic-test-key');
    vi.stubEnv('FISHER_PHASE4_RESULT_EMAIL_FROM','alerts@example.test');
    vi.stubEnv('FISHER_PHASE4_RESULT_EMAIL_ALLOWLIST','test@example.test');
    vi.stubEnv('FISHER_PHASE4_RESULT_PORTAL_URL','https://fisher.example.test/');
    const claim={result_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      recipient:'test@example.test',lease_token:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',attempts:1};
    const query=vi.fn()
      .mockResolvedValueOnce({rowCount:0,rows:[]})
      .mockResolvedValueOnce({rowCount:1,rows:[claim]})
      .mockResolvedValueOnce({rowCount:0,rows:[]})
      .mockResolvedValueOnce({rowCount:1});
    const send=vi.fn();
    expect(await dispatchResultEmail({query} as never,send as never)).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(query.mock.calls[3]?.[0]).toContain("status='failed'");
  });

});
