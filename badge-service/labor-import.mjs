import { createHash, randomUUID } from "node:crypto";
export const laborSources = {
  occupations:
    "https://www.onetcenter.org/dl_files/database/db_31_0_json/occupation_data.json",
  elements:
    "https://www.onetcenter.org/dl_files/database/db_31_0_json/content_model_reference.json",
  essential:
    "https://www.onetcenter.org/dl_files/database/db_31_0_json/essential_skills.json",
  transferable:
    "https://www.onetcenter.org/dl_files/database/db_31_0_json/transferable_skills.json",
  software:
    "https://www.onetcenter.org/dl_files/database/db_31_0_json/software_skills.json",
  national: "https://www.bls.gov/oes/special-requests/oesm25nat.zip",
  state: "https://www.bls.gov/oes/special-requests/oesm25st.zip",
  projections: "https://www.bls.gov/emp/ind-occ-matrix/occupation.xlsx",
};
export const digest = (data) => createHash("sha256").update(data).digest("hex");
const requireValue = (condition, message) => {
  if (!condition) throw new Error(message);
};
const soc = /^\d{2}-\d{4}$/,
  onet = /^\d{2}-\d{4}\.\d{2}$/;
const text = (v, max) =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= max &&
  !/[\u0000-\u0008\u000b-\u001f]/.test(v);
export function normalizeOnet(files) {
  for (const [name, table] of Object.entries({
    occupations: "occupation_data",
    elements: "content_model_reference",
    essential: "essential_skills",
    transferable: "transferable_skills",
    software: "software_skills",
  }))
    requireValue(
      files[name]?.table_id === table &&
        Array.isArray(files[name].row) &&
        files[name].row.length > 0,
      "O*NET file schema changed: " + name,
    );
  const occupations = files.occupations.row.map((r) => {
    requireValue(
      onet.test(r.onetsoc_code) &&
        text(r.title, 300) &&
        text(r.description, 5000),
      "Invalid O*NET occupation",
    );
    return {
      code: r.onetsoc_code,
      soc_code: r.onetsoc_code.slice(0, 7),
      title: r.title,
      description: r.description,
    };
  });
  const codes = new Set(occupations.map((r) => r.code)),
    elements = new Map(files.elements.row.map((r) => [r.element_id, r]));
  const skills = new Map(),
    links = new Map();
  for (const category of ["essential", "transferable"])
    for (const r of files[category].row) {
      if (
        r.scale_id !== "IM" ||
        r.recommend_suppress === "Y" ||
        r.not_relevant === "Y"
      )
        continue;
      requireValue(
        codes.has(r.onetsoc_code) &&
          text(r.element_id, 50) &&
          Number.isFinite(r.data_value) &&
          r.data_value >= 0 &&
          r.data_value <= 5,
        "Invalid O*NET skill rating",
      );
      const element = elements.get(r.element_id);
      requireValue(
        element &&
          text(element.element_name, 300) &&
          text(element.description, 5000),
        "Missing O*NET skill definition",
      );
      skills.set(r.element_id, {
        id: r.element_id,
        name: element.element_name,
        description: element.description,
        category,
        url: "https://www.onetcenter.org/content.html#" + r.element_id,
      });
      const link = {
        skill_id: r.element_id,
        occupation_code: r.onetsoc_code,
        importance: r.data_value,
        data_date: r.date_updated || null,
        basis: "importance",
      };
      const key = link.skill_id + ":" + link.occupation_code;
      requireValue(!links.has(key), "Duplicate O*NET importance link");
      links.set(key, link);
    }
  for (const r of files.software.row) {
    requireValue(
      codes.has(r.onetsoc_code) &&
        text(r.workplace_example, 300) &&
        text(r.element_name, 300) &&
        text(r.element_id, 50),
      "Invalid O*NET software example",
    );
    const id =
      "software." +
      digest(r.element_id + "\0" + r.workplace_example).slice(0, 32);
    skills.set(id, {
      id,
      name: r.workplace_example,
      description: r.element_name,
      category: "software",
      url:
        "https://www.onetonline.org/search/tech/?s=" +
        encodeURIComponent(r.workplace_example),
    });
    const link = {
      skill_id: id,
      occupation_code: r.onetsoc_code,
      importance: null,
      data_date: null,
      basis: "software_example",
    };
    links.set(id + ":" + r.onetsoc_code, link);
  }
  requireValue(skills.size > 0 && links.size > 0, "No O*NET skills imported");
  return {
    occupations,
    skills: [...skills.values()],
    links: [...links.values()],
  };
}
export function validateBls(data) {
  requireValue(
    Array.isArray(data?.wages) &&
      data.wages.length > 0 &&
      Array.isArray(data?.projections) &&
      data.projections.length > 0,
    "BLS files contain no data",
  );
  const keys = new Set();
  const value = (v) =>
    v === null || (typeof v === "number" && Number.isFinite(v));
  for (const row of data.wages) {
    const key = row.soc_code + ":" + row.region;
    requireValue(
      soc.test(row.soc_code) &&
        /^[A-Z]{2}$/.test(row.region) &&
        text(row.region_name, 200) &&
        Number.isInteger(row.year) &&
        row.year === 2025 &&
        value(row.median_annual) &&
        value(row.median_hourly) &&
        (row.median_annual === null || row.median_annual >= 0) &&
        (row.median_hourly === null || row.median_hourly >= 0) &&
        !keys.has(key),
      "Invalid or duplicate BLS wage record",
    );
    keys.add(key);
  }
  keys.clear();
  for (const row of data.projections) {
    requireValue(
      soc.test(row.soc_code) &&
        text(row.title, 300) &&
        row.base_year === 2025 &&
        row.end_year === 2035 &&
        value(row.percent_change) &&
        value(row.annual_openings) &&
        (row.annual_openings === null || row.annual_openings >= 0) &&
        !keys.has(row.soc_code),
      "Invalid or duplicate BLS projection record",
    );
    keys.add(row.soc_code);
  }
  return data;
}
const tables = {
  labor_skills: "id text,name text,description text,category text,url text",
  labor_occupations: "code text,soc_code text,title text,description text",
  labor_skill_occupations:
    "skill_id text,occupation_code text,importance numeric,data_date text,basis text",
  labor_wages:
    "soc_code text,region text,region_name text,year integer,median_annual numeric,median_hourly numeric,annual_marker text,hourly_marker text",
  labor_projections:
    "soc_code text,title text,base_year integer,end_year integer,percent_change numeric,annual_openings numeric",
};
export async function importLaborMarket(pool, { onetData, blsData, hashes }) {
  // Validate everything before opening a transaction or switching active releases.
  const reference = normalizeOnet(onetData),
    statistics = validateBls(blsData);
  for (const name of Object.keys(laborSources))
    requireValue(
      /^[a-f0-9]{64}$/.test(hashes[name]),
      "A source SHA-256 is required for " + name,
    );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('labor-market-import',0))",
    );
    const results = {};
    for (const kind of ["onet", "bls"]) {
      const names =
        kind === "onet"
          ? ["occupations", "elements", "essential", "transferable", "software"]
          : ["national", "state", "projections"];
      const checksum = digest(
          JSON.stringify(names.map((name) => [name, hashes[name]])),
        ),
        version =
          kind === "onet"
            ? "31.0"
            : "OEWS May 2025; Employment Projections 2025–2035";
      let release = (
        await client.query(
          "SELECT id FROM labor_releases WHERE kind=$1 AND checksum=$2",
          [kind, checksum],
        )
      ).rows[0]?.id;
      if (!release) {
        release = randomUUID();
        const sources = {
          files: names.map((name) => ({
            name,
            url: laborSources[name],
            sha256: hashes[name],
          })),
          source:
            kind === "onet"
              ? "U.S. Department of Labor, Employment and Training Administration"
              : "U.S. Bureau of Labor Statistics",
          license:
            kind === "onet"
              ? "https://creativecommons.org/licenses/by/4.0/"
              : "https://www.bls.gov/bls/linksite.htm",
          note:
            kind === "onet"
              ? "Source definitions preserved; software examples are distinct from rated general skills."
              : "Wages are occupation-level medians; national annual openings converted from thousands to individual jobs per year.",
        };
        await client.query(
          "INSERT INTO labor_releases(id,kind,version,checksum,sources) VALUES($1,$2,$3,$4,$5)",
          [release, kind, version, checksum, JSON.stringify(sources)],
        );
        const batches =
          kind === "onet"
            ? {
                labor_skills: reference.skills,
                labor_occupations: reference.occupations,
                labor_skill_occupations: reference.links,
              }
            : {
                labor_wages: statistics.wages,
                labor_projections: statistics.projections,
              };
        for (const [table, rows] of Object.entries(batches)) {
          const defs = tables[table],
            columns = defs.split(",").map((s) => s.trim().split(" ")[0]);
          for (let start = 0; start < rows.length; start += 2000)
            await client.query(
              `INSERT INTO ${table}(release_id,${columns.join(",")}) SELECT $1,${columns.join(",")} FROM jsonb_to_recordset($2::jsonb) AS x(${defs})`,
              [release, JSON.stringify(rows.slice(start, start + 2000))],
            );
        }
      }
      await client.query(
        "INSERT INTO labor_active(kind,release_id) VALUES($1,$2) ON CONFLICT(kind) DO UPDATE SET release_id=excluded.release_id",
        [kind, release],
      );
      results[kind] = release;
    }
    await client.query("COMMIT");
    return {
      ...results,
      skills: reference.skills.length,
      occupations: reference.occupations.length,
      links: reference.links.length,
      wages: statistics.wages.length,
      projections: statistics.projections.length,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
