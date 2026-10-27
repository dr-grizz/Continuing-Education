import { createHash, randomUUID } from "node:crypto";
import { validateDesign, listDrafts } from "./designs.mjs";
import { renderBadge } from "./public/badge-artwork.js";
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function normalizeRule(input) {
  if (!input || typeof input !== "object")
    throw new Error("Invalid course mapping");
  for (const key of ["canvasCourseId", "canvasAssignmentId"])
    if (!Number.isSafeInteger(input[key]) || input[key] <= 0)
      throw new Error("Course and assessment IDs must be positive integers");
  if (
    !Array.isArray(input.requiredModuleIds) ||
    !input.requiredModuleIds.length ||
    input.requiredModuleIds.some(
      (id) => !Number.isSafeInteger(id) || id <= 0,
    ) ||
    new Set(input.requiredModuleIds).size !== input.requiredModuleIds.length
  )
    throw new Error("Select at least one unique required module");
  if (
    !Number.isFinite(input.minimumPercent) ||
    input.minimumPercent < 0 ||
    input.minimumPercent > 100
  )
    throw new Error("Passing percentage must be between 0 and 100");
  return {
    canvasCourseId: input.canvasCourseId,
    canvasAssignmentId: input.canvasAssignmentId,
    requiredModuleIds: [...input.requiredModuleIds].sort((a, b) => a - b),
    minimumPercent: input.minimumPercent,
  };
}
export function requirementSnapshot(modules) {
  return modules
    .map((m) => ({
      id: m.id,
      published: m.published,
      requirementType: m.requirementType,
      requiredItems: (m.requiredItems || [])
        .map((item) => ({
          id: item.id,
          contentId: item.contentId ?? null,
          pageUrl: item.pageUrl ?? null,
          externalUrl: item.externalUrl ?? null,
          itemType: item.itemType ?? null,
          type: item.type,
          ...(item.min_score !== undefined
            ? { min_score: item.min_score }
            : {}),
          ...(item.min_percentage !== undefined
            ? { min_percentage: item.min_percentage }
            : {}),
        }))
        .sort((a, b) => a.id - b.id),
    }))
    .sort((a, b) => a.id - b.id);
}
export class PublishingCatalog {
  constructor(store) {
    this.store = store;
    this.db = store.db;
  }
  async activity(action, id, actor) {
    await this.db
      .prepare(
        "INSERT INTO publishing_activity(at,action,target_id,actor) VALUES(?,?,?,?)",
      )
      .run(new Date().toISOString(), action, id, actor);
  }
  async versions() {
    return (
      await this.db
        .prepare("SELECT * FROM badge_versions ORDER BY approved_at DESC")
        .all()
    ).map((r) => ({
      id: r.id,
      draftId: r.draft_id,
      revision: r.draft_revision,
      status: r.status,
      design: JSON.parse(r.design_json),
      artwork: r.artwork_svg,
      approvedAt: r.approved_at,
      approvedBy: r.approved_by,
      activatedAt: r.activated_at,
      archivedAt: r.archived_at,
    }));
  }
  async mappings() {
    return (
      await this.db
        .prepare("SELECT * FROM course_mappings ORDER BY created_at DESC")
        .all()
    ).map((r) => ({
      id: r.id,
      versionId: r.badge_version_id,
      rule: JSON.parse(r.rule_json),
      ruleHash: r.rule_hash,
      verification: JSON.parse(r.verification_json),
      enabled: Boolean(r.enabled),
      createdAt: r.created_at,
    }));
  }
  async view() {
    return {
      drafts: await listDrafts(this.db),
      versions: await this.versions(),
      mappings: await this.mappings(),
      activity: await this.db
        .prepare("SELECT * FROM publishing_activity ORDER BY id DESC LIMIT 100")
        .all(),
    };
  }
  async approve(draftId, revision, actor) {
    return await this.store.transaction(async () => {
      const draft = (await listDrafts(this.db)).find((d) => d.id === draftId);
      if (!draft || draft.revision !== revision)
        throw new Error("Save and reload the current draft before approving");
      const previous = await (
        await this.versions()
      ).find((v) => v.draftId === draftId && v.revision === revision);
      if (previous) {
        if (previous.status === "archived")
          throw new Error(
            "Save a new draft revision to replace an archived version",
          );
        return previous;
      }
      const design = validateDesign(draft.design);
      if (!design.criteria)
        throw new Error("Add earning criteria before approving");
      const id = randomUUID();
      await this.db
        .prepare(
          "INSERT INTO badge_versions(id,draft_id,draft_revision,status,design_json,artwork_svg,approved_at,approved_by) VALUES(?,?,?,'approved',?,?,?,?)",
        )
        .run(
          id,
          draftId,
          revision,
          JSON.stringify(design),
          renderBadge(design, "published-" + id),
          new Date().toISOString(),
          actor,
        );
      await this.activity("version-approved", id, actor);
      return await (await this.versions()).find((v) => v.id === id);
    });
  }
  async saveMapping(versionId, input, verification, actor) {
    const rule = normalizeRule(input),
      ruleHash = hash(rule);
    if (
      verification?.valid !== true ||
      verification.canvasCourseId !== rule.canvasCourseId ||
      verification.assignmentId !== rule.canvasAssignmentId
    )
      throw new Error("Verify the Canvas course rules before saving");
    return await this.store.transaction(async () => {
      const version = await (
        await this.versions()
      ).find((v) => v.id === versionId);
      if (!version || version.status === "archived")
        throw new Error("Select an approved badge version");
      const existing = await (
        await this.mappings()
      ).find((m) => m.versionId === versionId && m.ruleHash === ruleHash);
      if (existing) return existing;
      const id = randomUUID();
      await this.db
        .prepare(
          "INSERT INTO course_mappings(id,badge_version_id,rule_json,rule_hash,verification_json,created_at,created_by) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          id,
          versionId,
          JSON.stringify(rule),
          ruleHash,
          JSON.stringify(verification),
          new Date().toISOString(),
          actor,
        );
      await this.activity("mapping-saved", id, actor);
      return await (await this.mappings()).find((m) => m.id === id);
    });
  }
  async activate(mappingId, freshVerification, actor) {
    return await this.store.transaction(async () => {
      const mapping = await (
          await this.mappings()
        ).find((m) => m.id === mappingId),
        version = await (
          await this.versions()
        ).find((v) => v.id === mapping?.versionId);
      if (!mapping || !version || version.status === "archived")
        throw new Error("Mapping or badge version is unavailable");
      if (
        freshVerification?.valid !== true ||
        freshVerification.canvasCourseId !== mapping.rule.canvasCourseId ||
        freshVerification.assignmentId !== mapping.rule.canvasAssignmentId ||
        hash(requirementSnapshot(freshVerification.modules)) !==
          hash(requirementSnapshot(mapping.verification.modules)) ||
        freshVerification.pointsPossible !== mapping.verification.pointsPossible
      )
        throw new Error(
          "Canvas requirements changed; save a new verified mapping",
        );
      // Replace the rule for this achievement and course; other badges remain enabled.
      for (const other of await this.mappings())
        if (
          other.enabled &&
          other.rule.canvasCourseId === mapping.rule.canvasCourseId &&
          (await (await this.versions()).find((v) => v.id === other.versionId))
            ?.draftId === version.draftId &&
          other.id !== mappingId
        ) {
          await this.db
            .prepare("UPDATE course_mappings SET enabled=0 WHERE id=?")
            .run(other.id);
          await this.activity("mapping-superseded", other.id, actor);
        }
      await this.db
        .prepare(
          "UPDATE badge_versions SET status='approved' WHERE status='active' AND id<>? AND NOT EXISTS (SELECT 1 FROM course_mappings WHERE badge_version_id=badge_versions.id AND enabled=1)",
        )
        .run(version.id);
      await this.db
        .prepare("UPDATE course_mappings SET enabled=1 WHERE id=?")
        .run(mappingId);
      await this.db
        .prepare(
          "UPDATE badge_versions SET status='active',activated_at=COALESCE(activated_at,?) WHERE id=?",
        )
        .run(new Date().toISOString(), version.id);
      await this.activity("mapping-activated", mappingId, actor);
      return await (await this.mappings()).find((m) => m.id === mappingId);
    });
  }
  async archive(versionId, actor) {
    return await this.store.transaction(async () => {
      const version = await (
        await this.versions()
      ).find((v) => v.id === versionId);
      if (!version) throw new Error("Badge version not found");
      await this.db
        .prepare(
          "UPDATE badge_versions SET status='archived',archived_at=COALESCE(archived_at,?) WHERE id=?",
        )
        .run(new Date().toISOString(), versionId);
      await this.db
        .prepare(
          "UPDATE course_mappings SET enabled=0 WHERE badge_version_id=?",
        )
        .run(versionId);
      await this.activity("version-archived", versionId, actor);
      return await (await this.versions()).find((v) => v.id === versionId);
    });
  }
  async resolve(mappingId) {
    const mapping = await (
        await this.mappings()
      ).find((m) => m.id === mappingId),
      version = await (
        await this.versions()
      ).find((v) => v.id === mapping?.versionId);
    if (!mapping?.enabled || version?.status !== "active")
      throw new Error("Only active badge mappings can issue");
    return { mapping, version };
  }
  checkEvidence(mapping, evidence) {
    if (
      evidence.source !== "canvas-readback" ||
      evidence.canvasCourseId !== mapping.rule.canvasCourseId ||
      evidence.assessment?.assignmentId !== mapping.rule.canvasAssignmentId ||
      evidence.assessment.pointsPossible !==
        mapping.verification.pointsPossible ||
      hash(requirementSnapshot(evidence.modules)) !==
        hash(requirementSnapshot(mapping.verification.modules))
    )
      throw new Error(
        "Canvas evidence no longer matches the approved course rules",
      );
  }
}
