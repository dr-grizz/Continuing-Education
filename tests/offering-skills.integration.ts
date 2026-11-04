import "dotenv/config";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { spawn, ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { migrate } from "../scripts/db-migrate";
import { endPoolAndWaitForClients } from "./helpers/close-pool";
async function main() {
  const base = new URL(process.env.DATABASE_URL!),
    database = `ce_skills_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({
    connectionString: Object.assign(new URL(base), { pathname: "/postgres" })
      .href,
  });
  const directory = mkdtempSync(join(tmpdir(), "ce-offering-skills-"));
  let created = false,
    db: Pool | undefined,
    child: ChildProcess | undefined,
    logs = "";
  try {
    await admin.query(`CREATE DATABASE ${database}`);
    created = true;
    const url = Object.assign(new URL(base), { pathname: `/${database}` }).href;
    await migrate(url, { quiet: true });
    db = new Pool({ connectionString: url });
    const releaseId = randomUUID();
    await db.query(
      "INSERT INTO labor_releases(id,kind,version,checksum,sources) VALUES($1,'onet','31.0-fixture',$2,'{}')",
      [releaseId, "a".repeat(64)],
    );
    for (const [id, name] of [
      ["2.A.2.a", "Critical Thinking"],
      ["2.A.1.a", "Reading Comprehension"],
    ])
      await db.query(
        "INSERT INTO labor_skills(release_id,id,name,description,category,url) VALUES($1,$2,$3,'Canonical source definition for the test skill.','essential','https://www.onetcenter.org/database.html')",
        [releaseId, id, name],
      );
    await db.query(
      "INSERT INTO labor_active(kind,release_id) VALUES('onet',$1)",
      [releaseId],
    );
    const staff = (
      await db.query(
        "SELECT id,roles::text[] AS roles FROM staff_members WHERE active",
      )
    ).rows;
    const manager = staff.find((x) => x.roles.includes("catalog_manager")),
      reader = staff.find(
        (x) => x.roles.length === 1 && x.roles[0] === "approver",
      );
    assert.ok(manager && reader);
    const listener = createServer();
    await new Promise<void>((r) => listener.listen(0, "127.0.0.1", r));
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>((r) => listener.close(() => r()));
    const origin = `http://127.0.0.1:${port}`,
      token = randomUUID();
    child = spawn(
      process.execPath,
      [
        "node_modules/ts-node/dist/bin.js",
        "-P",
        "tsconfig.server.json",
        "src/server/main.ts",
      ],
      {
        env: {
          ...process.env,
          DATABASE_URL: url,
          API_PORT: String(port),
          API_URL: origin,
          PROTOTYPE_MODE: "true",
          HOSTED_DEMO: "false",
          STAFF_AUTH_MODE: "mock",
          LEARNER_AUTH_MODE: "mock",
          STAFF_API_TOKEN: token,
          LEARNER_API_TOKEN: randomUUID(),
          AUTOMATION_API_TOKEN: randomUUID(),
          BADGE_DATA_DIR: directory,
          ONET_API_KEY: "",
          CERTIFICATE_EMAIL_ENABLED: "false",
        },
        stdio: "pipe",
      },
    );
    child.stdout?.on("data", (x) => {
      logs += x;
    });
    child.stderr?.on("data", (x) => {
      logs += x;
    });
    let ready = false;
    for (let i = 0; i < 200; i++) {
      if (child.exitCode !== null) throw new Error("Test API exited: " + logs);
      try {
        if ((await fetch(origin + "/api/v1/health")).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, logs);
    async function call(
      path: string,
      body?: unknown,
      who = manager.id,
      key = randomUUID(),
    ) {
      const r = await fetch(origin + "/api/v1/" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Prototype-Staff-Id": who,
          "Idempotency-Key": key,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: r.status, data: await r.json() };
    }
    const reference = { id: "2.A.2.a", releaseId },
      other = { id: "2.A.1.a", releaseId };
    const body = {
      title: "Course with planned skills",
      category: "Technology",
      summary: "Learn through documented practical activities.",
      description: "A complete sample course description for skill mapping.",
      format: "Online",
      courseType: "self_paced",
      priceCents: 14900,
      capacity: 20,
      approvalRequired: false,
      skills: [reference],
    };
    assert.equal((await call("offerings", body, reader.id)).status, 403);
    for (const skills of [
      null,
      [null],
      [{ ...reference, name: "Forged definition" }],
      [reference, reference],
      [{ ...reference, id: "unknown" }],
      Array.from({ length: 21 }, () => reference),
    ])
      assert.equal((await call("offerings", { ...body, skills })).status, 400);
    const key = randomUUID(),
      saved = await call("offerings", body, manager.id, key);
    assert.equal(saved.status, 201);
    assert.equal(saved.data.skills[0].name, "Critical Thinking");
    assert.equal(saved.data.skills[0].version, "31.0-fixture");
    const id = saved.data.id;
    assert.equal((await call("offerings", body, manager.id, key)).data.id, id);
    assert.deepEqual(
      (await call(`staff/offerings/${id}`)).data.offering.skills,
      saved.data.skills,
    );
    assert.equal((await call(`offerings/${id}`)).status, 404);
    const published = await call(`offerings/${id}/publish`, {
      version: saved.data.version,
    });
    assert.equal(published.status, 201);
    assert.equal(
      (await call(`offerings/${id}`)).data.skills[0].id,
      reference.id,
    );
    const current = (await call(`staff/offerings/${id}`)).data.offering;
    assert.equal(
      (
        await call(`offerings/${id}/edit`, {
          ...body,
          version: current.version,
          skills: [other],
        })
      ).status,
      400,
    );
    const edited = await call(`offerings/${id}/edit`, {
      ...body,
      version: current.version,
      skills: [other],
      reason: "Update the course skill coverage after review.",
    });
    assert.equal(edited.status, 200);
    assert.equal(edited.data.skills[0].name, "Reading Comprehension");
    assert.equal(
      (
        await call(`offerings/${id}/edit`, {
          ...body,
          version: current.version,
          skills: [],
          reason: "Attempt a stale update of course skill coverage.",
        })
      ).status,
      409,
    );
    const noSkills = { ...body };
    delete (noSkills as any).skills;
    const legacy = await call(`offerings/${id}/edit`, {
      ...noSkills,
      summary: "A revised course summary from an older client.",
      version: edited.data.version,
      reason: "Update only the summary and retain saved skills.",
    });
    assert.equal(legacy.status, 200);
    assert.equal(legacy.data.skills[0].id, other.id);
    const noChange = await call(`offerings/${id}/edit`, {
      ...body,
      summary: legacy.data.summary,
      skills: [other],
      version: legacy.data.version,
      reason: "Repeat the existing documented course skill selection.",
    });
    assert.equal(noChange.status, 400);
    assert.match(JSON.stringify(noChange.data), /No changes/);
    const cleared = await call(`offerings/${id}/edit`, {
      ...body,
      summary: legacy.data.summary,
      skills: [],
      version: legacy.data.version,
      reason: "Remove the skill mapping after curriculum review.",
    });
    assert.equal(cleared.status, 200);
    assert.deepEqual(cleared.data.skills, []);
    const history = (
      await db.query(
        "SELECT details FROM audit_events WHERE object_id=$1 AND action='offering.edited' ORDER BY id DESC",
        [id],
      )
    ).rows;
    assert.ok(
      history.some(
        (x) =>
          x.details.changes?.skills ||
          x.details.skills ||
          JSON.stringify(x.details).includes("Reading Comprehension"),
      ),
    );
    const plain = await call("offerings", {
      ...noSkills,
      title: "Offering without skills",
    });
    assert.equal(plain.status, 201);
    assert.deepEqual(plain.data.skills, []);
    await assert.rejects(() =>
      db!.query("UPDATE offerings SET skills='{}'::jsonb WHERE id=$1", [id]),
    );
    console.log(
      "PASS offering skills: real HTTP authorization, canonical definitions, validation, create/read/edit/clear, publishing, stale updates, no-op detection, audit and old-client preservation",
    );
  } finally {
    if (child && child.exitCode === null) {
      const c = child;
      await new Promise<void>((r) => {
        const timer = setTimeout(() => c.kill("SIGKILL"), 10000);
        c.once("exit", () => {
          clearTimeout(timer);
          r();
        });
        c.kill("SIGTERM");
      });
    }
    if (db) await endPoolAndWaitForClients(db);
    if (created) await admin.query(`DROP DATABASE ${database}`);
    await endPoolAndWaitForClients(admin);
    rmSync(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
