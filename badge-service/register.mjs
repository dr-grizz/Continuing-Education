import { DatabaseSync } from 'node:sqlite';
import { createPrivateKey, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function readRegister(sources) {
  const records=[], errors=[], available=[];
  for(const source of sources){
    let db;
    try {
      db=new DatabaseSync(join(source.directory,'badges.sqlite'),{readOnly:true});
      const key=createPublicKey(createPrivateKey(readFileSync(join(source.directory,'issuer-private.pem'))));
      const rows=db.prepare('SELECT * FROM badges ORDER BY issued_at DESC').all();
      const audit=db.prepare('SELECT id,at,action,badge_id,actor FROM audit ORDER BY id').all();
      const sourceRecords=rows.map(row=>{
        const credential=JSON.parse(row.credential), evidence=JSON.parse(row.evidence);
        const history=audit.filter(event=>event.badge_id===row.id);
        return {sourceId:source.id,sourceName:source.name,id:row.id,learnerId:row.learner,
          achievementId:row.course,ruleVersion:row.rule_version,title:credential.achievement?.name||'Untitled achievement',
          issuer:credential.issuer?.name||'Unknown issuer',issuedAt:row.issued_at,status:row.revoked_at?'revoked':'issued',
          shared:Boolean(row.shared),revokedAt:row.revoked_at,revocationReason:row.revocation_reason,
          signatureValid:verify(null,Buffer.from(row.credential),key,Buffer.from(row.signature,'base64url')),
          credentialFormat:credential.format||'Unknown',criteria:credential.achievement?.criteria||'',
          description:credential.achievement?.description||null,badgeVersionId:row.badge_version_id||null,courseMappingId:row.course_mapping_id||null,artwork:credential.achievement?.image||null,mappingRule:credential.courseMapping?.rule||null,designAttached:Boolean(credential.achievement?.image),
          keyId:credential.issuer?.kid||null,credentialUrl:credential.id||null,
          demo:credential.demonstration===true,evidence:{source:evidence.source,observedAt:evidence.observedAt,
            method:evidence.method||null,actor:evidence.actor||null,reason:evidence.reason||null,evidenceUrl:evidence.evidenceUrl||null,batchId:evidence.batchId||null,
            canvasCourseId:evidence.canvasCourseId||null,canvasUserId:evidence.canvasUserId||null,
            modules:(evidence.modules||[]).map(module=>({id:module.id,state:module.state,published:module.published??null,
              requirementType:module.requirementType||null,requiredItems:module.requiredItems||[]})),
            assessment:evidence.assessment?{graded:evidence.assessment.graded,excused:evidence.assessment.excused,
              score:evidence.assessment.score,pointsPossible:evidence.assessment.pointsPossible,
              assignmentId:evidence.assessment.assignmentId||null}:null},
          history,duplicateRequests:history.filter(e=>e.action==='duplicate-skipped').length};
      });
      records.push(...sourceRecords);
      available.push({id:source.id,name:source.name,records:sourceRecords.length});
    }catch{
      errors.push({sourceId:source.id,sourceName:source.name,message:'This record source could not be read. Results are incomplete.'});
    }finally{db?.close();}
  }
  records.sort((a,b)=>b.issuedAt.localeCompare(a.issuedAt)||a.id.localeCompare(b.id));
  return {retrievedAt:new Date().toISOString(),records,sources:available,errors};
}

export function registerEnvelope(sources,sourceId,id){
  const source=sources.find(s=>s.id===sourceId);
  if(!source)throw new Error('Issuance record not found');
  const db=new DatabaseSync(join(source.directory,'badges.sqlite'),{readOnly:true});
  try{
    const row=db.prepare('SELECT credential,signature FROM badges WHERE id=?').get(id);
    if(!row)throw new Error('Issuance record not found');
    const credential=JSON.parse(row.credential);
    return {format:'cu-pilot-signed-envelope-v1',algorithm:'Ed25519',kid:credential.issuer.kid,
      payload:Buffer.from(row.credential).toString('base64url'),signature:row.signature,
      notice:'Local pilot format; not a certified Open Badges credential. Check current issuer status separately.'};
  }finally{db.close();}
}
