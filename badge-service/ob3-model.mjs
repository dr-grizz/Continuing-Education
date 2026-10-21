// Stage 1 only: data model + offline schema/JSON-LD checks, never credential issuance.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import Ajv2019 from 'ajv/dist/2019.js';
import addFormats from 'ajv-formats';
import jsonld from 'jsonld';
import {validateDesign} from './designs.mjs';

const directory=new URL('./standards/ob3/vendor/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',directory)));
const pinned=new Map();
for(const file of manifest.files){
  const bytes=readFileSync(new URL(file.file,directory));
  if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error('Open Badges reference checksum mismatch: '+file.file);
  pinned.set(file.url,JSON.parse(bytes));
}
export const OB3_CONTEXTS=Object.freeze(['https://www.w3.org/ns/credentials/v2','https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json','https://purl.imsglobal.org/spec/ob/v3p0/extensions.json']);
export const OB3_SCHEMA='https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json';
const ajv=new Ajv2019({allErrors:true,strict:true,strictTypes:false,strictTuples:false});addFormats(ajv);
const schemaCheck=ajv.compile(pinned.get(OB3_SCHEMA));
const dateCheck=ajv.compile({type:'string',format:'date-time'});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const subjectIdPattern=/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function https(value){try{const u=new URL(value);return typeof value==='string'&&u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash;}catch{return false;}}
function credentialUrl(value,issuerId){if(!https(value)||!https(issuerId))return false;const u=new URL(value);return u.origin===new URL(issuerId).origin&&u.pathname.startsWith('/credentials/')&&uuid.test(u.pathname.slice('/credentials/'.length));}
function instant(value,label){if(!dateCheck(value)||!Number.isFinite(Date.parse(value)))throw new Error(label+' must be an RFC 3339 timestamp with timezone');return new Date(value).toISOString();}
function freeze(value){if(object(value)||Array.isArray(value)){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}

// Inputs must come from a trusted backend catalogue and pre-verified recipient registry.
// A registry record is an identity precondition, not an identity-verification algorithm.
export function buildUnsignedOpenBadge({badgeVersion,issuer,credentialId,learnerId,recipientRegistry,validFrom,validUntil}={}){
  if(!object(badgeVersion)||!['approved','active'].includes(badgeVersion.status)||!uuid.test(badgeVersion.id)||!Number.isSafeInteger(badgeVersion.revision)||badgeVersion.revision<1)throw new Error('An approved, non-archived badge version is required');
  const design=validateDesign(badgeVersion.design);
  if(!design.criteria)throw new Error('Approved badge earning criteria are required');
  if(typeof badgeVersion.artwork!=='string'||!badgeVersion.artwork.startsWith('<svg ')||badgeVersion.artwork.length>6*1024*1024)throw new Error('Frozen approved SVG artwork is required');
  if(!object(issuer)||!https(issuer.id)||typeof issuer.name!=='string'||issuer.name!==design.issuer||(issuer.url!==undefined&&!https(issuer.url)))throw new Error('An HTTPS issuer profile matching the approved badge issuer is required');
  if(!credentialUrl(credentialId,issuer.id))throw new Error('A stable HTTPS credential ID using the issuer origin and an opaque UUID is required');
  if(typeof learnerId!=='string'||!object(recipientRegistry)||!Object.hasOwn(recipientRegistry,learnerId))throw new Error('Learner has no verified recipient mapping');
  const recipient=recipientRegistry[learnerId];
  if(!object(recipient)||recipient.verified!==true||!subjectIdPattern.test(recipient.subjectId)||!['canvas-sis-match','institutional-identity','synthetic-test'].includes(recipient.method))throw new Error('Learner has no verified opaque recipient mapping');
  const from=instant(validFrom,'validFrom'),verifiedAt=instant(recipient.verifiedAt,'Recipient verification time');
  if(Date.parse(verifiedAt)>Date.parse(from))throw new Error('Recipient mapping must be verified before credential validity begins');
  instant(badgeVersion.approvedAt,'Badge approval time');
  if(Date.parse(badgeVersion.approvedAt)>Date.parse(from))throw new Error('The badge version must be approved before credential validity begins');
  const until=validUntil===undefined?undefined:instant(validUntil,'validUntil');
  if(until&&Date.parse(until)<=Date.parse(from))throw new Error('validUntil must be later than validFrom');
  const image={id:'data:image/svg+xml;base64,'+Buffer.from(badgeVersion.artwork).toString('base64'),type:'Image',caption:design.title};
  const profile={id:issuer.id,type:['Profile'],name:issuer.name,...(issuer.url?{url:issuer.url}:{})};
  return freeze({'@context':[...OB3_CONTEXTS],id:credentialId,type:['VerifiableCredential','OpenBadgeCredential'],
    name:design.title,description:design.description,image,issuer:profile,validFrom:from,...(until?{validUntil:until}:{}),
    credentialSchema:[{id:OB3_SCHEMA,type:'1EdTechJsonSchemaValidator2019'}],
    credentialSubject:{id:recipient.subjectId,type:['AchievementSubject'],achievement:{
      id:new URL('/achievements/'+badgeVersion.id,issuer.id).href,type:['Achievement'],version:String(badgeVersion.revision),
      name:design.title,description:design.description,criteria:{narrative:design.criteria},image
    }}});
}

// No fetch fallback: unknown/changed contexts must be reviewed and explicitly pinned.
export async function loadPinnedOb3Document(url){if(!pinned.has(url))throw new Error('Unpinned JSON-LD document is not allowed');return {contextUrl:null,documentUrl:url,document:structuredClone(pinned.get(url))};}
function profileErrors(model){
  const errors=[],add=(path,message)=>errors.push({source:'cu-model-profile',path,message});
  const keys=(value,allowed,path)=>{if(!object(value))return;for(const key of Object.keys(value))if(!allowed.includes(key))add(path+'/'+key,'Field is outside the unsigned CU model profile');};
  const types=(value,expected,path)=>{if(JSON.stringify(value)!==JSON.stringify(expected))add(path,'Unexpected canonical type array');};
  if(!object(model)){add('','Credential must be an object');return errors;}
  keys(model,['@context','id','type','name','description','image','issuer','validFrom','validUntil','credentialSchema','credentialSubject'],'');
  if(JSON.stringify(model['@context'])!==JSON.stringify(OB3_CONTEXTS))add('/@context','Use the exact pinned context order');
  types(model.type,['VerifiableCredential','OpenBadgeCredential'],'/type');
  if(!credentialUrl(model.id,model.issuer?.id))add('/id','Credential ID must use the issuer HTTPS origin and an opaque credential UUID');
  if(!object(model.issuer)||!https(model.issuer.id))add('/issuer','Issuer must be an HTTPS Profile object');
  keys(model.issuer,['id','type','name','url'],'/issuer');types(model.issuer?.type,['Profile'],'/issuer/type');
  if(typeof model.issuer?.name!=='string'||!model.issuer.name.trim())add('/issuer/name','Issuer name is required');
  if(model.issuer?.url!==undefined&&!https(model.issuer.url))add('/issuer/url','Issuer homepage must use HTTPS');
  keys(model.credentialSubject,['id','type','achievement'],'/credentialSubject');
  if(!subjectIdPattern.test(model.credentialSubject?.id))add('/credentialSubject/id','Use the registry-mapped opaque UUID URI');
  types(model.credentialSubject?.type,['AchievementSubject'],'/credentialSubject/type');
  const achievement=model.credentialSubject?.achievement;
  keys(achievement,['id','type','version','name','description','criteria','image'],'/credentialSubject/achievement');
  types(achievement?.type,['Achievement'],'/credentialSubject/achievement/type');
  let expected=null;try{expected=new URL(model.issuer.id).origin;}catch{}
  if(!https(achievement?.id)||!expected||!achievement.id.startsWith(expected+'/achievements/')||!uuid.test(achievement.id.slice((expected+'/achievements/').length)))add('/credentialSubject/achievement/id','Achievement ID must bind the issuer origin to a frozen version UUID');
  if(typeof achievement?.version!=='string'||!/^[1-9][0-9]*$/.test(achievement.version))add('/credentialSubject/achievement/version','A positive approved revision is required');
  for(const key of ['name','description'])if(typeof model[key]!=='string'||!model[key].trim()||model[key]!==achievement?.[key])add('/'+key,'Credential and achievement text must match');
  keys(achievement?.criteria,['narrative'],'/credentialSubject/achievement/criteria');
  if(typeof achievement?.criteria?.narrative!=='string'||!achievement.criteria.narrative.trim())add('/credentialSubject/achievement/criteria/narrative','Earning criteria narrative is required');
  for(const [path,image]of [['/image',model.image],['/credentialSubject/achievement/image',achievement?.image]]){
    keys(image,['id','type','caption'],path);
    if(!object(image)||image.type!=='Image'||typeof image.id!=='string'||!/^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+={0,2}$/.test(image.id)||!Buffer.from(image.id.split(',')[1],'base64').toString().startsWith('<svg ')||image.caption!==model.name)add(path,'Use the frozen SVG as an embedded Image with matching caption');
  }
  if(JSON.stringify(model.image)!==JSON.stringify(achievement?.image))add('/image','Credential and achievement artwork must match');
  if(JSON.stringify(model.credentialSchema)!==JSON.stringify([{id:OB3_SCHEMA,type:'1EdTechJsonSchemaValidator2019'}]))add('/credentialSchema','Use the pinned official schema descriptor');
  if(model.validUntil!==undefined&&dateCheck(model.validFrom)&&dateCheck(model.validUntil)&&Date.parse(model.validUntil)<=Date.parse(model.validFrom))add('/validUntil','Expiration must follow validity start');
  return errors;
}
export async function validateUnsignedOpenBadge(model){
  const schemaValid=schemaCheck(model),errors=(schemaCheck.errors||[]).map(e=>({source:'official-schema',path:e.instancePath,message:e.message}));
  errors.push(...profileErrors(model));let jsonLdValid=false;
  if(!errors.length){try{const expanded=await jsonld.expand(model,{documentLoader:loadPinnedOb3Document,safe:true});if(expanded.length!==1)throw new Error('Expected one expanded credential');jsonLdValid=true;}catch(error){errors.push({source:'json-ld',path:'/@context',message:'Pinned-context expansion failed: '+error.message});}}
  return {stage:'unsigned-model',valid:errors.length===0,schemaValid,jsonLdValid,proofVerified:false,issuerAuthorityVerified:false,statusChecked:false,errors};
}
