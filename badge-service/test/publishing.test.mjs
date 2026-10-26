import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {BadgeStore,fixture} from '../core.mjs';
import {PublishingCatalog} from '../publishing.mjs';
import {initializeDrafts,saveDraft,defaultDesign} from '../designs.mjs';
import {canvasMappingInfo} from '../canvas.mjs';
import {createApp} from '../server.mjs';
const config=JSON.parse(readFileSync(new URL('../config.example.json',import.meta.url)));
const rule={canvasCourseId:42,canvasAssignmentId:77,requiredModuleIds:[8],minimumPercent:80};
const verification={valid:true,checkedAt:new Date().toISOString(),canvasCourseId:42,courseName:'A course',assignmentId:77,assignmentName:'Final',pointsPossible:10,modules:[{id:8,name:'Required module',published:true,requirementType:'all',requiredItems:[{id:80,type:'min_score',min_score:8,contentId:77}]}]};
const evidence={source:'canvas-readback',observedAt:new Date().toISOString(),canvasCourseId:42,canvasUserId:123,modules:[{...verification.modules[0],state:'completed',requiredItems:[{...verification.modules[0].requiredItems[0],completed:true}]}],assessment:{assignmentId:77,graded:true,excused:false,score:9,pointsPossible:10}};
const learners={learner1:{canvasUserId:123}};
function temporary(t){const dir=mkdtempSync(join(tmpdir(),'cu-publishing-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;}
function setup(t){const store=new BadgeStore(temporary(t),config,'http://127.0.0.1:4178');t.after(()=>store.close());initializeDrafts(store.db);const catalog=new PublishingCatalog(store);const draft=saveDraft(store.db,{...defaultDesign,criteria:'Complete the required module and earn 80% on the final.'});return {store,catalog,draft};}
test('approval freezes artwork and metadata, rejects stale draft approval and never changes older awards',t=>{
 const {store,catalog,draft}=setup(t);const old=store.issue('demo-alex',fixture('complete'),'test').badge,bytes=store.get(old.id).credential;
 const v=catalog.approve(draft.id,1,'test');assert.equal(catalog.approve(draft.id,1,'test').id,v.id);assert.match(v.artwork,/<svg/);
 saveDraft(store.db,{...draft.design,title:'A new title'},draft.id,1);assert.throws(()=>catalog.approve(draft.id,1,'test'),/current draft/);
 const newVersion=catalog.approve(draft.id,2,'test');assert.notEqual(newVersion.id,v.id);assert.equal(catalog.versions().find(r=>r.id===v.id).design.title,draft.design.title);
 assert.throws(()=>store.db.prepare('UPDATE badge_versions SET design_json=? WHERE id=?').run('{}',v.id),/immutable/);
 assert.equal(store.get(old.id).credential,bytes);
});
test('mapping activation rejects drift, preserves signed issuance across revisions and archive disables issuance',t=>{
 const {store,catalog,draft}=setup(t);const v=catalog.approve(draft.id,1,'test');const m=catalog.saveMapping(v.id,rule,verification,'test');
 assert.throws(()=>catalog.resolve(m.id),/active/);assert.throws(()=>catalog.activate(m.id,{...verification,canvasCourseId:99},'test'),/changed/);
 const changed=structuredClone(verification);changed.modules[0].requiredItems[0].min_score=7;assert.throws(()=>catalog.activate(m.id,changed,'test'),/changed/);
 catalog.activate(m.id,verification,'test');const resolved=catalog.resolve(m.id);catalog.checkEvidence(m,evidence);
 const altered=structuredClone(evidence);altered.modules[0].requiredItems[0].contentId=999;assert.throws(()=>catalog.checkEvidence(m,altered),/matches/);
 assert.throws(()=>store.issueMapped('learner1',{...evidence,canvasUserId:999},'test',resolved,learners),/identity/);
 assert.equal(store.issueMapped('learner1',{...evidence,assessment:{...evidence.assessment,score:7}},'test',resolved,learners).eligible,false);
 const issued=store.issueMapped('learner1',evidence,'test',resolved,learners);assert.equal(issued.duplicate,false);assert.equal(issued.badge.signatureValid,true);const bytes=store.get(issued.badge.id).credential;
 const credential=JSON.parse(bytes);assert.equal(credential.achievement.description,v.design.description);assert.equal(credential.achievement.image,v.artwork);assert.deepEqual(credential.courseMapping.rule,rule);
 saveDraft(store.db,{...draft.design,title:'Updated title'},draft.id,1);const v2=catalog.approve(draft.id,2,'test'),m2=catalog.saveMapping(v2.id,rule,verification,'test');catalog.activate(m2.id,verification,'test');
 assert.throws(()=>catalog.resolve(m.id),/active/);const duplicate=store.issueMapped('learner1',evidence,'test',catalog.resolve(m2.id),learners);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.badge.id,issued.badge.id);assert.equal(store.get(issued.badge.id).credential,bytes);
 const other=saveDraft(store.db,{...draft.design,title:'Another achievement'}),otherV=catalog.approve(other.id,1,'test'),otherM=catalog.saveMapping(otherV.id,rule,verification,'test');catalog.activate(otherM.id,verification,'test');assert.equal(catalog.resolve(m2.id).mapping.enabled,true);
 catalog.archive(v2.id,'test');assert.throws(()=>catalog.resolve(m2.id),/active/);assert.equal(store.get(issued.badge.id).credential,bytes);assert.equal(store.summary(store.get(issued.badge.id)).signatureValid,true);
});
test('mapping verifier reads definitions only, paginates, and rejects empty or unpublished rules',async()=>{
 const env={CANVAS_BASE_URL:'https://canvas.example.edu',CANVAS_TOKEN:'test-only'};const calls=[];
 const reader=async url=>{calls.push(url.pathname);if(url.pathname.endsWith('/courses/42'))return Response.json({id:42,name:'Course'});if(url.pathname.endsWith('/assignments/77'))return Response.json({id:77,name:'Final',published:true,points_possible:10});if(url.pathname.endsWith('/modules/8'))return Response.json({id:8,name:'Module',published:true,requirement_type:'all'});if(!url.searchParams.has('page'))return new Response('[]',{headers:{link:'<https://canvas.example.edu/api/v1/courses/42/modules/8/items?page=2>; rel="next"'}});return Response.json([{id:80,type:'Assignment',content_id:77,completion_requirement:{type:'min_score',min_score:8}}]);};
 const result=await canvasMappingInfo(rule,env,reader);assert.equal(result.valid,true);assert.equal(result.modules[0].requiredItems[0].contentId,77);assert.equal(calls.length,5);assert.ok(calls.every(url=>!url.includes('/submissions')));
 await assert.rejects(canvasMappingInfo(rule,env,async url=>url.pathname.endsWith('/modules/8')?Response.json({id:8,published:false,requirement_type:'all'}):reader(url)),/published modules/);
 await assert.rejects(canvasMappingInfo(rule,env,async url=>url.pathname.endsWith('/items')?Response.json([]):reader(url)),/published modules/);
});
test('publishing HTTP protects actions, ignores browser-supplied verification and reads fresh evidence before issuance',async t=>{
 const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));const origin=`http://127.0.0.1:${port}`;let definitionReads=0,evidenceReads=0;
 const app=createApp({directory:temporary(t),baseUrl:origin,writerToken:'writer',readerToken:'reader',mappedLearners:learners,mappingReader:async()=>{definitionReads++;return structuredClone(verification);},canvasReader:async()=>{evidenceReads++;return structuredClone(evidence);}});
 await new Promise(r=>app.server.listen(port,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.server.close(r));app.store.close();});
 const post=(path,body,headers={})=>fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 assert.equal((await fetch(origin+'/api/admin/catalog')).status,401);assert.equal((await post('/api/admin/versions/approve',{})).status,401);
 const login=await post('/api/admin/login',{key:'writer'});const headers={Cookie:login.headers.get('set-cookie').split(';')[0]};
 assert.equal((await post('/api/admin/versions/approve',{}, {...headers,Origin:'https://evil.example'})).status,403);
 const noOrigin=await fetch(origin+'/api/admin/versions/approve',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'});assert.equal(noOrigin.status,403);
 const draft=saveDraft(app.store.db,{...defaultDesign,criteria:'All required modules and 80%.'});const v=await (await post('/api/admin/versions/approve',{draftId:draft.id,revision:1},headers)).json();
 const response=await post('/api/admin/mappings',{versionId:v.id,rule,verification:{valid:true,pointsPossible:999}},headers);assert.equal(response.status,201);const mapping=await response.json();assert.equal(definitionReads,1);assert.equal(mapping.verification.pointsPossible,10);
 assert.equal((await post(`/api/admin/mappings/${mapping.id}/issue`,{learner:'learner1'},headers)).status,400);
 await post(`/api/admin/mappings/${mapping.id}/activate`,{},headers);assert.equal(definitionReads,2);
 const check=await (await post(`/api/admin/mappings/${mapping.id}/check`,{learner:'learner1'},headers)).json();assert.equal(check.eligible,true);assert.equal(app.store.list('learner1').length,0);
 const issue=await (await post(`/api/admin/mappings/${mapping.id}/issue`,{learner:'learner1',score:100},headers)).json();assert.equal(issue.eligible,true);assert.equal(evidenceReads,2);assert.equal(issue.badge.signatureValid,true);
 const repeat=await (await post(`/api/admin/mappings/${mapping.id}/issue`,{learner:'learner1'},headers)).json();assert.equal(repeat.duplicate,true);
 const register=await (await fetch(origin+'/api/admin/issuances',{headers})).json();assert.equal(register.records[0].designAttached,true);assert.equal(register.records[0].badgeVersionId,v.id);
 await post(`/api/admin/versions/${v.id}/archive`,{},headers);assert.equal((await post(`/api/admin/mappings/${mapping.id}/issue`,{learner:'learner1'},headers)).status,400);assert.equal(app.store.list('learner1').length,1);
 for(const path of ['/publishing','/publishing.js','/publishing.css','/badge-artwork.js'])assert.equal((await fetch(origin+path)).status,200);
});
test('published image overrides and description remain intact after later draft edits',t=>{
 const {catalog,store}=setup(t);const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=';
 const draft=saveDraft(store.db,{...defaultDesign,criteria:'Finish all requirements.',artworkImage:png});const v=catalog.approve(draft.id,1,'test');assert.ok(v.artwork.includes(png));assert.ok(!v.artwork.includes('<path'));saveDraft(store.db,{...draft.design,artworkImage:null,description:'Changed description'},draft.id,1);
 const frozen=catalog.versions().find(r=>r.id===v.id);assert.equal(frozen.design.description,draft.design.description);assert.equal(frozen.design.artworkImage,png);assert.equal(frozen.artwork,v.artwork);
});
