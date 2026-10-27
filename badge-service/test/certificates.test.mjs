import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir,homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {BadgeStore,fixture} from '../core.mjs';
import {LearnerAwards} from '../learners.mjs';
import {Certificates,defaultCertificate,validateCertificateDesign,renderCertificate} from '../certificates.mjs';
import {PublishingCatalog} from '../publishing.mjs';
import {initializeDrafts,saveDraft,defaultDesign} from '../designs.mjs';
import {ManualAwards,parseAwardCsv} from '../manual-awards.mjs';
import {createApp} from '../server.mjs';
const bundledPython=join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3');
process.env.CERTIFICATE_PYTHON ||= existsSync(bundledPython)?bundledPython:'python3';
const config=JSON.parse(readFileSync(new URL('../config.example.json',import.meta.url)));
function dir(t){const path=mkdtempSync(join(tmpdir(),'cu-certificates-'));t.after(()=>rmSync(path,{recursive:true,force:true}));return path;}
function setup(t){const directory=dir(t),store=new BadgeStore(directory,config,'http://127.0.0.1:4178');t.after(()=>store.close());initializeDrafts(store.db);const awards=new LearnerAwards([{id:'workspace',name:'Test',directory}],'http://127.0.0.1:4178'),learners=structuredClone(config.learners),certificates=new Certificates(store,awards,learners),catalog=new PublishingCatalog(store),manual=new ManualAwards(store,catalog,learners,certificates);return {directory,store,awards,certificates,catalog,manual,learners};}
const save=(certificates,extra={})=>certificates.save({name:'Cedarville completion',design:{...defaultCertificate,...extra}},'test-staff');
test('PDF design validation rejects malformed fields/images, and renderer produces a single correct landscape page',async t=>{
 const {certificates,directory}=setup(t);assert.throws(()=>validateCertificateDesign({...defaultCertificate,primary:'red'}),/colors/);assert.throws(()=>validateCertificateDesign({...defaultCertificate,logo:'data:image/svg+xml;base64,PHN2Zz4='}),/PNG or JPEG/);assert.throws(()=>validateCertificateDesign({...defaultCertificate,title:'x\nspoof'}),/text/);
 const template=await save(certificates);const sample=certificates.sample(template.design,{recipientName:'Alex Morgan'}),pdf=await renderCertificate(sample);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');const path=join(directory,'sample.pdf');writeFileSync(path,pdf);
 const python=process.env.CERTIFICATE_PYTHON||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3');const inspected=spawnSync(python,['-c','import sys,json;from pypdf import PdfReader;r=PdfReader(sys.argv[1]);print(json.dumps({"pages":len(r.pages),"width":float(r.pages[0].mediabox.width),"height":float(r.pages[0].mediabox.height),"text":r.pages[0].extract_text()}))',path],{encoding:'utf8'});assert.equal(inspected.status,0,inspected.stderr);const data=JSON.parse(inspected.stdout);assert.equal(data.pages,1);assert.equal(data.width,792);assert.equal(data.height,612);for(const text of ['Certificate of Completion','Alex Morgan','Faithful Leadership','SAMPLE'])assert.ok(data.text.includes(text));
 const modern=await renderCertificate(certificates.sample({...template.design,style:'modern',paper:'a4'}));assert.equal(modern.subarray(0,5).toString(),'%PDF-');
});
test('template revisions and creation preserve original award and certificate bytes, enforce names, and safely retry',async t=>{
 const {store,certificates}=setup(t),badge=store.issue('demo-alex',fixture('complete'),'test').badge,original=store.get(badge.id),template=await save(certificates);
 const body={sourceId:'workspace',badgeId:badge.id,templateId:template.id,recipientName:'Alex Morgan',confirmed:true};await assert.rejects(certificates.create({...body,confirmed:false},'staff'),/Confirm/);await assert.rejects(certificates.create({...body,recipientName:''},'staff'),/printed name/);
 const created=await certificates.create(body,'staff'),snapshot=certificates.find('workspace',badge.id).snapshot_json,download=await certificates.download('workspace',badge.id,'demo-alex');assert.ok(download.data.startsWith('JVBER'));assert.equal(created.recipientName,'Alex Morgan');assert.equal(store.get(badge.id).credential,original.credential);assert.equal(store.get(badge.id).signature,original.signature);assert.equal(store.get(badge.id).evidence,original.evidence);
 await certificates.save({id:template.id,revision:template.revision,name:'Changed',design:{...template.design,title:'Certificate of Achievement'}},'staff');assert.equal(certificates.find('workspace',badge.id).snapshot_json,snapshot);assert.equal((await certificates.download('workspace',badge.id,'demo-alex')).data,download.data);assert.deepEqual(await certificates.create({...body,recipientName:'Forged name'},'staff'),created);
 assert.throws(()=>store.db.prepare('UPDATE certificates SET snapshot_json=? WHERE id=?').run('{}',created.id),/immutable/);await assert.rejects(certificates.save({id:template.id,revision:1,name:'Stale',design:template.design},'staff'),/changed/);
});
test('certificate downloads enforce award ownership, revocation and source signature integrity',async t=>{
 const {store,certificates}=setup(t),template=await save(certificates),badge=store.issue('demo-alex',fixture('complete'),'test').badge;
 await certificates.create({sourceId:'workspace',badgeId:badge.id,templateId:template.id,recipientName:'Alex Morgan',confirmed:true},'staff');await assert.rejects(certificates.download('workspace',badge.id,'demo-jordan'),/Badge not found/);
 const original=store.get(badge.id).credential;store.db.prepare('UPDATE badges SET credential=? WHERE id=?').run(original+' ',badge.id);await assert.rejects(certificates.download('workspace',badge.id,'demo-alex'),/valid, active/);store.db.prepare('UPDATE badges SET credential=? WHERE id=?').run(original,badge.id);store.revoke(badge.id,'Synthetic revocation test','staff');await assert.rejects(certificates.download('workspace',badge.id,'demo-alex'),/valid, active/);
});
test('manual and CSV issuance create certificates atomically only for ready named recipients; template drift invalidates previews',async t=>{
 const {store,certificates,catalog,manual}=setup(t),template=await save(certificates),draft=saveDraft(store.db,{...defaultDesign,criteria:'Required project verified.'}),v=catalog.approve(draft.id,1,'test');
 const missing=manual.preview({method:'manual',versionId:v.id,learner:'demo-alex',reason:'Reviewed',certificateTemplateId:template.id},'staff');assert.equal(missing.counts.error,1);assert.match(missing.rows[0].message,/printed name/);
 const csv='learner_id,reason,evidence_url,recipient_name\ndemo-alex,Reviewed,,Alex Morgan\ndemo-jordan,Reviewed,,Jordan Miller\nunknown,Reviewed,,Unknown Learner\n';assert.equal(parseAwardCsv(csv)[0].recipientName,'Alex Morgan');const p=manual.preview({method:'csv',versionId:v.id,csv,certificateTemplateId:template.id},'staff');await manual.preflight(p.id,'staff');assert.equal(store.list('demo-alex').length,0);assert.equal(certificates.list().length,0);
 store.db.exec("CREATE TRIGGER fail_certificate BEFORE INSERT ON certificates WHEN NEW.learner='demo-jordan' BEGIN SELECT RAISE(ABORT,'simulated certificate failure'); END");assert.throws(()=>manual.commit(p.id,'staff',true),/simulated/);assert.equal(store.list('demo-alex').length,0);assert.equal(certificates.list().length,0);store.db.exec('DROP TRIGGER fail_certificate');const done=manual.commit(p.id,'staff',true);assert.equal(done.counts.issued,2);assert.equal(done.counts.error,1);assert.equal(certificates.list().length,2);assert.ok(done.rows[0].certificateId);assert.deepEqual(manual.commit(p.id,'staff',true),done);
 const other=saveDraft(store.db,{...defaultDesign,title:'Another award',criteria:'Reviewed.'}),v2=catalog.approve(other.id,1,'test'),stale=manual.preview({method:'manual',versionId:v2.id,learner:'demo-alex',reason:'Reviewed',recipientName:'Alex Morgan',certificateTemplateId:template.id},'staff');await certificates.save({id:template.id,revision:template.revision,name:template.name,design:{...template.design,title:'Updated certificate'}},'staff');assert.throws(()=>manual.commit(stale.id,'staff',true),/changed/);assert.equal(store.list('demo-alex').length,1);
});
test('certificate HTTP endpoints separate staff authority from learner download scope and reject CSRF and identity overrides',async t=>{
 const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));const origin=`http://127.0.0.1:${port}`,app=createApp({directory:dir(t),baseUrl:origin,writerToken:'writer',readerToken:'reader',awardToken:'award'});await new Promise(r=>app.server.listen(port,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.server.close(r));app.store.close();});const badge=app.store.issue('demo-alex',fixture('complete'),'test').badge;
 const staff={Authorization:'Bearer award','X-CU-Staff-Id':'wp:5'},prefix='/api/portal-staff/certificates',post=(path,body,headers=staff)=>fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 assert.equal((await fetch(origin+prefix+'/catalog')).status,401);assert.equal((await fetch(origin+prefix+'/catalog',{headers:{Authorization:'Bearer reader'}})).status,401);const template=await (await post(prefix+'/templates',{name:'Template',design:defaultCertificate})).json();assert.ok(template.id);
 const body={sourceId:'workspace',badgeId:badge.id,templateId:template.id,recipientName:'Alex Morgan',confirmed:true,actor:'wp:999'};assert.equal((await post(prefix+'/create',body)).status,200);assert.equal(app.certificates.find('workspace',badge.id).created_by,'wp:5');
 let r=await fetch(origin+'/api/learners/demo-alex/badges',{headers:{Authorization:'Bearer reader'}});assert.equal((await r.json()).badges[0].certificateAvailable,true);const learner='/api/learners/demo-alex/badges/workspace/'+badge.id+'/certificate';assert.equal((await fetch(origin+learner)).status,401);r=await fetch(origin+learner,{headers:{Authorization:'Bearer reader'}});assert.equal(r.status,200);assert.equal((await r.json()).contentType,'application/pdf');assert.equal((await fetch(origin+learner.replace('demo-alex','demo-jordan')+'?learner=demo-alex',{headers:{Authorization:'Bearer reader'}})).status,404);
 const login=await post('/api/admin/login',{key:'writer'},{Origin:origin}),cookie={Cookie:login.headers.get('set-cookie').split(';')[0]};assert.equal((await post('/api/admin/certificates/create',body,cookie)).status,403);for(const path of ['/certificates','/certificates.js','/certificates.css'])assert.equal((await fetch(origin+path)).status,200);
});

test('signature images validate, embed in PDF, survive freezing, and can be removed from later template revisions',async t=>{
 const {directory,store,certificates}=setup(t);const image=readFileSync(new URL('./fixtures/signature-upload-example.png',import.meta.url));const signatureImage='data:image/png;base64,'+image.toString('base64');
 for(const value of ['https://example.edu/signature.png','data:image/svg+xml;base64,PHN2Zy8+', 'data:image/png;base64,QUJD', 'data:image/png;base64,'+'A'.repeat(2800001)])assert.throws(()=>validateCertificateDesign({...defaultCertificate,signatureImage:value}),/PNG or JPEG signature image/);
 const template=await save(certificates,{signatureImage}),badge=store.issue('demo-alex',fixture('complete'),'test').badge;
 await certificates.create({sourceId:'workspace',badgeId:badge.id,templateId:template.id,recipientName:'Alex Morgan',confirmed:true},'staff');const before=await certificates.download('workspace',badge.id,'demo-alex');assert.equal(JSON.parse(certificates.find('workspace',badge.id).snapshot_json).design.signatureImage,signatureImage);
 const pdfPath=join(directory,'signature.pdf');writeFileSync(pdfPath,Buffer.from(before.data,'base64'));
 const python=process.env.CERTIFICATE_PYTHON||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3');const result=spawnSync(python,['-c','import sys,json;from pypdf import PdfReader;r=PdfReader(sys.argv[1]);p=r.pages[0];print(json.dumps({"pages":len(r.pages),"images":len(list(p.images)),"text":p.extract_text()}))',pdfPath],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);const parsed=JSON.parse(result.stdout);assert.equal(parsed.pages,1);assert.equal(parsed.images,1);assert.ok(parsed.text.includes('Alex Morgan'));
 const removed=await certificates.save({id:template.id,revision:template.revision,name:template.name,design:{...template.design,signatureImage:null}},'staff');assert.equal(removed.design.signatureImage,null);assert.equal((await certificates.download('workspace',badge.id,'demo-alex')).data,before.data);
 const corrupt='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10,1,2,3]).toString('base64');await assert.rejects(save(certificates,{signatureImage:corrupt}),/could not be rendered/);
});

test('header is optional for legacy designs, left-aligned in PDF and frozen with a custom logo',async t=>{
 const {directory,store,certificates}=setup(t),legacy={...defaultCertificate};delete legacy.header;assert.equal(validateCertificateDesign(legacy).header,'');
 for(const header of [123,'x'.repeat(141),'Header\nnew line'])assert.throws(()=>validateCertificateDesign({...defaultCertificate,header}),/text/);
 const logo='data:image/png;base64,'+readFileSync(new URL('./fixtures/certificate-logo-example.png',import.meta.url)).toString('base64'),header='Continuing Education Header';
 const template=await save(certificates,{header,logo}),badge=store.issue('demo-alex',fixture('complete'),'test').badge;
 await certificates.create({sourceId:'workspace',badgeId:badge.id,templateId:template.id,recipientName:'Alex Morgan',confirmed:true},'staff');const before=await certificates.download('workspace',badge.id,'demo-alex');const path=join(directory,'header-logo.pdf');writeFileSync(path,Buffer.from(before.data,'base64'));
 const python=process.env.CERTIFICATE_PYTHON||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3');const result=spawnSync(python,['-c',`import sys,json
from pypdf import PdfReader
r=PdfReader(sys.argv[1]);points=[];image_centers=[]
def visitor(text,cm,tm,font,size):
 if text.strip()=='Continuing Education Header':points.append([tm[4],tm[5]])
def operand(op,args,cm,tm):
 if op==b'Do':image_centers.append(cm[4]+cm[0]/2)
text=r.pages[0].extract_text(visitor_text=visitor,visitor_operand_before=operand)
print(json.dumps({'pages':len(r.pages),'points':points,'images':len(list(r.pages[0].images)),'imageCenters':image_centers,'text':text}))`,path],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);const pdf=JSON.parse(result.stdout);assert.equal(pdf.pages,1);assert.deepEqual(pdf.points,[[60,550]]);assert.deepEqual(pdf.imageCenters,[396]);assert.equal(pdf.images,1);assert.ok(pdf.text.includes('Certificate of Completion'));
 const savedSnapshot=JSON.parse(certificates.find('workspace',badge.id).snapshot_json);assert.equal(savedSnapshot.design.header,header);assert.equal(savedSnapshot.design.logo,logo);
 const later=await certificates.save({id:template.id,revision:template.revision,name:template.name,design:{...template.design,header:'Different header',logo:null}},'staff');assert.equal(later.design.logo,null);assert.equal((await certificates.download('workspace',badge.id,'demo-alex')).data,before.data);
});

test('hosted demo preview bounds concurrent PDF rendering and releases the slot',async t=>{
 const {certificates}=setup(t);
 const original=process.env.BADGE_DEMO_PREVIEW;
 process.env.BADGE_DEMO_PREVIEW='true';
 try {
  const snapshot=certificates.sample(defaultCertificate,{recipientName:'Synthetic Preview Learner'});
  const first=renderCertificate(snapshot);
  await assert.rejects(renderCertificate(snapshot),/preview is busy/);
  assert.equal((await first).subarray(0,5).toString(),'%PDF-');
  assert.equal((await renderCertificate(snapshot)).subarray(0,5).toString(),'%PDF-');
 } finally {if(original===undefined)delete process.env.BADGE_DEMO_PREVIEW;else process.env.BADGE_DEMO_PREVIEW=original;}
});
