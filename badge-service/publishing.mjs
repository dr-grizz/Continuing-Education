import { createHash, randomUUID } from 'node:crypto';
import { validateDesign, listDrafts } from './designs.mjs';
import { renderBadge } from './public/badge-artwork.js';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function normalizeRule(input){
  if(!input||typeof input!=='object')throw new Error('Invalid course mapping');
  for(const key of ['canvasCourseId','canvasAssignmentId'])if(!Number.isSafeInteger(input[key])||input[key]<=0)throw new Error('Course and assessment IDs must be positive integers');
  if(!Array.isArray(input.requiredModuleIds)||!input.requiredModuleIds.length||input.requiredModuleIds.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(input.requiredModuleIds).size!==input.requiredModuleIds.length)throw new Error('Select at least one unique required module');
  if(!Number.isFinite(input.minimumPercent)||input.minimumPercent<0||input.minimumPercent>100)throw new Error('Passing percentage must be between 0 and 100');
  return {canvasCourseId:input.canvasCourseId,canvasAssignmentId:input.canvasAssignmentId,requiredModuleIds:[...input.requiredModuleIds].sort((a,b)=>a-b),minimumPercent:input.minimumPercent};
}
export function requirementSnapshot(modules){return modules.map(m=>({id:m.id,published:m.published,requirementType:m.requirementType,
  requiredItems:(m.requiredItems||[]).map(item=>({id:item.id,contentId:item.contentId??null,pageUrl:item.pageUrl??null,externalUrl:item.externalUrl??null,itemType:item.itemType??null,type:item.type,...(item.min_score!==undefined?{min_score:item.min_score}:{}),...(item.min_percentage!==undefined?{min_percentage:item.min_percentage}:{})})).sort((a,b)=>a.id-b.id)})).sort((a,b)=>a.id-b.id);}

export class PublishingCatalog{
  constructor(store){
    this.store=store;this.db=store.db;
    this.db.exec(`CREATE TABLE IF NOT EXISTS badge_versions (
      id TEXT PRIMARY KEY,draft_id TEXT NOT NULL,draft_revision INTEGER NOT NULL,status TEXT NOT NULL,
      design_json TEXT NOT NULL,artwork_svg TEXT NOT NULL,approved_at TEXT NOT NULL,approved_by TEXT NOT NULL,
      activated_at TEXT,archived_at TEXT,UNIQUE(draft_id,draft_revision),FOREIGN KEY(draft_id) REFERENCES badge_drafts(id)
    );
    CREATE TABLE IF NOT EXISTS course_mappings (
      id TEXT PRIMARY KEY,badge_version_id TEXT NOT NULL,rule_json TEXT NOT NULL,rule_hash TEXT NOT NULL,
      verification_json TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,created_by TEXT NOT NULL,
      FOREIGN KEY(badge_version_id) REFERENCES badge_versions(id),UNIQUE(badge_version_id,rule_hash)
    );
    CREATE TABLE IF NOT EXISTS publishing_activity (id INTEGER PRIMARY KEY,at TEXT NOT NULL,action TEXT NOT NULL,target_id TEXT NOT NULL,actor TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS immutable_badge_version BEFORE UPDATE OF draft_id,draft_revision,design_json,artwork_svg ON badge_versions
    BEGIN SELECT RAISE(ABORT,'Published badge snapshots are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS immutable_course_mapping BEFORE UPDATE OF badge_version_id,rule_json,rule_hash,verification_json ON course_mappings
    BEGIN SELECT RAISE(ABORT,'Course rule snapshots are immutable'); END;`);
  }
  activity(action,id,actor){this.db.prepare('INSERT INTO publishing_activity(at,action,target_id,actor) VALUES(?,?,?,?)').run(new Date().toISOString(),action,id,actor);}
  versions(){return this.db.prepare('SELECT * FROM badge_versions ORDER BY approved_at DESC').all().map(r=>({id:r.id,draftId:r.draft_id,revision:r.draft_revision,status:r.status,design:JSON.parse(r.design_json),artwork:r.artwork_svg,approvedAt:r.approved_at,approvedBy:r.approved_by,activatedAt:r.activated_at,archivedAt:r.archived_at}));}
  mappings(){return this.db.prepare('SELECT * FROM course_mappings ORDER BY created_at DESC').all().map(r=>({id:r.id,versionId:r.badge_version_id,rule:JSON.parse(r.rule_json),ruleHash:r.rule_hash,verification:JSON.parse(r.verification_json),enabled:Boolean(r.enabled),createdAt:r.created_at}));}
  view(){return {drafts:listDrafts(this.db),versions:this.versions(),mappings:this.mappings(),activity:this.db.prepare('SELECT * FROM publishing_activity ORDER BY id DESC LIMIT 100').all()};}
  approve(draftId,revision,actor){return this.store.transaction(()=>{
    const draft=listDrafts(this.db).find(d=>d.id===draftId);
    if(!draft||draft.revision!==revision)throw new Error('Save and reload the current draft before approving');
    const previous=this.versions().find(v=>v.draftId===draftId&&v.revision===revision);
    if(previous){if(previous.status==='archived')throw new Error('Save a new draft revision to replace an archived version');return previous;}
    const design=validateDesign(draft.design);if(!design.criteria)throw new Error('Add earning criteria before approving');
    const id=randomUUID();this.db.prepare('INSERT INTO badge_versions(id,draft_id,draft_revision,status,design_json,artwork_svg,approved_at,approved_by) VALUES(?,?,?,\'approved\',?,?,?,?)')
      .run(id,draftId,revision,JSON.stringify(design),renderBadge(design,'published-'+id),new Date().toISOString(),actor);
    this.activity('version-approved',id,actor);return this.versions().find(v=>v.id===id);
  });}
  saveMapping(versionId,input,verification,actor){
    const rule=normalizeRule(input),ruleHash=hash(rule);
    if(verification?.valid!==true||verification.canvasCourseId!==rule.canvasCourseId||verification.assignmentId!==rule.canvasAssignmentId)throw new Error('Verify the Canvas course rules before saving');
    return this.store.transaction(()=>{
      const version=this.versions().find(v=>v.id===versionId);if(!version||version.status==='archived')throw new Error('Select an approved badge version');
      const existing=this.mappings().find(m=>m.versionId===versionId&&m.ruleHash===ruleHash);if(existing)return existing;
      const id=randomUUID();this.db.prepare('INSERT INTO course_mappings(id,badge_version_id,rule_json,rule_hash,verification_json,created_at,created_by) VALUES(?,?,?,?,?,?,?)')
        .run(id,versionId,JSON.stringify(rule),ruleHash,JSON.stringify(verification),new Date().toISOString(),actor);
      this.activity('mapping-saved',id,actor);return this.mappings().find(m=>m.id===id);
    });
  }
  activate(mappingId,freshVerification,actor){return this.store.transaction(()=>{
    const mapping=this.mappings().find(m=>m.id===mappingId),version=this.versions().find(v=>v.id===mapping?.versionId);
    if(!mapping||!version||version.status==='archived')throw new Error('Mapping or badge version is unavailable');
    if(freshVerification?.valid!==true||freshVerification.canvasCourseId!==mapping.rule.canvasCourseId||freshVerification.assignmentId!==mapping.rule.canvasAssignmentId||hash(requirementSnapshot(freshVerification.modules))!==hash(requirementSnapshot(mapping.verification.modules))||freshVerification.pointsPossible!==mapping.verification.pointsPossible)throw new Error('Canvas requirements changed; save a new verified mapping');
    // Replace the rule for this achievement and course; other badges remain enabled.
    for(const other of this.mappings())if(other.enabled&&other.rule.canvasCourseId===mapping.rule.canvasCourseId&&this.versions().find(v=>v.id===other.versionId)?.draftId===version.draftId&&other.id!==mappingId){
      this.db.prepare('UPDATE course_mappings SET enabled=0 WHERE id=?').run(other.id);this.activity('mapping-superseded',other.id,actor);
    }
    this.db.prepare("UPDATE badge_versions SET status='approved' WHERE status='active' AND id<>? AND NOT EXISTS (SELECT 1 FROM course_mappings WHERE badge_version_id=badge_versions.id AND enabled=1)").run(version.id);
    this.db.prepare('UPDATE course_mappings SET enabled=1 WHERE id=?').run(mappingId);
    this.db.prepare('UPDATE badge_versions SET status=\'active\',activated_at=COALESCE(activated_at,?) WHERE id=?').run(new Date().toISOString(),version.id);
    this.activity('mapping-activated',mappingId,actor);return this.mappings().find(m=>m.id===mappingId);
  });}
  archive(versionId,actor){return this.store.transaction(()=>{
    const version=this.versions().find(v=>v.id===versionId);if(!version)throw new Error('Badge version not found');
    this.db.prepare('UPDATE badge_versions SET status=\'archived\',archived_at=COALESCE(archived_at,?) WHERE id=?').run(new Date().toISOString(),versionId);
    this.db.prepare('UPDATE course_mappings SET enabled=0 WHERE badge_version_id=?').run(versionId);
    this.activity('version-archived',versionId,actor);return this.versions().find(v=>v.id===versionId);
  });}
  resolve(mappingId){
    const mapping=this.mappings().find(m=>m.id===mappingId),version=this.versions().find(v=>v.id===mapping?.versionId);
    if(!mapping?.enabled||version?.status!=='active')throw new Error('Only active badge mappings can issue');
    return {mapping,version};
  }
  checkEvidence(mapping,evidence){
    if(evidence.source!=='canvas-readback'||evidence.canvasCourseId!==mapping.rule.canvasCourseId||evidence.assessment?.assignmentId!==mapping.rule.canvasAssignmentId||
      evidence.assessment.pointsPossible!==mapping.verification.pointsPossible||hash(requirementSnapshot(evidence.modules))!==hash(requirementSnapshot(mapping.verification.modules)))throw new Error('Canvas evidence no longer matches the approved course rules');
  }
}
