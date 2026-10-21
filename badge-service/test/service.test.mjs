import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPublicKey, verify } from 'node:crypto';
import { BadgeStore, eligibility, fixture } from '../core.mjs';
import { canvasEvidence } from '../canvas.mjs';
import { createApp } from '../server.mjs';
import { defaultDesign } from '../designs.mjs';

const config = JSON.parse(readFileSync(new URL('../config.example.json',import.meta.url)));
function temporary(t) {
  const directory = mkdtempSync(join(tmpdir(),'cu-badge-test-'));
  t.after(() => rmSync(directory,{recursive:true,force:true}));
  return directory;
}
test('eligibility fails closed for missing, duplicate, ungraded and excused evidence',() => {
  assert.equal(eligibility(config.course,fixture('complete')).eligible,true);
  assert.equal(eligibility(config.course,fixture('incomplete')).eligible,false);
  assert.equal(eligibility(config.course,fixture('below-threshold')).eligible,false);
  for (const update of [a => a.modules = [], a => a.modules.push(a.modules[0]),
    a => a.assessment.score = null, a => a.assessment.pointsPossible = 0,
    a => a.assessment.excused = true, a => a.assessment.graded = false]) {
    const evidence = fixture('complete'); update(evidence);
    assert.equal(eligibility(config.course,evidence).eligible,false);
  }
  const evidence = fixture('complete'); evidence.assessment.score = 80;
  assert.equal(eligibility(config.course,evidence).eligible,true);
});
test('durable award, independently verified signature, tamper detection, revocation and retry',t => {
  const directory = temporary(t);
  let store = new BadgeStore(directory,config,'http://127.0.0.1:4178');
  const issued = store.issue('demo-alex',fixture('complete'),'test');
  assert.equal(issued.badge.shared,false);
  const exported = store.envelope(issued.badge.id);
  const publicKey = createPublicKey({key:store.jwk,format:'jwk'});
  const bytes = Buffer.from(exported.payload,'base64url');
  assert.equal(verify(null,bytes,publicKey,Buffer.from(exported.signature,'base64url')),true);
  assert.equal(verify(null,Buffer.concat([bytes,Buffer.from('changed')]),publicKey,Buffer.from(exported.signature,'base64url')),false);
  assert.equal(bytes.includes(Buffer.from('demo-alex')),false);
  assert.equal(Object.hasOwn(JSON.parse(bytes),'assessment'),false);
  assert.equal(Object.hasOwn(JSON.parse(bytes),'evidence'),false);
  assert.equal(store.issue('demo-alex',fixture('complete'),'test').duplicate,true);
  store.share(issued.badge.id,true,'test');
  store.revoke(issued.badge.id,'Incorrect award','test');
  store.close();
  store = new BadgeStore(directory,config,'http://127.0.0.1:4178');
  const retried = store.issue('demo-alex',fixture('complete'),'test');
  assert.equal(retried.badge.id,issued.badge.id);
  assert.equal(retried.badge.status,'revoked');
  assert.equal(retried.badge.signatureValid,true);
  assert.equal(store.list('demo-alex').length,1);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action='issued'").get().n,1);
  store.close();
});
async function httpApp(t,options={}) {
  // Reserve a loopback ephemeral port, then declare the matching trusted origin.
  const {createServer} = await import('node:net');
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0,'127.0.0.1',resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const app = createApp({directory:temporary(t),baseUrl:origin,writerToken:'test-writer-token',readerToken:'test-reader-token',...options});
  await new Promise(resolve => app.server.listen(port,'127.0.0.1',resolve));
  t.after(async () => { await new Promise(resolve => app.server.close(resolve)); app.store.close(); });
  const request = async (path,body,token,originOverride=origin) => fetch(origin+path,{
    method:body ? 'POST':'GET', headers:{...(body ? {'Content-Type':'application/json',Origin:originOverride}:{}),...(token ? {Authorization:`Bearer ${token}`}:{})},
    ...(body ? {body:JSON.stringify(body)}:{})
  });
  return {app,origin,request};
}
test('HTTP auth separation, private defaults, consent sharing, download, revoke and cross-site blocking',async t => {
  const {request,origin} = await httpApp(t);
  assert.equal((await request('/api/learners/demo-alex/badges')).status,401);
  assert.equal((await request('/api/learners/demo-alex/badges',null,'test-writer-token')).status,401);
  assert.equal((await request('/api/learners/demo-alex/badges',null,'test-reader-token')).status,200);
  assert.equal((await request('/api/demo/issue',{scenario:'complete'},null,'https://evil.example')).status,403);
  assert.equal((await request('/api/demo/issue',{scenario:'complete'},null,'null')).status,403);
  const rejected = await (await request('/api/demo/issue',{scenario:'below-threshold'})).json();
  assert.equal(rejected.eligible,false);
  const issued = await (await request('/api/demo/issue',{scenario:'complete'})).json();
  const id = issued.badge.id;
  assert.equal((await request(`/verify/${id}`)).status,404);
  assert.equal((await request(`/api/badges/${id}/download`)).status,401);
  const download = await request(`/api/demo/badges/${id}/download`);
  assert.equal(download.status,200);
  assert.match(download.headers.get('content-disposition'),/attachment/);
  await request(`/api/demo/badges/${id}/share`,{shared:true});
  assert.equal((await request(`/verify/${id}`)).status,200);
  assert.equal((await request(`/api/badges/${id}/revoke`,{reason:'test'},'test-reader-token')).status,401);
  await request(`/api/demo/badges/${id}/revoke`,{reason:'test'});
  assert.equal((await (await request(`/api/public/${id}`)).json()).status,'revoked');
  await request(`/api/demo/badges/${id}/share`,{shared:false});
  assert.equal((await request(`/verify/${id}`)).status,404);
  const { request: rawRequest } = await import('node:http');
  const rebound = await new Promise((resolve,reject) => {
    const req = rawRequest(origin+'/health',{headers:{Host:'evil.example'}},res => {res.resume(); resolve(res.statusCode);});
    req.on('error',reject); req.end();
  });
  assert.equal(rebound,403);
});
test('configuration cannot silently reinterpret existing awards',t => {
  const directory = temporary(t);
  const store = new BadgeStore(directory,config,'http://127.0.0.1:4178');
  store.issue('demo-alex',fixture('complete'),'test');
  store.close();
  const changed = structuredClone(config);
  changed.course.minimumPercent = 60;
  assert.throws(() => new BadgeStore(directory,changed,'http://127.0.0.1:4178'),/migration/);
  assert.throws(() => new BadgeStore(directory,config,'http://127.0.0.1:4178','canvas'),/migration/);
});
test('standalone verifier accepts the signed download and rejects tampering',t => {
  const directory = temporary(t);
  const store = new BadgeStore(directory,config,'http://127.0.0.1:4178');
  const badge = store.issue('demo-alex',fixture('complete'),'test').badge;
  const envelope = store.envelope(badge.id);
  const exportPath = join(directory,'export.json');
  const keyPath = join(directory,'public.json');
  writeFileSync(exportPath,JSON.stringify(envelope));
  writeFileSync(keyPath,JSON.stringify({keys:[{...store.jwk,kid:store.kid}]}));
  const command = [new URL('../verify-export.mjs',import.meta.url).pathname,exportPath,keyPath];
  // URL.pathname escapes spaces; use fileURLToPath for the actual executable path.
  command[0] = decodeURIComponent(command[0]);
  assert.equal(spawnSync(process.execPath,command).status,0);
  envelope.payload = Buffer.from('tampered').toString('base64url');
  writeFileSync(exportPath,JSON.stringify(envelope));
  assert.equal(spawnSync(process.execPath,command).status,1);
  store.close();
});
test('Canvas reader paginates, scales scores and rejects redirects to other hosts',async () => {
  const live = structuredClone(config);
  Object.assign(live.course,{canvasCourseId:42,canvasAssignmentId:77});
  live.learners['demo-alex'].canvasUserId = 123;
  const environment = {CANVAS_BASE_URL:'https://canvas.example.edu',CANVAS_TOKEN:'not-a-real-token'};
  const calls = [];
  const fetcher = async (url,options) => {
    calls.push(url.toString());
    assert.equal(options.redirect,'error');
    assert.equal(options.method,undefined); // fetch default GET
    const completedModule = id => ({id,state:'completed',published:true,requirement_type:'all',items:[{id:id*10,completion_requirement:{type:'must_view',completed:true}}]});
    if (url.pathname.endsWith('/modules') && !url.searchParams.has('page')) {
      const first = completedModule(1); delete first.published;
      return new Response(JSON.stringify([first]),{headers:{link:'<https://canvas.example.edu/api/v1/courses/42/modules?page=2&student_id=123>; rel="next"'}});
    }
    if (url.pathname.endsWith('/modules/1')) return new Response(JSON.stringify(completedModule(1)));
    if (url.pathname.endsWith('/modules')) return new Response(JSON.stringify([2,3,4,5,6].map(completedModule)));
    if (url.pathname.endsWith('/assignments/77')) return new Response(JSON.stringify({id:77,published:true,points_possible:50}));
    return new Response(JSON.stringify({user_id:123,assignment_id:77,workflow_state:'graded',score:40,excused:false}));
  };
  const evidence = await canvasEvidence(live,'demo-alex',environment,fetcher);
  assert.equal(calls.length,5);
  assert.equal(evidence.assessment.assignmentId,77);
  assert.equal(eligibility(live.course,evidence).eligible,true);
  await assert.rejects(canvasEvidence(live,'demo-alex',environment,async () => new Response('[]',{headers:{link:'<https://evil.example/api/v1/stolen>; rel="next"'}})),/Unsafe/);
  await assert.rejects(canvasEvidence(live,'demo-alex',environment,async () => new Response('{}',{status:403})),/Canvas read failed/);
});
test('live completion cannot pass an empty, unpublished or one-of module',() => {
  const evidence = {...fixture('complete'),source:'canvas-readback'};
  evidence.modules = evidence.modules.map(m => ({...m,published:true,requirementType:'all',requiredItems:[{id:m.id,completed:true}]}));
  assert.equal(eligibility(config.course,evidence).eligible,true);
  for (const change of [m => m.requiredItems = [], m => m.published = false,
    m => m.requirementType = 'one', m => m.requiredItems[0].completed = false]) {
    const copy = structuredClone(evidence); change(copy.modules[0]);
    assert.equal(eligibility(config.course,copy).eligible,false);
  }
});
test('sync only uses fresh trusted evidence, never request-supplied completion',async t => {
  const live = structuredClone(config);
  live.learners = {learner1:{canvasUserId:123}};
  Object.assign(live.course,{canvasCourseId:42,canvasAssignmentId:77});
  const {request,app} = await httpApp(t,{demo:false,config:live,canvasReader:async () => ({...fixture('below-threshold'),source:'canvas-readback'})});
  assert.equal((await request('/api/demo/badges')).status,404);
  const response = await request('/api/sync',{learner:'learner1',modules:fixture('complete').modules,score:100},'test-writer-token');
  assert.equal((await response.json()).eligible,false);
  assert.equal(app.store.list('learner1').length,0);
});
test('designer persists revisions, rejects stale updates and cannot alter issued awards',async t=>{
  const {request,app,origin}=await httpApp(t);
  const badge=app.store.issue('demo-alex',fixture('complete'),'test').badge;
  const original=app.store.get(badge.id).credential;
  assert.equal((await request('/issuer')).status,200);
  assert.equal((await request('/api/designer/drafts',{design:defaultDesign},null,'https://evil.example')).status,403);
  const created=await (await request('/api/designer/drafts',{design:defaultDesign})).json();
  assert.equal(created.revision,1);
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=';
  const changed={...defaultDesign,title:'A revised badge',description:'New description.',artworkImage:png};
  const updated=await (await request(`/api/designer/drafts/${created.id}`,{design:changed,revision:1})).json();
  assert.equal(updated.revision,2);
  assert.equal((await request(`/api/designer/drafts/${created.id}`,{design:defaultDesign,revision:1})).status,400);
  assert.equal((await request('/api/designer/drafts',{design:{...defaultDesign,primary:'url(https://evil.example)'}})).status,400);
  assert.equal((await request('/api/designer/drafts',{design:{...defaultDesign,logo:'data:image/svg+xml;base64,PHN2Zz4='}})).status,400);
  assert.equal((await request('/api/designer/drafts',{design:{...defaultDesign,artworkImage:'data:image/svg+xml;base64,PHN2Zz4='}})).status,400);
  assert.equal((await request('/api/designer/drafts',{design:{...defaultDesign,artworkImage:'data:image/png;base64,YWJj'}})).status,400);
  const readBack=await (await request('/api/designer/drafts')).json();
  assert.equal(readBack.drafts[0].design.description,'New description.');
  assert.equal(readBack.drafts[0].design.artworkImage,png);
  assert.equal(app.store.get(badge.id).credential,original);
  const {DatabaseSync}=await import('node:sqlite');
  const dbPath=app.store.db.location();
  const independent=new DatabaseSync(dbPath,{readOnly:true});
  assert.equal(independent.prepare('SELECT revision FROM badge_drafts WHERE id=?').get(created.id).revision,2);
  independent.close();
});
test('register requires issuer access, reads both sources and keeps duplicate attempts in history',async t=>{
  const extraDirectory=temporary(t);
  const extra=new BadgeStore(extraDirectory,config,'http://127.0.0.1:4242','canvas');
  const evidence={...fixture('complete'),source:'canvas-readback',canvasCourseId:9943,canvasUserId:36081};
  evidence.modules=evidence.modules.map(m=>({...m,published:true,requirementType:'all',requiredItems:[{id:m.id,completed:true}]}));
  const issued=extra.issue('demo-alex',evidence,'canvas-worker');
  extra.issue('demo-alex',evidence,'canvas-worker');
  extra.revoke(issued.badge.id,'Test revocation reason','test-instructor');extra.close();
  const {app,request,origin}=await httpApp(t,{registerSources:[{id:'pilot',name:'Canvas test source',directory:extraDirectory}]});
  const demoBadge=app.store.issue('demo-alex',fixture('complete'),'local-demo');
  const original=app.store.get(demoBadge.badge.id).credential;
  assert.equal((await request('/api/admin/issuances')).status,401);
  assert.equal((await request('/api/admin/issuances',null,'test-reader-token')).status,401);
  assert.equal((await request('/api/admin/login',{key:'test-writer-token'},null,'https://evil.example')).status,403);
  assert.equal((await request('/api/admin/login',{key:'incorrect'})).status,401);
  const login=await request('/api/admin/login',{key:'test-writer-token'});
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);
  const cookieHeader=cookie.split(';')[0];
  const data=await (await fetch(origin+'/api/admin/issuances',{headers:{Cookie:cookieHeader}})).json();
  assert.equal(data.records.length,2);assert.equal(data.errors.length,0);
  const live=data.records.find(r=>r.sourceId==='pilot');assert.equal(live.id,issued.badge.id);
  assert.equal(live.duplicateRequests,1);assert.equal(live.history.length,3);assert.equal(live.signatureValid,true);
  assert.equal(live.status,'revoked');assert.equal(live.revocationReason,'Test revocation reason');
  assert.equal(live.evidence.assessment.score,90);
  assert.equal(live.shared,false);
  const exported=await fetch(origin+`/api/admin/issuances/pilot/${live.id}/download`,{headers:{Cookie:cookieHeader}});
  assert.equal(exported.status,200);assert.equal((await exported.json()).algorithm,'Ed25519');
  assert.equal(app.store.get(demoBadge.badge.id).credential,original);
  const logout=await fetch(origin+'/api/admin/logout',{method:'POST',headers:{Cookie:cookieHeader,Origin:origin,'Content-Type':'application/json'},body:'{}'});
  assert.equal(logout.status,200);
  assert.equal((await fetch(origin+'/api/admin/issuances',{headers:{Cookie:cookieHeader}})).status,401);
});
test('register reports unreadable sources instead of claiming an empty successful result',async t=>{
  const {request}=await httpApp(t,{registerSources:[{id:'missing',name:'Missing source',directory:join(temporary(t),'absent')}]});
  const data=await (await request('/api/admin/issuances',null,'test-writer-token')).json();
  assert.equal(data.errors.length,1);assert.equal(data.errors[0].sourceId,'missing');
  assert.match(data.errors[0].message,/incomplete/);
});
