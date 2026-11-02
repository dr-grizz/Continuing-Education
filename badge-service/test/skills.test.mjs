import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BadgeStore } from "../core.mjs";
import { defaultDesign, saveDraft } from "../designs.mjs";
import { PublishingCatalog } from "../publishing.mjs";
import { ManualAwards } from "../manual-awards.mjs";
import { Certificates, defaultCertificate } from "../certificates.mjs";
import { LearnerAwards } from "../learners.mjs";
import { LaborMarket, resolveSkillSelections } from "../skills.mjs";
import {
  importLaborMarket,
  laborSources,
  digest,
  normalizeOnet,
  validateBls,
} from "../labor-import.mjs";
const config = JSON.parse(
  readFileSync(new URL("../config.example.json", import.meta.url)),
);
export function skillFixture(suffix = "one") {
  const occupations = {
    table_id: "occupation_data",
    row: [
      {
        onetsoc_code: "15-1252.00",
        title: "Software Developers",
        description: "Develop software systems.",
      },
      {
        onetsoc_code: "13-1151.00",
        title: "Training and Development Specialists",
        description: "Plan and conduct workforce training.",
      },
    ],
  };
  const elements = {
    table_id: "content_model_reference",
    row: [
      {
        element_id: "2.A.2.a",
        element_name: "Critical Thinking " + suffix,
        description: "Use reasoning to compare approaches.",
      },
      {
        element_id: "2.B.1.a",
        element_name: "Social Perceptiveness",
        description: "Notice and understand reactions.",
      },
    ],
  };
  const essential = {
    table_id: "essential_skills",
    row: occupations.row.map((o) => ({
      onetsoc_code: o.onetsoc_code,
      element_id: "2.A.2.a",
      scale_id: "IM",
      data_value: 4,
      not_relevant: null,
      recommend_suppress: "N",
      date_updated: "2025-08-01",
    })),
  };
  const transferable = {
    table_id: "transferable_skills",
    row: [
      {
        onetsoc_code: "13-1151.00",
        element_id: "2.B.1.a",
        scale_id: "IM",
        data_value: 2,
        recommend_suppress: "N",
      },
    ],
  };
  const software = {
    table_id: "software_skills",
    row: [
      {
        onetsoc_code: "15-1252.00",
        workplace_example: "Microsoft Excel",
        element_id: "2.E.1",
        element_name: "Spreadsheet software",
      },
    ],
  };
  const wages = [
    {
      soc_code: "15-1252",
      region: "US",
      region_name: "United States",
      year: 2025,
      median_annual: 100000,
      median_hourly: 48.08,
      annual_marker: null,
      hourly_marker: null,
    },
    {
      soc_code: "15-1252",
      region: "OH",
      region_name: "Ohio",
      year: 2025,
      median_annual: null,
      median_hourly: 42.5,
      annual_marker: "#",
      hourly_marker: null,
    },
  ];
  const projections = [
    {
      soc_code: "15-1252",
      title: "Software Developers",
      base_year: 2025,
      end_year: 2035,
      percent_change: 12.5,
      annual_openings: 123400,
    },
  ];
  return {
    onetData: { occupations, elements, essential, transferable, software },
    blsData: { wages, projections },
    hashes: Object.fromEntries(
      Object.keys(laborSources).map((name) => [name, digest(name + suffix)]),
    ),
  };
}
async function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), "ce-skills-")),
    store = await BadgeStore.open(directory, config, "http://127.0.0.1:4178");
  t.after(async () => {
    await store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const fixture = skillFixture(),
    release = await importLaborMarket(store.db.pool, fixture),
    market = new LaborMarket(store.db);
  return { store, directory, fixture, release, market };
}
test("reference import is idempotent, immutable, atomically activated, and rejects source drift", async (t) => {
  const s = await setup(t),
    same = await importLaborMarket(s.store.db.pool, s.fixture);
  assert.equal(same.onet, s.release.onet);
  assert.equal(same.bls, s.release.bls);
  await assert.rejects(
    () =>
      s.store.db.query(
        "UPDATE labor_skills SET name='forged' WHERE release_id=$1",
        [s.release.onet],
      ),
    /immutable/,
  );
  const invalid = skillFixture("bad");
  invalid.blsData.wages.push(invalid.blsData.wages[0]);
  await assert.rejects(
    () => importLaborMarket(s.store.db.pool, invalid),
    /duplicate/,
  );
  assert.equal((await s.market.catalog()).skillsRelease.id, s.release.onet);
  const unsafe = skillFixture("bad-definition");
  unsafe.onetData.elements.row = [];
  assert.throws(() => normalizeOnet(unsafe.onetData), /schema|definition/);
  const wrongUnits = skillFixture("bad-year").blsData;
  wrongUnits.projections[0].end_year = 2034;
  assert.throws(() => validateBls(wrongUnits), /Invalid/);
});
test("skills search returns canonical records and ignores browser-supplied source claims", async (t) => {
  const s = await setup(t),
    search = await s.market.search({ query: "Critical" });
  assert.equal(search.skills.length, 1);
  assert.equal(search.skills[0].source, "O*NET");
  assert.match(search.skills[0].license, /creativecommons/);
  const canonical = await resolveSkillSelections(s.store.db, [
    {
      ...search.skills[0],
      name: "Forged skill",
      assessment: "Staff reviewed a documented performance task.",
    },
  ]);
  assert.equal(canonical[0].name, "Critical Thinking one");
  await assert.rejects(
    () =>
      resolveSkillSelections(s.store.db, [
        {
          id: "missing",
          releaseId: s.release.onet,
          assessment: "Valid documented assessment.",
        },
      ]),
    /unavailable/,
  );
  await assert.rejects(
    () =>
      resolveSkillSelections(s.store.db, [
        { ...search.skills[0], assessment: "short" },
      ]),
    /assessed/,
  );
  await assert.rejects(
    () => resolveSkillSelections(s.store.db, [canonical[0], canonical[0]]),
    /only once/,
  );
  const software = await s.market.search({ query: "Excel" });
  assert.equal(software.skills[0].category, "software");
  assert.deepEqual((await s.market.search({ query: "%_" })).skills, []);
});
test("regional wages preserve missing estimates, national projection geography and annual-opening units", async (t) => {
  const s = await setup(t),
    skills = [{ id: "2.A.2.a", releaseId: s.release.onet }],
    result = await s.market.related(skills, "OH");
  assert.equal(result.occupations.length, 2);
  const developer = result.occupations.find((o) => o.socCode === "15-1252");
  assert.equal(developer.wage.region, "OH");
  assert.equal(developer.wage.medianAnnual, null);
  assert.equal(developer.wage.annualMarker, "#");
  assert.equal(developer.outlook.region, "US");
  assert.equal(developer.outlook.annualOpenings, 123400);
  assert.equal(developer.outlook.baseYear, 2025);
  assert.match(developer.scopeNote, /SOC 15-1252/);
  assert.equal(
    result.occupations.find((o) => o.socCode === "13-1151").wage,
    null,
  );
  const low = await s.market.related(
    [{ id: "2.B.1.a", releaseId: s.release.onet }],
    "US",
  );
  assert.equal(low.occupations.length, 0);
  const soft = await s.market.search({ query: "Excel" });
  const related = await s.market.related(soft.skills, "US");
  assert.equal(related.occupations[0].matches[0].importance, null);
  assert.equal(related.occupations[0].matches[0].basis, "software_example");
  await assert.rejects(() => s.market.related(skills, "ZZ"), /No wage data/);
});
test("draft approval and paired issuance freeze assessed skills while later imports preserve old claims", async (t) => {
  const s = await setup(t),
    skill = (await s.market.search({ query: "Critical" })).skills[0];
  const draft = await saveDraft(s.store.db, {
    ...defaultDesign,
    skills: [
      {
        ...skill,
        assessment:
          "Learner compares two solutions against the assessment rubric.",
      },
    ],
  });
  const catalog = new PublishingCatalog(s.store),
    version = await catalog.approve(draft.id, draft.revision, "staff");
  const sources = [
      {
        id: "workspace",
        name: "Test",
        directory: s.directory,
        pool: s.store.db.pool,
      },
    ],
    awards = new LearnerAwards(
      sources,
      "http://127.0.0.1:4178",
      s.store.db.pool,
    ),
    certificates = new Certificates(s.store, awards, config.learners),
    template = await certificates.save(
      { name: "Skills test", design: defaultCertificate },
      "staff",
    ),
    manual = new ManualAwards(s.store, catalog, config.learners, certificates);
  const preview = await manual.preview(
    {
      method: "manual",
      versionId: version.id,
      learner: "demo-alex",
      reason: "Synthetic documented assessment only.",
      certificateTemplateId: template.id,
      recipientName: "Alex Morgan",
    },
    "staff",
  );
  await manual.preflight(preview.id, "staff");
  const batch = await manual.commit(preview.id, "staff", true),
    id = batch.rows[0].badgeId,
    row = await s.store.get(id),
    original = row.credential;
  assert.equal(JSON.parse(original).achievement.skills[0].name, skill.name);
  assert.equal(
    (await awards.list("demo-alex")).badges[0].skills[0].id,
    skill.id,
  );
  assert.ok(await certificates.find("workspace", id));
  await importLaborMarket(s.store.db.pool, skillFixture("new release"));
  assert.equal(
    (await s.market.search({ query: "Critical" })).skills[0].name,
    "Critical Thinking new release",
  );
  assert.equal((await s.store.get(id)).credential, original);
  const own = await s.market.forAward(
    certificates,
    "workspace",
    id,
    "demo-alex",
    "OH",
  );
  assert.equal(own.alignments[0].name, "Critical Thinking one");
  await assert.rejects(
    () => s.market.forAward(certificates, "workspace", id, "demo-jordan", "US"),
    /Badge not found/,
  );
});
