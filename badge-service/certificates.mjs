import {randomUUID,sign,verify} from 'node:crypto';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {AwardError} from './manual-awards.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const fail=message=>{throw new AwardError(message);};
export const defaultCertificate={header:'',title:'Certificate of Completion',department:'CONTINUING EDUCATION',introduction:'This certificate is presented to',completionText:'for successful completion of',closing:'In recognition of learning, dedication, and achievement.',signerName:'Continuing Education',signerTitle:'Cedarville University',footer:'FAITH · LEARNING · SERVICE',style:'classic',paper:'letter',primary:'#003A63',accent:'#FDB813',logo:null,signatureImage:null};
export function validateCertificateDesign(input){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('Invalid certificate design.');const d={};
 for(const [key,max]of Object.entries({header:140,title:55,department:80,introduction:130,completionText:80,closing:180,signerName:70,signerTitle:90,footer:110})){
  if(key==='header'&&input[key]===undefined){d.header='';continue;}
  if(typeof input[key]!=='string'||input[key].length>max||/[\u0000-\u001f\u007f]/.test(input[key])||(['title','introduction','completionText'].includes(key)&&!input[key].trim()))fail('Invalid certificate text or length.');d[key]=input[key].trim();
 }
 for(const [key,choices]of Object.entries({style:['classic','modern'],paper:['letter','a4']})){if(!choices.includes(input[key]))fail('Invalid certificate layout.');d[key]=input[key];}
 for(const key of ['primary','accent']){if(!/^#[0-9a-f]{6}$/i.test(input[key]))fail('Choose valid certificate colors.');d[key]=input[key].toUpperCase();}
 for(const key of ['logo','signatureImage']){
  d[key]=null;if(input[key]===null||input[key]===undefined)continue;
  const label=key==='logo'?'logo':'signature image',message=`Use a PNG or JPEG ${label} no larger than 2 MB.`;
  if(typeof input[key]!=='string'||input[key].length>2800000)fail(message);
  const m=input[key].match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/);if(!m)fail(message);
  const bytes=Buffer.from(m[2],'base64'),valid=m[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216;
  if(!valid||bytes.length>2*1024*1024)fail(message);d[key]=input[key];
 }

 return d;
}
export function recipientName(value){if(typeof value!=='string'||!value.trim()||value.trim().length>120||/[\u0000-\u001f\u007f]/.test(value))fail('Provide the recipient’s printed name (1–120 characters).');return value.trim();}
let activePreviewRenders=0;
export async function renderCertificate(snapshot){
 const preview=process.env.BADGE_DEMO_PREVIEW==='true';
 if(preview&&activePreviewRenders>=1)fail('Certificate preview is busy. Wait for the current PDF and try again.');
 if(preview)activePreviewRenders++;
 try {
 const bundled=join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3');
 const python=process.env.CERTIFICATE_PYTHON||(existsSync(bundled)?bundled:'python3');
 return await new Promise((resolve,reject)=>{
  const child=spawn(python,[join(root,'certificate-renderer/render.py')],{stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});let bytes=0,stderr='',chunks=[];
  const timeout=setTimeout(()=>{child.kill();reject(new AwardError('Certificate rendering timed out. Try again.'));},20000);
  child.stdout.on('data',part=>{bytes+=part.length;if(bytes>8*1024*1024){child.kill();return;}chunks.push(part);});child.stderr.on('data',part=>{if(stderr.length<1000)stderr+=part.toString();});
  child.on('error',()=>{clearTimeout(timeout);reject(new AwardError('Certificate PDF renderer is unavailable. Configure Python and the renderer requirements.'));});
  child.on('close',code=>{clearTimeout(timeout);if(code!==0||!chunks.length||bytes>8*1024*1024){const safe=['Certificate text is too long to fit. Shorten the text.','Certificate font does not support one or more characters. Configure a Unicode font or use a supported name.','Certificate logo is too large.','Certificate signature image is too large.'];reject(new AwardError(safe.includes(stderr.trim())?stderr.trim():'Certificate PDF could not be rendered. Check the renderer configuration and image.'));}else resolve(Buffer.concat(chunks));});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(snapshot));
 });
 } finally { if(preview)activePreviewRenders--; }
}
export class Certificates{
 constructor(store,awards,learners){Object.assign(this,{store,awards,learners});store.db.exec(`CREATE TABLE IF NOT EXISTS certificate_templates(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,name TEXT NOT NULL,design_json TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS certificates(id TEXT PRIMARY KEY,source_id TEXT NOT NULL,badge_id TEXT NOT NULL,learner TEXT NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL,snapshot_json TEXT NOT NULL,signature TEXT NOT NULL,UNIQUE(source_id,badge_id));
 CREATE TRIGGER IF NOT EXISTS immutable_certificate BEFORE UPDATE ON certificates BEGIN SELECT RAISE(ABORT,'Issued certificates are immutable'); END;`);}
 templates(){return this.store.db.prepare('SELECT * FROM certificate_templates ORDER BY updated_at DESC').all().map(r=>({id:r.id,revision:r.revision,name:r.name,design:JSON.parse(r.design_json),updatedAt:r.updated_at}));}
 template(id){const t=this.templates().find(t=>t.id===id);if(!t)fail('Certificate template not found.');return t;}
 async save(body,actor){const design=validateCertificateDesign(body.design),name=typeof body.name==='string'?body.name.trim():'';if(!name||name.length>80)fail('Name the certificate template (1–80 characters).');
  await renderCertificate(this.sample(design)); // No unrenderable template can be saved.
  return this.store.transaction(()=>{let id=body.id;if(id){const t=this.template(id);if(t.revision!==body.revision)fail('Certificate template changed. Reload before saving.');this.store.db.prepare('UPDATE certificate_templates SET revision=revision+1,name=?,design_json=?,updated_at=? WHERE id=?').run(name,JSON.stringify(design),new Date().toISOString(),id);}else{id=randomUUID();this.store.db.prepare('INSERT INTO certificate_templates VALUES(?,1,?,?,?)').run(id,name,JSON.stringify(design),new Date().toISOString());}this.store.audit('certificate-template-saved',null,actor);return this.template(id);});}
 sample(design,body={}){return {id:'SAMPLE',badgeId:'SAMPLE',recipientName:recipientName(body.recipientName||'Alex Morgan'),issuer:'Cedarville University',achievement:body.achievement||'Faithful Leadership',awardDate:new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}),demo:true,preview:true,design:validateCertificateDesign(design)};}
 row(source,id,learner){const db=this.awards.open(source);try{const row=db.prepare(learner===undefined?'SELECT * FROM badges WHERE id=?':'SELECT * FROM badges WHERE id=? AND learner=?').get(...(learner===undefined?[id]:[id,learner]));if(!row)throw new Error('Badge not found');if(row.revoked_at||!this.awards.valid(source,row))fail('Certificates require a valid, active award.');return row;}finally{db.close();}}
 find(source,id){return this.store.db.prepare('SELECT * FROM certificates WHERE source_id=? AND badge_id=?').get(source,id);}
 summary(row){const s=JSON.parse(row.snapshot_json);return {id:row.id,sourceId:row.source_id,badgeId:row.badge_id,learnerId:row.learner,recipientName:s.recipientName,title:s.design.title,achievement:s.achievement,createdAt:row.created_at,templateId:s.templateId,templateRevision:s.templateRevision};}
 list(){return this.store.db.prepare('SELECT * FROM certificates ORDER BY created_at DESC').all().map(r=>this.summary(r));}
 // Called inside the existing award transaction; never rewrites the signed badge.
 insert(source,row,template,name,actor){const existing=this.find(source,row.id);if(existing)return this.summary(existing);if(row.revoked_at||!this.awards.valid(source,row))fail('Certificates require a valid, active award.');
  const credential=JSON.parse(row.credential),id=randomUUID(),at=new Date().toISOString(),snapshot={id,badgeId:row.id,sourceId:source,recipientName:recipientName(name),issuer:credential.issuer.name,achievement:credential.achievement.name,awardDate:new Date(row.issued_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}),awardIssuedAt:row.issued_at,demo:credential.demonstration===true,design:template.design,templateId:template.id,templateRevision:template.revision};
  const json=JSON.stringify(snapshot),signature=sign(null,Buffer.from(json),this.store.privateKey).toString('base64url');this.store.db.prepare('INSERT INTO certificates VALUES(?,?,?,?,?,?,?,?)').run(id,source,row.id,row.learner,at,actor,json,signature);this.store.audit('certificate-created',row.id,actor);return this.summary(this.find(source,row.id));}
 async validateBatch(template,names,achievement,issuer){await renderCertificate({...this.sample(template.design,{recipientName:names[0]||'Alex Morgan',achievement}),issuer,validateNames:names});}
 async create(body,actor){if(body.confirmed!==true)fail('Confirm the printed name and award before creating the certificate.');const row=this.row(body.sourceId,body.badgeId),t=this.template(body.templateId),name=recipientName(body.recipientName);const existing=this.find(body.sourceId,body.badgeId);if(existing)return this.summary(existing);
  await renderCertificate({...this.sample(t.design,{recipientName:name,achievement:JSON.parse(row.credential).achievement.name}),issuer:JSON.parse(row.credential).issuer.name});
  return this.store.transaction(()=>{const fresh=this.row(body.sourceId,body.badgeId);if(this.template(t.id).revision!==t.revision)fail('Certificate template changed. Reload before saving.');return this.insert(body.sourceId,fresh,t,name,actor);});}
 async download(source,id,learner){this.row(source,id,learner);const row=this.find(source,id);if(!row)fail('No certificate has been created for this award.');if(!verify(null,Buffer.from(row.snapshot_json),this.store.publicKey,Buffer.from(row.signature,'base64url')))fail('Certificate integrity check failed.');const pdf=await renderCertificate(JSON.parse(row.snapshot_json));return {filename:`cu-certificate-${row.id}.pdf`,contentType:'application/pdf',data:pdf.toString('base64')};}
}
