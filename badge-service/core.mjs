import { DatabaseSync } from 'node:sqlite';
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign, verify } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function validateConfig(config) {
  const c = config.course;
  if (!config.issuerName || !c?.id || !c.title || !c.ruleVersion ||
      !Array.isArray(c.requiredModuleIds) || !c.requiredModuleIds.length ||
      c.requiredModuleIds.some(id => !Number.isSafeInteger(id) || id <= 0) ||
      new Set(c.requiredModuleIds).size !== c.requiredModuleIds.length ||
      !Number.isFinite(c.minimumPercent) || c.minimumPercent < 0 || c.minimumPercent > 100 ||
      !config.learners || typeof config.learners !== 'object') throw new Error('Invalid pilot configuration');
  return config;
}

export function eligibility(course, evidence) {
  if (!Array.isArray(evidence.modules)) return { eligible: false, reasons: ['Module evidence missing'] };
  const reasons = [];
  for (const id of course.requiredModuleIds) {
    const matches = evidence.modules.filter(m => m.id === id);
    if (matches.length !== 1 || matches[0].state !== 'completed') reasons.push(`Required module ${id} is incomplete or ambiguous`);
    if (evidence.source === 'canvas-readback' && matches.length === 1) {
      const module = matches[0];
      if (module.published !== true || module.requirementType !== 'all' ||
          !Array.isArray(module.requiredItems) || !module.requiredItems.length) {
        reasons.push(`Required module ${id} lacks verified published completion requirements`);
      } else if (module.requiredItems.some(item => item.completed !== true)) {
        reasons.push(`Required module ${id} has unmet item requirements`);
      }
    }
  }
  const a = evidence.assessment;
  if (!a || a.graded !== true || a.excused === true || !Number.isFinite(a.score) ||
      !Number.isFinite(a.pointsPossible) || a.pointsPossible <= 0 || a.score < 0 ||
      a.score / a.pointsPossible * 100 < course.minimumPercent) reasons.push('Final assessment does not meet the passing rule');
  return { eligible: reasons.length === 0, reasons };
}

export function fixture(scenario) {
  if (!['complete', 'incomplete', 'below-threshold'].includes(scenario)) throw new Error('Unknown demonstration scenario');
  return {
    source: 'fictional-demo',
    observedAt: new Date().toISOString(),
    modules: [1,2,3,4,5,6].map(id => ({ id, state: scenario === 'incomplete' && id === 6 ? 'started' : 'completed' })),
    assessment: { graded: true, excused: false, score: scenario === 'below-threshold' ? 79 : 90, pointsPossible: 100 }
  };
}

export class BadgeStore {
  constructor(directory, config, baseUrl, mode = 'demo') {
    this.config = validateConfig(config);
    this.baseUrl = baseUrl;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    const keyPath = join(directory, 'issuer-private.pem');
    const dbPath = join(directory, 'badges.sqlite');
    if (!existsSync(keyPath)) {
      if (existsSync(dbPath)) throw new Error('Signing key missing: restore the original key rather than replacing it');
      const pair = generateKeyPairSync('ed25519');
      writeFileSync(keyPath, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
    }
    chmodSync(keyPath, 0o600);
    this.privateKey = createPrivateKey(readFileSync(keyPath));
    this.publicKey = createPublicKey(this.privateKey);
    this.jwk = this.publicKey.export({ format: 'jwk' });
    this.kid = createHash('sha256').update(JSON.stringify(this.jwk)).digest('hex').slice(0,24);
    this.db = new DatabaseSync(dbPath);
    chmodSync(dbPath, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS badges (
        id TEXT PRIMARY KEY, learner TEXT NOT NULL, course TEXT NOT NULL, rule_version TEXT NOT NULL,
        issued_at TEXT NOT NULL, credential TEXT NOT NULL, signature TEXT NOT NULL,
        evidence TEXT NOT NULL, shared INTEGER NOT NULL DEFAULT 0,
        revoked_at TEXT, revocation_reason TEXT,
        UNIQUE(learner, course, rule_version)
      );
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit (
        id INTEGER PRIMARY KEY, at TEXT NOT NULL, action TEXT NOT NULL,
        badge_id TEXT, actor TEXT NOT NULL
      );`);
    const fingerprint = createHash('sha256').update(JSON.stringify({course:config.course,issuer:config.issuerName,baseUrl,mode})).digest('hex');
    const previous = this.db.prepare("SELECT value FROM metadata WHERE key='configuration'").get();
    if (previous && previous.value !== fingerprint) {
      this.db.close();
      throw new Error('Issuer, rules, origin or demo mode changed: use a new pilot data directory or a reviewed migration');
    }
    this.db.prepare("INSERT OR IGNORE INTO metadata(key,value) VALUES('configuration',?)").run(fingerprint);
    const columns=new Set(this.db.prepare('PRAGMA table_info(badges)').all().map(c=>c.name));
    for(const name of ['badge_version_id','course_mapping_id','award_key'])if(!columns.has(name))this.db.exec(`ALTER TABLE badges ADD COLUMN ${name} TEXT`);
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS mapped_award_key ON badges(award_key) WHERE award_key IS NOT NULL');
  }
  transaction(callback) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = callback(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  audit(action, id, actor) {
    this.db.prepare('INSERT INTO audit(at,action,badge_id,actor) VALUES(?,?,?,?)').run(new Date().toISOString(),action,id,actor);
  }
  get(id) { return this.db.prepare('SELECT * FROM badges WHERE id=?').get(id); }
  list(learner) { return this.db.prepare('SELECT * FROM badges WHERE learner=? ORDER BY issued_at DESC').all(learner); }
  summary(row) {
    const credential = JSON.parse(row.credential);
    const signatureValid = verify(null, Buffer.from(row.credential), this.publicKey, Buffer.from(row.signature, 'base64url'));
    return { id: row.id, title: credential.achievement.name, issuedAt: row.issued_at,
      status: row.revoked_at ? 'revoked' : 'issued', signatureValid, shared: Boolean(row.shared),
      verificationUrl: row.shared ? `${this.baseUrl}/verify/${row.id}` : null,
      demo: credential.demonstration, criteria: credential.achievement.criteria };
  }
  issue(learner, evidence, actor) {
    if (!Object.hasOwn(this.config.learners, learner)) throw new Error('Learner has no approved identity mapping');
    if (!['fictional-demo','canvas-readback'].includes(evidence.source)) throw new Error('Unsupported evidence source');
    const decision = eligibility(this.config.course, evidence);
    if (!decision.eligible) return { ...decision, badge: null };
    return this.transaction(() => {
      const c = this.config.course;
      const existing = this.db.prepare('SELECT * FROM badges WHERE learner=? AND course=? AND rule_version=?').get(learner,c.id,c.ruleVersion);
      if (existing) {
        this.audit('duplicate-skipped', existing.id, actor);
        return { eligible: true, duplicate: true, badge: this.summary(existing) };
      }
      const id = randomUUID();
      const issuedAt = new Date().toISOString();
      // Deliberately a signed CU prototype envelope, not an OpenBadgeCredential.
      // A standards issuer adapter must replace this before production credentials.
      const credential = JSON.stringify({ format: 'cu-pilot-credential-v1', id: `${this.baseUrl}/verify/${id}`,
        issuer: { name: this.config.issuerName, publicKey: `${this.baseUrl}/.well-known/jwks.json`, kid: this.kid },
        subject: `urn:uuid:${randomUUID()}`, issuedAt, demonstration: evidence.source === 'fictional-demo',
        achievement: { id: c.id, version: c.ruleVersion, name: c.title,
          criteria: `Complete all ${c.requiredModuleIds.length} required modules and earn at least ${c.minimumPercent}% on the final assessment.` } });
      const signature = sign(null, Buffer.from(credential), this.privateKey).toString('base64url');
      this.db.prepare('INSERT INTO badges(id,learner,course,rule_version,issued_at,credential,signature,evidence) VALUES(?,?,?,?,?,?,?,?)')
        .run(id, learner,c.id,c.ruleVersion,issuedAt,credential,signature,JSON.stringify(evidence));
      this.audit('issued',id,actor);
      return { eligible: true, duplicate: false, badge: this.summary(this.get(id)) };
    });
  }
  issueMapped(learner,evidence,actor,{mapping,version},learners){
    if(!Object.hasOwn(learners,learner)||!Number.isSafeInteger(learners[learner].canvasUserId)||evidence.canvasUserId!==learners[learner].canvasUserId||evidence.source!=='canvas-readback')throw new Error('Learner has no approved identity mapping');
    const decision=eligibility(mapping.rule,evidence);if(!decision.eligible)return {...decision,badge:null};
    return this.transaction(()=>{
      const enabled=this.db.prepare('SELECT enabled,badge_version_id FROM course_mappings WHERE id=?').get(mapping.id);
      const active=this.db.prepare('SELECT status FROM badge_versions WHERE id=?').get(version.id);
      if(!enabled?.enabled||enabled.badge_version_id!==version.id||active?.status!=='active')throw new Error('Only active badge mappings can issue');
      const awardKey=createHash('sha256').update(JSON.stringify([learner,version.draftId,mapping.rule.canvasCourseId])).digest('hex');
      const existing=this.db.prepare('SELECT * FROM badges WHERE award_key=? OR (learner=? AND course=? AND rule_version=?) ORDER BY issued_at LIMIT 1').get(awardKey,learner,`badge:${version.draftId}`,'manual-v1');
      if(existing){this.audit('duplicate-skipped',existing.id,actor);return {eligible:true,duplicate:true,badge:this.summary(existing)};}
      const id=randomUUID(),issuedAt=new Date().toISOString();
      const credential=JSON.stringify({format:'cu-pilot-credential-v1',id:`${this.baseUrl}/verify/${id}`,
        issuer:{name:version.design.issuer,publicKey:`${this.baseUrl}/.well-known/jwks.json`,kid:this.kid},
        subject:`urn:uuid:${randomUUID()}`,issuedAt,demonstration:false,
        achievement:{id:`badge:${version.draftId}`,version:version.id,revision:version.revision,name:version.design.title,
          description:version.design.description,criteria:version.design.criteria,image:version.artwork,design:version.design},
        courseMapping:{id:mapping.id,ruleVersion:mapping.ruleHash,rule:mapping.rule}});
      const signature=sign(null,Buffer.from(credential),this.privateKey).toString('base64url');
      this.db.prepare('INSERT INTO badges(id,learner,course,rule_version,issued_at,credential,signature,evidence,badge_version_id,course_mapping_id,award_key) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(id,learner,`badge:${version.draftId}`,mapping.ruleHash,issuedAt,credential,signature,JSON.stringify(evidence),version.id,mapping.id,awardKey);
      this.audit('issued',id,actor);return {eligible:true,duplicate:false,badge:this.summary(this.get(id))};
    });
  }
  share(id, shared, actor) {
    return this.transaction(() => {
      if (!this.get(id)) throw new Error('Badge not found');
      this.db.prepare('UPDATE badges SET shared=? WHERE id=?').run(shared ? 1 : 0,id);
      this.audit(shared ? 'sharing-enabled' : 'sharing-disabled',id,actor);
      return this.summary(this.get(id));
    });
  }
  revoke(id, reason, actor) {
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 500) throw new Error('A revocation reason of 1–500 characters is required');
    return this.transaction(() => {
      const row = this.get(id);
      if (!row) throw new Error('Badge not found');
      if (!row.revoked_at) {
        this.db.prepare('UPDATE badges SET revoked_at=?, revocation_reason=? WHERE id=?').run(new Date().toISOString(),reason,id);
        this.audit('revoked',id,actor);
      }
      return this.summary(this.get(id));
    });
  }
  envelope(id) {
    const row = this.get(id);
    if (!row) throw new Error('Badge not found');
    return { format: 'cu-pilot-signed-envelope-v1', algorithm: 'Ed25519', kid: this.kid,
      payload: Buffer.from(row.credential).toString('base64url'), signature: row.signature,
      notice: 'Local pilot format; not a certified Open Badges credential. Check current issuer status separately.' };
  }
  close() { this.db.close(); }
}
