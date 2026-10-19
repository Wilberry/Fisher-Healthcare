import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({
  readStaffSession:vi.fn(),oidcConfig:vi.fn(),verifyActiveStaff:vi.fn()
}));
vi.mock('./staff-auth',()=>({
  readStaffSession:mocks.readStaffSession,
  oidcConfig:mocks.oidcConfig,
  verifyActiveStaff:mocks.verifyActiveStaff,
  crossSite:(request:Request)=>{
    const origin=request.headers.get('origin');
    return !origin||origin!==new URL(request.url).origin;
  }
}));
import {forwardOperationsAction} from './operations-gateway';

const base='https://operations.example.test/api/phase3/ops/assignments';
const session={type:'session',subject:'synthetic-dispatcher',accessToken:'synthetic-not-live',expires:9999999999};
function cmd(origin=true,body='{"orderId":"synthetic"}'){
  return new Request(base,{method:'POST',headers:{
    'content-type':'application/json',...(origin?{'origin':'https://operations.example.test'}:{})
  },body});
}
describe('Phase 3 operations BFF denies untrusted browser authority',()=>{
  beforeEach(()=>{
    mocks.readStaffSession.mockResolvedValue(session);
    mocks.oidcConfig.mockReturnValue({api:'https://api.example.test'});
    mocks.verifyActiveStaff.mockResolvedValue('synthetic-dispatcher');
  });
  afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
  it('denies missing and cross-origin mutations before reading a session',async()=>{
    expect((await forwardOperationsAction(cmd(false),'ops/assignments')).status).toBe(403);
    const cross=new Request(base,{method:'POST',headers:{
      origin:'https://evil.example.test','content-type':'application/json'
    },body:'{}'});
    expect((await forwardOperationsAction(cross,'ops/assignments')).status).toBe(403);
    expect(mocks.readStaffSession).not.toHaveBeenCalled();
  });
  it('will not proxy unrelated endpoints or arbitrary paths',async()=>{
    expect((await forwardOperationsAction(cmd(),'ops/patients/private-results')).status).toBe(404);
    expect((await forwardOperationsAction(cmd(),'ops/assignments/../../identity/session')).status).toBe(404);
    expect(mocks.readStaffSession).not.toHaveBeenCalled();
  });
  it('enforces authenticated identity and never forwards the browser chosen token',async()=>{
    const upstream=vi.fn().mockResolvedValue(Response.json({data:{id:'synthetic'}}));
    vi.stubGlobal('fetch',upstream);
    const res=await forwardOperationsAction(cmd(),'ops/assignments');
    expect(res.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
    const [url,init]=upstream.mock.calls[0]!;
    expect(String(url)).toBe('https://api.example.test/api/v1/ops/assignments');
    expect(init.headers.authorization).toBe('Bearer synthetic-not-live');
    expect(init.cache).toBe('no-store');
    mocks.verifyActiveStaff.mockResolvedValueOnce('different-user');
    expect((await forwardOperationsAction(cmd(),'ops/assignments')).status).toBe(401);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it('suppresses upstream error bodies and gives conflicts a review status',async()=>{
    const upstream=vi.fn().mockResolvedValue(
      Response.json({patientEmail:'never-expose'}, {status:409}));
    vi.stubGlobal('fetch',upstream);
    const res=await forwardOperationsAction(cmd(),'ops/assignments');
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).not.toContain('patientEmail');
  });
  it('refuses absent staff sessions and invalid JSON without contacting upstream',async()=>{
    mocks.readStaffSession.mockResolvedValueOnce(null);
    expect((await forwardOperationsAction(cmd(),'ops/assignments')).status).toBe(401);
    expect((await forwardOperationsAction(cmd(true,'not-json'),'ops/assignments')).status).toBe(400);
  });
});
