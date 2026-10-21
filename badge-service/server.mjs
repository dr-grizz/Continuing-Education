import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BadgeStore, fixture, eligibility } from './core.mjs';
import { canvasEvidence, canvasMappingInfo } from './canvas.mjs';
import { initializeDrafts, listDrafts, saveDraft } from './designs.mjs';
import { LearnerAwards } from './learners.mjs';
import { PublishingCatalog, normalizeRule } from './publishing.mjs';
import { readRegister, registerEnvelope } from './register.mjs';
import { Certificates, defaultCertificate, renderCertificate } from './certificates.mjs';
import { ManualAwards, AwardError, CSV_TEMPLATE, reportCsv } from './manual-awards.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function createApp({ directory = join(root,'data'), config = JSON.parse(readFileSync(join(root,'config.example.json'))),
  baseUrl = 'http://127.0.0.1:4178', demo = true, writerToken, readerToken, awardToken, canvasReader = canvasEvidence, mappingReader=canvasMappingInfo,mappedLearners={},registerSources=[] } = {}) {
  const origin = new URL(baseUrl).origin;
  if (!['127.0.0.1','localhost'].includes(new URL(origin).hostname)) throw new Error('This pilot is restricted to a loopback origin');
  if (demo && (config.course.id !== 'demo-faith-work' || Object.values(config.learners).some(l => l.canvasUserId !== null))) throw new Error('Demo mode cannot use live identity mappings');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  function tokenFile(name, supplied) {
    if (supplied) return supplied;
    const path = join(directory,name);
    if (!existsSync(path)) writeFileSync(path,randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
    return readFileSync(path,'utf8').trim();
  }
  const tokens = { writer: tokenFile('writer-token',writerToken), reader: tokenFile('portal-token',readerToken), award: tokenFile('portal-award-token',awardToken) };
  const sources=[{id:'workspace',name:demo?'Local workspace':'Active Canvas pilot',directory},...registerSources];
  const sessions=new Map(),learnerSessions=new Map();
  const awards=new LearnerAwards(sources,origin);
  const store = new BadgeStore(directory,config,origin,demo ? 'demo' : 'canvas');
  initializeDrafts(store.db);
  const catalog=new PublishingCatalog(store);
  const learners={...config.learners,...mappedLearners};
  const certificates=new Certificates(store,awards,learners);
  const manualAwards=new ManualAwards(store,catalog,learners,certificates);
  function learnerCollection(id){const result=awards.list(id);return {...result,badges:result.badges.map(b=>({...b,certificateAvailable:Boolean(certificates.find(b.sourceId,b.id))&&b.signatureValid&&b.status==='issued'}))};}
  function authenticated(request, role) {
    const candidate = request.headers.authorization?.replace(/^Bearer /,'') || '';
    const expected = tokens[role];
    return candidate.length === expected.length && timingSafeEqual(Buffer.from(candidate),Buffer.from(expected));
  }
  function validWriterKey(candidate){
    if(typeof candidate!=='string')return false;
    const offered=Buffer.from(candidate),expected=Buffer.from(tokens.writer);
    return offered.length===expected.length&&timingSafeEqual(offered,expected);
  }
  function sessionId(request){return request.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith('cu_register_session='))?.slice('cu_register_session='.length);}
  function portalManager(request){
    const staff=request.headers['x-cu-staff-id'];
    return request.url?.startsWith('/api/portal-admin/') && authenticated(request,'award') && typeof staff==='string' && /^portal:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(staff) ? staff : null;
  }
  function registerAuthenticated(request){
    if(portalManager(request))return true;
    const id=sessionId(request),until=sessions.get(id);
    if(until&&until>Date.now())return true;
    if(id)sessions.delete(id);
    return authenticated(request,'writer');
  }
  function me(request){const id=request.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith('cu_learner_session='))?.slice('cu_learner_session='.length);const session=learnerSessions.get(id);if(session&&session.until>Date.now())return session;if(id)learnerSessions.delete(id);return null;}
  const server = createServer(async (request,response) => {
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Referrer-Policy','no-referrer');
    response.setHeader('Cache-Control','no-store');
    response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    function send(status,body,type = 'application/json') {
      response.writeHead(status,{'Content-Type': `${type}; charset=utf-8`});
      response.end(type === 'application/json' ? JSON.stringify(body) : body);
    }
    try {
      // Reject DNS rebinding and cross-site access to this local application.
      if (request.headers.host !== new URL(origin).host) return send(403,{error:'Unexpected host'});
      if (request.headers.origin && request.headers.origin !== origin) return send(403,{error:'Unexpected origin'});
      const url = new URL(request.url,origin);
      const portalActor=portalManager(request);
      if(url.pathname.startsWith('/api/portal-admin/')&&!portalActor)return send(401,{error:'Trusted portal staff authentication required'});
      const path = portalActor ? url.pathname.replace('/api/portal-admin/','/api/').replace(/^\/api\/(?!designer\/)/,'/api/admin/') : url.pathname;
      const certificateRoute=/^\/api\/(admin|portal-staff)\/certificates(?:\/|$)/.test(path);
      const awardMatch=path.match(/^\/api\/(admin|portal-staff)\/(?:awards|certificates)(?:\/(.*))?$/);
      let awardActor=null;
      if(awardMatch){
        if(awardMatch[1]==='admin'){
          if(!registerAuthenticated(request))return send(401,{error:'Issuer access required'});
          if(request.method!=='GET'&&!portalActor&&!authenticated(request,'writer')&&request.headers.origin!==origin)return send(403,{error:'Award actions require this page origin'});
          awardActor=portalActor||'local-issuer';
        }else{
          if(!authenticated(request,'award'))return send(401,{error:'Staff award authentication required'});
          const staff=request.headers['x-cu-staff-id'];
          if(typeof staff!=='string'||!/^wp:[1-9][0-9]{0,19}$/.test(staff)&&!/^portal:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(staff))return send(400,{error:'Trusted staff identity required'});
          awardActor=staff;
        }
        if(request.method==='GET'){
          const route=awardMatch[2]||'';
          if(certificateRoute){
            if(route==='catalog'){const register=readRegister(sources);return send(200,{templates:certificates.templates(),defaults:defaultCertificate,certificates:certificates.list(),awards:register.records.map(r=>({sourceId:r.sourceId,id:r.id,learnerId:r.learnerId,title:r.title,issuer:r.issuer,issuedAt:r.issuedAt,status:r.status,signatureValid:r.signatureValid,demo:r.demo,recipientName:learners[r.learnerId]?.displayName||'',certificate:certificates.find(r.sourceId,r.id)?certificates.summary(certificates.find(r.sourceId,r.id)):null})),errors:register.errors});}
            const pdf=route.match(/^pdf\/([a-z0-9-]+)\/([0-9a-f-]+)$/);if(pdf&&uuid.test(pdf[2]))return send(200,await certificates.download(pdf[1],pdf[2]));
            return send(404,{error:'Route not found'});
          }
          if(route==='catalog')return send(200,manualAwards.catalogView());
          if(route==='history')return send(200,{batches:manualAwards.history(awardActor)});
          if(route==='template.csv'){response.setHeader('Content-Disposition','attachment; filename="cu-award-template.csv"');return send(200,CSV_TEMPLATE,'text/csv');}
          const batch=route.match(/^([0-9a-f-]+)(\/report.csv)?$/);
          if(batch&&uuid.test(batch[1])){const result=manualAwards.get(batch[1],awardActor);if(batch[2]){response.setHeader('Content-Disposition',`attachment; filename="cu-awards-${result.id}.csv"`);return send(200,reportCsv(result),'text/csv');}return send(200,result);}
          return send(404,{error:'Route not found'});
        }
      }
      if(request.method==='GET'&&['/awards','/awards.js','/awards.css','/certificates','/certificates.js','/certificates.css'].includes(path)){
        const file=path==='/awards'?'awards.html':path==='/certificates'?'certificates.html':path.slice(1);
        return send(200,readFileSync(join(root,file.endsWith('.html')?'public':'portal-bridge/assets',file),'utf8'),file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':'text/css');
      }
      if (request.method === 'GET' && ['/','/app.js','/style.css','/issuer','/issuer.js','/issuer.css','/issuances','/issuances.js','/issuances.css','/badge-artwork.js','/publishing','/publishing.js','/publishing.css','/my-badges','/my-badges.js','/my-badges.css'].includes(path)) {
        if (path.startsWith('/issuer') && !demo) return send(404,{error:'Local issuer studio is unavailable in live mode'});
        const file = path === '/' ? 'index.html' : path === '/issuer' ? 'issuer.html' : path==='/issuances'?'issuances.html':path==='/publishing'?'publishing.html':path==='/my-badges'?'my-badges.html':path.slice(1);
        return send(200,readFileSync(join(root,['my-badges.js','my-badges.css'].includes(file)?'portal-bridge/assets':'public',file),'utf8'),file.endsWith('html') ? 'text/html' : file.endsWith('js') ? 'text/javascript' : 'text/css');
      }
      if (request.method === 'GET' && path === '/health') return send(200,{status:'ok',demo,productionReady:false});
      if (request.method === 'GET' && path === '/.well-known/jwks.json') return send(200,{keys:[{...store.jwk,kid:store.kid,use:'sig',alg:'EdDSA'}]});
      if (request.method === 'GET' && path === '/api/demo/badges' && demo) return send(200,{badges:store.list('demo-alex').map(r => store.summary(r))});
      if (request.method === 'GET' && path === '/api/designer/drafts' && demo) return send(200,{drafts:listDrafts(store.db)});
      if(request.method==='GET'&&path==='/api/admin/session')return send(registerAuthenticated(request)?200:401,{authenticated:registerAuthenticated(request)});
      if(request.method==='GET'&&path==='/api/admin/catalog'){
        if(!registerAuthenticated(request))return send(401,{error:'Issuer access required'});
        return send(200,{...catalog.view(),previewLearners:Object.keys(learners),learners:Object.keys(learners).filter(id=>Number.isSafeInteger(learners[id].canvasUserId)),defaults:{canvasCourseId:9943,canvasAssignmentId:644426,requiredModuleIds:[192647],minimumPercent:80}});
      }
      if(request.method==='GET'&&path==='/api/admin/issuances'){
        if(!registerAuthenticated(request))return send(401,{error:'Issuer access required'});
        const register=readRegister(sources);return send(200,{...register,records:register.records.map(r=>({...r,certificate:certificates.find(r.sourceId,r.id)?certificates.summary(certificates.find(r.sourceId,r.id)):null}))});
      }
      const registerDownload=path.match(/^\/api\/admin\/issuances\/([a-z0-9-]+)\/([0-9a-f-]+)\/download$/);
      if(request.method==='GET'&&registerDownload&&uuid.test(registerDownload[2])){
        if(!registerAuthenticated(request))return send(401,{error:'Issuer access required'});
        response.setHeader('Content-Disposition',`attachment; filename="cu-credential-${registerDownload[2]}.json"`);
        return send(200,registerEnvelope(sources,registerDownload[1],registerDownload[2]));
      }
      if(request.method==='GET'&&path==='/api/me/session'){const session=me(request);if(!session)return send(401,{error:'Sign in through the CU Portal to view your badges.'});return send(200,{learner:session.learner,preview:true});}
      const meCertificate=path.match(/^\/api\/me\/badges\/([a-z0-9-]+)\/([0-9a-f-]+)\/certificate$/);
      if(request.method==='GET'&&meCertificate&&uuid.test(meCertificate[2])){const session=me(request);if(!session)return send(401,{error:'Learner sign-in required'});return send(200,await certificates.download(meCertificate[1],meCertificate[2],session.learner));}
      const portalCertificate=path.match(/^\/api\/learners\/([^/]+)\/badges\/([a-z0-9-]+)\/([0-9a-f-]+)\/certificate$/);
      if(request.method==='GET'&&portalCertificate&&uuid.test(portalCertificate[3])){if(!authenticated(request,'reader'))return send(401,{error:'Portal authentication required'});const learner=decodeURIComponent(portalCertificate[1]);if(!Object.hasOwn(learners,learner))return send(404,{error:'Unknown learner'});return send(200,await certificates.download(portalCertificate[2],portalCertificate[3],learner));}
      if(request.method==='GET'&&path==='/api/me/badges'){const session=me(request);if(!session)return send(401,{error:'Learner sign-in required'});return send(200,learnerCollection(session.learner));}
      const meDownload=path.match(/^\/api\/me\/badges\/([a-z0-9-]+)\/([0-9a-f-]+)\/download$/);
      if(request.method==='GET'&&meDownload&&uuid.test(meDownload[2])){const session=me(request);if(!session)return send(401,{error:'Learner sign-in required'});response.setHeader('Content-Disposition',`attachment; filename="cu-credential-${meDownload[2]}.json"`);return send(200,awards.envelope(meDownload[1],meDownload[2],session.learner));}
      const portalDownload=path.match(/^\/api\/learners\/([^/]+)\/badges\/([a-z0-9-]+)\/([0-9a-f-]+)\/download$/);
      if(request.method==='GET'&&portalDownload&&uuid.test(portalDownload[3])){if(!authenticated(request,'reader'))return send(401,{error:'Portal authentication required'});const learner=decodeURIComponent(portalDownload[1]);if(!Object.hasOwn(learners,learner))return send(404,{error:'Unknown learner'});return send(200,awards.envelope(portalDownload[2],portalDownload[3],learner));}
      const sourcePublic=path.match(/^\/(verify|api\/public)\/([a-z0-9-]+)\/([0-9a-f-]+)$/);
      if(request.method==='GET'&&sourcePublic&&uuid.test(sourcePublic[3])){const badge=awards.public(sourcePublic[2],sourcePublic[3]);if(!badge)return send(404,{error:'Badge is not publicly shared'});if(sourcePublic[1]==='api/public')return send(200,badge);
        return send(200,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Badge verification | CU Portal</title><link rel="stylesheet" href="/my-badges.css"></head><body><header class="cu-header"><a class="cu-brand" href="/my-badges">CU <span>PORTAL</span></a></header><main class="cu-badges"><p class="cu-eyebrow">CREDENTIAL VERIFICATION</p><h1>${escape(badge.title)}</h1><section class="cu-card"><h2>${badge.status==='revoked'?'Revoked':badge.signatureValid?'Signature verified':'Verification failed'}</h2>${badge.artwork?`<img class="cu-artwork" alt="Badge artwork" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(badge.artwork)}">`:''}<p>${escape(badge.description||'')}</p><p>${escape(badge.criteria)}</p><p>Issued by ${escape(badge.issuer)} · ${escape(badge.issuedAt)}</p><p class="cu-note">${badge.demo?'Fictional demonstration credential. ':''}CU pilot format; not a certified Open Badges credential. Signature integrity does not establish accreditation.</p></section></main></body></html>`,'text/html');}
      const publicMatch = path.match(/^\/(verify|api\/public)\/([0-9a-f-]+)$/);
      if (request.method === 'GET' && publicMatch && uuid.test(publicMatch[2])) {
        const row = store.get(publicMatch[2]);
        if (!row?.shared) return send(404,{error:'Badge is not publicly shared'});
        const badge = store.summary(row);
        if (publicMatch[1] === 'api/public') return send(200,badge);
        return send(200,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>CU badge verification</title><link rel="stylesheet" href="/style.css"></head><body><main><p class="eyebrow">CU PORTAL · CREDENTIAL VERIFICATION</p><h1>${escape(badge.title)}</h1><p class="notice">${badge.demo ? 'Fictional demonstration credential' : 'Pilot credential'} · Not a certified Open Badges credential</p><section class="card"><h2>${badge.status === 'revoked' ? 'Revoked' : badge.signatureValid ? 'Signature verified' : 'Verification failed'}</h2><p>${escape(badge.criteria)}</p><p>Issued: ${escape(badge.issuedAt)}</p><p>Issuer: ${escape(JSON.parse(row.credential).issuer.name)}</p><p>Signature integrity: ${badge.signatureValid ? 'Verified' : 'Invalid'}</p><p>Issuer identity and accreditation have not been independently established.</p></section><a href="/">Return to local pilot</a></main></body></html>`,'text/html');
      }
      const learnerMatch = path.match(/^\/api\/learners\/([^/]+)\/badges$/);
      if (request.method === 'GET' && learnerMatch) {
        if (!authenticated(request,'reader')) return send(401,{error:'Portal authentication required'});
        const learner = decodeURIComponent(learnerMatch[1]);
        if (!Object.hasOwn(learners,learner)) return send(404,{error:'Unknown learner'});
        return send(200,learnerCollection(learner));
      }
      const downloadMatch = path.match(/^\/api\/(demo\/)?badges\/([0-9a-f-]+)\/download$/);
      if (request.method === 'GET' && downloadMatch && uuid.test(downloadMatch[2])) {
        const isDemo = demo && downloadMatch[1];
        if (!isDemo && !authenticated(request,'reader')) return send(401,{error:'Portal authentication required'});
        const row = store.get(downloadMatch[2]);
        if (!row || (isDemo && row.learner !== 'demo-alex')) return send(404,{error:'Badge not found'});
        response.setHeader('Content-Disposition',`attachment; filename="cu-pilot-${row.id}.json"`);
        return send(200,store.envelope(row.id));
      }
      if (request.method !== 'POST') return send(404,{error:'Route not found'});
      const demoRoute = demo && path.startsWith('/api/demo/');
      const designerRoute = path.startsWith('/api/designer/');
      const loginRoute=path==='/api/admin/login'||path==='/api/admin/logout';
      if(loginRoute&&request.headers.origin!==origin)return send(403,{error:'Sign-in requires this page origin'});
      if (designerRoute && (!demo || (!portalActor && request.headers.origin !== origin))) return send(403,{error:'Designer actions require the local studio origin'});
      if (demoRoute && request.headers.origin !== origin) return send(403,{error:'Demo actions require this page origin'});
      const adminRoute=path.startsWith('/api/admin/')&&!loginRoute;
      const meRoute=path.startsWith('/api/me/'),portalShare=path.match(/^\/api\/learners\/([^/]+)\/badges\/([a-z0-9-]+)\/([0-9a-f-]+)\/sharing$/);
      if(meRoute&&request.headers.origin!==origin)return send(403,{error:'Learner actions require this page origin'});
      if(meRoute&&!me(request))return send(401,{error:'Learner sign-in required'});
      if(portalShare&&!authenticated(request,'reader'))return send(401,{error:'Portal authentication required'});
      if(adminRoute&&!portalActor&&!authenticated(request,'writer')&&request.headers.origin!==origin)return send(403,{error:'Publishing actions require this page origin'});
      if(adminRoute&&!registerAuthenticated(request))return send(401,{error:'Issuer access required'});
      if (!demoRoute && !designerRoute && !loginRoute && !adminRoute && !meRoute && !portalShare && !awardActor && !authenticated(request,'writer')) return send(401,{error:'Issuer authentication required'});
      if (!request.headers['content-type']?.startsWith('application/json')) return send(415,{error:'JSON required'});
      const chunks=[];let size=0;
      for await (const part of request) {
        chunks.push(part);size+=part.length;
        if (size > (designerRoute||certificateRoute ? 6*1024*1024 : awardActor ? 2*1024*1024 : 16384)) return send(413,{error:'Request too large'});
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400,{error:'Invalid JSON'}); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return send(400,{error:'JSON object required'});
      if(awardActor){
        if(certificateRoute){
          if(awardMatch[2]==='templates')return send(200,await certificates.save(body,awardActor));
          if(awardMatch[2]==='preview'){let sample=certificates.sample(body.design,body);if(body.sourceId&&body.badgeId){const row=certificates.row(body.sourceId,body.badgeId),c=JSON.parse(row.credential);sample={...sample,issuer:c.issuer.name,achievement:c.achievement.name,awardDate:new Date(row.issued_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'})};}return send(200,{filename:'certificate-preview.pdf',contentType:'application/pdf',data:(await renderCertificate(sample)).toString('base64')});}
          if(awardMatch[2]==='create')return send(200,await certificates.create(body,awardActor));
          return send(404,{error:'Route not found'});
        }
        if(awardMatch[2]==='preview'){const preview=manualAwards.preview(body,awardActor);await manualAwards.preflight(preview.id,awardActor);return send(200,preview);}
        const commit=awardMatch[2]?.match(/^([0-9a-f-]+)\/commit$/);
        if(commit&&uuid.test(commit[1])){await manualAwards.preflight(commit[1],awardActor);return send(200,manualAwards.commit(commit[1],awardActor,body.confirmed));}
        return send(404,{error:'Route not found'});
      }
      if(path==='/api/admin/login'){
        if(!validWriterKey(body.key))return send(401,{error:'The issuer access key is incorrect.'});
        const id=randomBytes(32).toString('base64url');sessions.set(id,Date.now()+8*60*60*1000);
        response.setHeader('Set-Cookie',`cu_register_session=${id}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=28800`);
        return send(200,{authenticated:true});
      }
      if(path==='/api/admin/logout'){
        sessions.delete(sessionId(request));
        response.setHeader('Set-Cookie','cu_register_session=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0');
        return send(200,{authenticated:false});
      }
      if(meRoute){const session=me(request);const match=path.match(/^\/api\/me\/badges\/([a-z0-9-]+)\/([0-9a-f-]+)\/sharing$/);if(match&&uuid.test(match[2]))return send(200,awards.share(match[1],match[2],session.learner,body.shared));if(path==='/api/me/logout'){const id=request.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith('cu_learner_session='))?.slice('cu_learner_session='.length);learnerSessions.delete(id);response.setHeader('Set-Cookie','cu_learner_session=; HttpOnly; SameSite=Strict; Path=/api/me; Max-Age=0');return send(200,{authenticated:false});}return send(404,{error:'Route not found'});}
      if(portalShare&&uuid.test(portalShare[3])){const learner=decodeURIComponent(portalShare[1]);if(!Object.hasOwn(learners,learner))return send(404,{error:'Unknown learner'});return send(200,awards.share(portalShare[2],portalShare[3],learner,body.shared));}
      if(adminRoute){
        if(path==='/api/admin/learner-preview'){if(typeof body.learner!=='string'||!Object.hasOwn(learners,body.learner))return send(400,{error:'Unknown learner'});const id=randomBytes(32).toString('base64url');learnerSessions.set(id,{learner:body.learner,until:Date.now()+60*60*1000});response.setHeader('Set-Cookie',`cu_learner_session=${id}; HttpOnly; SameSite=Strict; Path=/api/me; Max-Age=3600`);return send(200,{learner:body.learner,preview:true});}
        if(path==='/api/admin/versions/approve')return send(201,catalog.approve(body.draftId,body.revision,portalActor||'local-issuer'));
        if(path==='/api/admin/mappings'){
          const rule=normalizeRule(body.rule),verification=await mappingReader(rule);
          return send(201,catalog.saveMapping(body.versionId,rule,verification,portalActor||'local-issuer'));
        }
        const activate=path.match(/^\/api\/admin\/mappings\/([0-9a-f-]+)\/activate$/);
        if(activate){const mapping=catalog.mappings().find(m=>m.id===activate[1]);if(!mapping)throw new Error('Mapping or badge version is unavailable');
          const fresh=await mappingReader(mapping.rule);return send(200,catalog.activate(mapping.id,fresh,portalActor||'local-issuer'));}
        const archive=path.match(/^\/api\/admin\/versions\/([0-9a-f-]+)\/archive$/);
        if(archive)return send(200,catalog.archive(archive[1],portalActor||'local-issuer'));
        const check=path.match(/^\/api\/admin\/mappings\/([0-9a-f-]+)\/(check|issue)$/);
        if(check){
          const selected=catalog.resolve(check[1]);
          if(typeof body.learner!=='string'||!Object.hasOwn(learners,body.learner)||!Number.isSafeInteger(learners[body.learner].canvasUserId))throw new Error('Learner has no approved identity mapping');
          const evidence=await canvasReader({course:selected.mapping.rule,learners},body.learner);
          const current=catalog.resolve(check[1]);catalog.checkEvidence(current.mapping,evidence);
          if(evidence.canvasUserId!==learners[body.learner].canvasUserId)throw new Error('Learner has no approved identity mapping');
          if(check[2]==='check')return send(200,{...eligibility(current.mapping.rule,evidence),evidence});
          return send(200,store.issueMapped(body.learner,evidence,portalActor||'local-issuer',current,learners));
        }
        return send(404,{error:'Route not found'});
      }
      if (designerRoute && path === '/api/designer/drafts') return send(201,saveDraft(store.db,body.design));
      const draftMatch = path.match(/^\/api\/designer\/drafts\/([0-9a-f-]+)$/);
      if (designerRoute && draftMatch && uuid.test(draftMatch[1])) return send(200,saveDraft(store.db,body.design,draftMatch[1],body.revision));
      if (demoRoute && path === '/api/demo/issue') return send(200,store.issue('demo-alex',fixture(body.scenario),'local-demo'));
      if (!demoRoute && path === '/api/sync') {
        if (demo) return send(409,{error:'Disable demo mode and configure approved Canvas mappings first'});
        if (typeof body.learner !== 'string' || !Object.hasOwn(config.learners,body.learner)) return send(400,{error:'Unknown learner'});
        const evidence = await canvasReader(config,body.learner);
        return send(200,store.issue(body.learner,evidence,'canvas-worker'));
      }
      const action = path.match(/^\/api\/(demo\/)?badges\/([0-9a-f-]+)\/(share|revoke)$/);
      if (action && uuid.test(action[2])) {
        const row = store.get(action[2]);
        if (!row || (demoRoute && row.learner !== 'demo-alex')) return send(404,{error:'Badge not found'});
        if (action[3] === 'share') {
          if (typeof body.shared !== 'boolean') return send(400,{error:'shared must be a boolean'});
          return send(200,store.share(row.id,body.shared,demoRoute ? 'local-demo' : 'trusted-portal'));
        }
        return send(200,store.revoke(row.id,body.reason,demoRoute ? 'local-demo' : 'issuer-worker'));
      }
      return send(404,{error:'Route not found'});
    } catch (error) {
      // Never return upstream URLs, tokens, or stack traces.
      const safe = ['Badge not found','shared must be a boolean','Only valid, active badges can be shared','Unknown demonstration scenario','A revocation reason of 1–500 characters is required','Approved Canvas IDs are not configured','Canvas connection is not configured','Invalid badge design','Badge draft not found','Draft changed elsewhere; reload before saving'];
      const publishingErrors=['Invalid course mapping','Course and assessment IDs must be positive integers','Select at least one unique required module','Passing percentage must be between 0 and 100','Save and reload the current draft before approving','Save a new draft revision to replace an archived version','Add earning criteria before approving','Verify the Canvas course rules before saving','Select an approved badge version','Mapping or badge version is unavailable','Canvas requirements changed; save a new verified mapping','Badge version not found','Only active badge mappings can issue','Canvas evidence no longer matches the approved course rules','Learner has no approved identity mapping','Select a published assessment with positive points in this course','Select published modules that require all specified items'];
      send(error.message==='Badge not found'?404:400,{error:error instanceof AwardError || [...safe,...publishingErrors].includes(error.message) ? error.message : 'Operation failed; no new badge issued'});
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  return {server,store,catalog,manualAwards,certificates};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.BADGE_PORT || 4178);
  const config = process.env.BADGE_CONFIG ? JSON.parse(readFileSync(process.env.BADGE_CONFIG)) : undefined;
  const registerSources=existsSync(join(root,'data/course-9943/badges.sqlite'))
    &&process.env.BADGE_DATA_DIR!==join(root,'data/course-9943')?[{id:'course-9943',name:'Canvas pilot · course 9943',directory:join(root,'data/course-9943')}]:[];
  const mappedLearners=existsSync(join(root,'pilot/course-9943.local.json'))?JSON.parse(readFileSync(join(root,'pilot/course-9943.local.json'))).learners:{};
  const app = createApp({directory:process.env.BADGE_DATA_DIR,config,baseUrl:`http://127.0.0.1:${port}`,mappedLearners,demo:process.env.BADGE_DEMO !== 'false',registerSources});
  app.server.listen(port,'127.0.0.1',() => console.log(`CU badge pilot: http://127.0.0.1:${port} (loopback only)`));
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal,() => app.server.close(() => { app.store.close(); process.exit(0); }));
}
