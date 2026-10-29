import { AwardError } from "./manual-awards.mjs";
const fail = (message) => {
  throw new AwardError(message);
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const onetLicense = "https://creativecommons.org/licenses/by/4.0/";
export function skillRecord(row, assessment) {
  return {
    id: row.id,
    releaseId: row.release_id,
    name: row.name,
    description: row.description,
    category: row.category,
    url: row.url,
    source: "O*NET",
    version: row.version,
    attribution: `O*NET ${row.version} Database, U.S. Department of Labor, Employment and Training Administration (USDOL/ETA), CC BY 4.0.`,
    license: onetLicense,
    ...(assessment === undefined ? {} : { assessment }),
  };
}
export async function resolveSkillSelections(db, input) {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 20)
    fail("Choose up to 20 assessed skills.");
  const seen = new Set(),
    skills = [];
  for (const selection of input) {
    if (
      !selection ||
      typeof selection !== "object" ||
      typeof selection.id !== "string" ||
      selection.id.length > 100 ||
      !uuid.test(selection.releaseId || "") ||
      typeof selection.assessment !== "string" ||
      selection.assessment.trim().length < 10 ||
      selection.assessment.length > 1000 ||
      /[\u0000-\u0008\u000b-\u001f\u007f]/.test(selection.assessment)
    )
      fail(
        "For each skill, select its source record and explain how it is assessed (10–1,000 characters).",
      );
    const key = selection.releaseId + ":" + selection.id;
    if (seen.has(key)) fail("Choose each skill only once.");
    seen.add(key);
    const row = (
      await db.query(
        "SELECT s.*,r.version FROM labor_skills s JOIN labor_releases r ON r.id=s.release_id WHERE s.release_id=$1 AND s.id=$2 AND r.kind='onet'",
        [selection.releaseId, selection.id],
      )
    ).rows[0];
    if (!row)
      fail("A selected skill is unavailable. Refresh the skills catalog.");
    skills.push(skillRecord(row, selection.assessment.trim()));
  }
  return skills;
}
export class LaborMarket {
  constructor(db, onet) {
    this.db = db;
    this.onet = onet;
  }
  async catalog() {
    const releases = (
      await this.db.query(
        "SELECT r.*,a.kind AS active_kind FROM labor_active a JOIN labor_releases r ON r.id=a.release_id ORDER BY a.kind",
      )
    ).rows;
    const onet = releases.find((r) => r.kind === "onet"),
      bls = releases.find((r) => r.kind === "bls");
    const regions = bls
      ? (
          await this.db.query(
            "SELECT DISTINCT region,region_name FROM labor_wages WHERE release_id=$1 ORDER BY region_name",
            [bls.id],
          )
        ).rows.map((r) => ({ id: r.region, name: r.region_name }))
      : [];
    regions.sort((a, b) =>
      a.id === "US" ? -1 : b.id === "US" ? 1 : a.name.localeCompare(b.name),
    );
    return {
      ready: !!onet,
      onet: this.onet?.status(),
      skillsRelease: onet
        ? {
            id: onet.id,
            version: onet.version,
            importedAt: onet.imported_at,
            sources: onet.sources,
          }
        : null,
      marketRelease: bls
        ? {
            id: bls.id,
            version: bls.version,
            importedAt: bls.imported_at,
            sources: bls.sources,
          }
        : null,
      regions,
      attribution: onet
        ? `O*NET ${onet.version} Database by USDOL/ETA, used under CC BY 4.0; portal assessment statements are institutional additions.`
        : null,
      license: onetLicense,
      referenceUrl: "https://www.onetcenter.org/database.html",
      statisticsUrl: "https://www.bls.gov/oes/tables.htm",
    };
  }
  async search(body) {
    if (
      typeof body.query !== "string" ||
      body.query.trim().length < 2 ||
      body.query.length > 100
    )
      fail("Enter 2–100 characters to find a skill.");
    if (
      body.category !== undefined &&
      !["essential", "transferable", "software"].includes(body.category)
    )
      fail("Choose a valid skill category.");
    const query = body.query.trim().replace(/[\\%_]/g, "\\$&");
    const rows = (
      await this.db.query(
        `SELECT s.*,r.version FROM labor_active a JOIN labor_releases r ON r.id=a.release_id JOIN labor_skills s ON s.release_id=r.id
    WHERE a.kind='onet' AND (s.name ILIKE $1 ESCAPE '\\' OR s.description ILIKE $1 ESCAPE '\\') AND ($2::text IS NULL OR s.category=$2)
    ORDER BY CASE WHEN lower(s.name)=lower($3) THEN 0 ELSE 1 END,s.name,s.id LIMIT 25`,
        ["%" + query + "%", body.category || null, body.query.trim()],
      )
    ).rows;
    return { skills: rows.map((row) => skillRecord(row)), limit: 25 };
  }
  async related(selections, region = "US") {
    if (typeof region !== "string" || !/^[A-Z]{2}$/.test(region))
      fail("Select an available country/state wage region.");
    if (!Array.isArray(selections) || selections.length > 20)
      fail("Choose up to 20 skills.");
    const catalog = await this.catalog();
    if (catalog.marketRelease && !catalog.regions.some((r) => r.id === region))
      fail("No wage data was imported for that region.");
    if (!selections.length)
      return {
        occupations: [],
        region,
        regions: catalog.regions,
        skills: [],
        catalog,
        note: "This accomplishment has no recorded skill alignment.",
      };
    const seen = new Set();
    for (const s of selections) {
      if (
        !s ||
        !uuid.test(s.releaseId || "") ||
        typeof s.id !== "string" ||
        s.id.length > 100
      )
        fail("Invalid skill reference.");
      const key = s.releaseId + ":" + s.id;
      if (seen.has(key)) fail("Choose each skill only once.");
      seen.add(key);
    }
    const skillRows = (
      await this.db.query(
        `SELECT s.*,r.version FROM labor_skills s JOIN labor_releases r ON r.id=s.release_id
    JOIN jsonb_to_recordset($1::jsonb) AS x("releaseId" uuid,id text) ON x."releaseId"=s.release_id AND x.id=s.id WHERE r.kind='onet'`,
        [
          JSON.stringify(
            selections.map((s) => ({ releaseId: s.releaseId, id: s.id })),
          ),
        ],
      )
    ).rows;
    if (
      skillRows.length !==
      new Set(selections.map((s) => s.releaseId + ":" + s.id)).size
    )
      fail("A selected skill is unavailable.");
    const rows = (
      await this.db.query(
        `WITH matched AS (
    SELECT o.code,o.soc_code,o.title,so.skill_id,so.release_id,so.importance,so.data_date,so.basis,s.name
    FROM jsonb_to_recordset($1::jsonb) AS x("releaseId" uuid,id text)
    JOIN labor_skill_occupations so ON so.release_id=x."releaseId" AND so.skill_id=x.id
    JOIN labor_occupations o ON o.release_id=so.release_id AND o.code=so.occupation_code
    JOIN labor_skills s ON s.release_id=so.release_id AND s.id=so.skill_id
    WHERE so.importance>=3 OR so.basis='software_example')
   SELECT code,soc_code,min(title) AS title,count(DISTINCT skill_id)::integer AS matched_skills,
     coalesce(avg(importance),0)::float8 AS rank_importance,
     jsonb_agg(jsonb_build_object('skillId',skill_id,'releaseId',release_id,'name',name,'importance',importance,'dataDate',data_date,'basis',basis)) AS matches
   FROM matched GROUP BY code,soc_code ORDER BY matched_skills DESC,rank_importance DESC,title,code LIMIT 12`,
        [
          JSON.stringify(
            selections.map((s) => ({ releaseId: s.releaseId, id: s.id })),
          ),
        ],
      )
    ).rows;
    const occupations = [];
    for (const row of rows) {
      const release = catalog.marketRelease?.id;
      const wage = release
        ? (
            await this.db.query(
              "SELECT * FROM labor_wages WHERE release_id=$1 AND soc_code=$2 AND region=$3",
              [release, row.soc_code, region],
            )
          ).rows[0]
        : null;
      const projection = release
        ? (
            await this.db.query(
              "SELECT * FROM labor_projections WHERE release_id=$1 AND soc_code=$2",
              [release, row.soc_code],
            )
          ).rows[0]
        : null;
      const numeric = (v) => (v === null || v === undefined ? null : Number(v));
      occupations.push({
        code: row.code,
        socCode: row.soc_code,
        title: row.title,
        url: `https://www.onetonline.org/link/summary/${row.code}`,
        matches: row.matches,
        wage: wage
          ? {
              source: "BLS OEWS",
              region: wage.region,
              regionName: wage.region_name,
              year: wage.year,
              medianAnnual: numeric(wage.median_annual),
              medianHourly: numeric(wage.median_hourly),
              annualMarker: wage.annual_marker,
              hourlyMarker: wage.hourly_marker,
              url: "https://www.bls.gov/oes/tables.htm",
            }
          : null,
        outlook: projection
          ? {
              source: "BLS Employment Projections",
              region: "US",
              regionName: "United States",
              baseYear: projection.base_year,
              endYear: projection.end_year,
              percentChange: numeric(projection.percent_change),
              annualOpenings: numeric(projection.annual_openings),
              url: "https://www.bls.gov/emp/tables/occupational-projections-and-characteristics.Htm",
            }
          : null,
        scopeNote: `Wages and outlook use SOC ${row.soc_code}, which may group multiple O*NET occupations.`,
      });
    }
    return {
      skills: skillRows.map((s) => skillRecord(s)),
      region,
      regions: catalog.regions,
      occupations,
      catalog,
      note: "Occupations are related through O*NET skill importance (at least 3 of 5) or a listed software example. Institutional badge alignment is staff-reviewed; occupation statistics are not a salary or employment guarantee.",
    };
  }
  async forAward(certificates, source, id, learner, region) {
    const row = await certificates.row(source, id, learner),
      credential = JSON.parse(row.credential);
    const skills =
      credential.achievement?.skills ||
      credential.achievement?.design?.skills ||
      [];
    const data = await this.related(skills, region);
    return { ...data, alignments: skills };
  }
}
