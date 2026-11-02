import { createHash, randomBytes } from "node:crypto";
import { Pool, PoolClient } from "pg";
import { setupStage } from "./setup-diagnostics";
import {
  SetupError,
  bootstrapConfig,
  verifyBootstrapKey,
  assertBootstrapSession,
  issueBootstrapSession,
} from "./bootstrap-auth";
export { SetupError, bootstrapConfig } from "./bootstrap-auth";

import {
  protectSetting,
  revealSetting,
  readApplicationSettings,
  setupSettingNames,
  secretSettingNames,
} from "../domain/application-settings";

const opaque = /^[a-zA-Z0-9_-]{43}$/;
const fresh = () => randomBytes(32).toString("base64url");
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function denied(): never {
  throw new SetupError(
    403,
    "Initial setup is unavailable or access has expired.",
  );
}
export class BootstrapService {
  request: typeof fetch = (...args) => fetch(...args);
  constructor(
    public pool: Pool,
    public env: NodeJS.ProcessEnv = process.env,
  ) {}
  config() {
    return bootstrapConfig(this.env);
  }
  async available(token: string) {
    assertBootstrapSession(token, this.env);
    const config = this.config();
    const row = (
      await this.pool.query(
        "SELECT expires_at,completed_at FROM bootstrap_control WHERE id=1",
      )
    ).rows[0];
    if (!row) return config.expires <= Date.now() + 24 * 60 * 60_000;
    return !row.completed_at && Date.parse(row.expires_at) > Date.now();
  }
  async transaction<T>(work: (client: PoolClient) => Promise<T>) {
    const client = await setupStage("database_connect", () =>
      this.pool.connect(),
    );
    try {
      await setupStage("database_transaction", () => client.query("BEGIN"));
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  async control(client: PoolClient, create = false) {
    const config = this.config();
    if (create) {
      // The first request never chooses the owner or creates an unbounded window.
      if (config.expires > Date.now() + 24 * 60 * 60_000) denied();
      await client.query(
        "INSERT INTO bootstrap_control(id,expires_at) VALUES(1,$1) ON CONFLICT(id) DO NOTHING",
        [new Date(config.expires)],
      );
    }
    const row = (
      await client.query(
        "SELECT * FROM bootstrap_control WHERE id=1 FOR UPDATE",
      )
    ).rows[0];
    if (!row || row.completed_at || Date.parse(row.expires_at) <= Date.now())
      denied();
    return { config, row };
  }
  async session(
    client: PoolClient,
    token: unknown,
    freshAuthentication = false,
  ) {
    assertBootstrapSession(token, this.env);
    const control = await this.control(client);
    const session = (
      await client.query(
        "SELECT * FROM bootstrap_sessions WHERE token_hash=$1 AND generation=$2 AND configuration_hash=$3 AND expires_at>now()",
        [digest(token), control.row.generation, control.config.fingerprint],
      )
    ).rows[0];
    if (!session) denied();
    if (
      freshAuthentication &&
      Date.now() - Date.parse(session.authenticated_at) > 10 * 60_000
    )
      throw new SetupError(
        401,
        "Enter the setup key again before changing settings or completing setup.",
      );
    return { ...control, session };
  }
  async audit(
    client: PoolClient,
    action: string,
    details: Record<string, unknown> = {},
  ) {
    await client.query(
      "INSERT INTO audit_events(actor,action,details) VALUES($1,$2,$3)",
      ["bootstrap:key", action, JSON.stringify(details)],
    );
  }
  async signIn(key: unknown, previousToken?: string) {
    verifyBootstrapKey(key, this.env);
    const result = await this.transaction(async (client) => {
      // Only a verified key may reach this shared database-backed sign-in limit.
      // Commit a rate-limit result before returning its error.
      await setupStage("sign_in_limit", () =>
        client.query("SELECT pg_advisory_xact_lock(21001002)"),
      );
      const rate = (
        await setupStage("sign_in_limit", () =>
          client.query(
            "INSERT INTO bootstrap_key_limits(id,window_started_at,attempts) VALUES(1,now(),1) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN bootstrap_key_limits.window_started_at<=now()-interval '1 minute' THEN 1 ELSE least(bootstrap_key_limits.attempts+1,21) END,window_started_at=CASE WHEN bootstrap_key_limits.window_started_at<=now()-interval '1 minute' THEN now() ELSE bootstrap_key_limits.window_started_at END RETURNING attempts",
          ),
        )
      ).rows[0];
      if (rate.attempts > 20)
        return {
          error: new SetupError(
            429,
            "Too many setup key attempts. Try again in one minute.",
          ),
        };
      const c = await setupStage("setup_control", () =>
        this.control(client, true),
      );
      const expires = new Date(
        Math.min(
          c.config.expires,
          Date.parse(c.row.expires_at),
          Date.now() + 30 * 60_000,
        ),
      );
      const token = issueBootstrapSession(expires, this.env);
      await setupStage("session_cleanup", () =>
        client.query(
          "DELETE FROM bootstrap_sessions WHERE expires_at<=now() OR configuration_hash<>$1",
          [c.config.fingerprint],
        ),
      );
      await setupStage("session_create", () =>
        client.query(
          "INSERT INTO bootstrap_sessions(token_hash,generation,display_name,email,configuration_hash,expires_at,authenticated_at) VALUES($1,$2,'Setup key administrator','',$3,$4,now())",
          [digest(token), c.row.generation, c.config.fingerprint, expires],
        ),
      );
      if (previousToken)
        await setupStage("session_cleanup", () =>
          client.query("DELETE FROM bootstrap_sessions WHERE token_hash=$1", [
            digest(previousToken),
          ]),
        );
      await setupStage("audit_write", () =>
        this.audit(client, "bootstrap.signed_in"),
      );
      return { signed: { token, expiresAt: expires } };
    });
    if (result.error) throw result.error;
    return result.signed!;
  }
  async begin(browser: string, token: string, contactEmail: unknown) {
    assertBootstrapSession(token, this.env);
    if (!opaque.test(browser)) denied();
    const state = fresh();
    if (
      typeof contactEmail !== "string" ||
      contactEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)
    )
      throw new SetupError(
        400,
        "Enter a contact email for the Canvas administrator.",
      );
    const email = contactEmail.toLowerCase().trim();
    const config = this.config();
    await this.transaction((client) => this.session(client, token, true));
    const settings = {
      ...this.env,
      ...(await readApplicationSettings(this.pool, this.env)),
    };
    const clientId = settings?.CANVAS_STAFF_CLIENT_ID;
    if (
      settings &&
      (!/^[1-9][0-9]{0,30}$/.test(clientId || "") ||
        !settings.CANVAS_STAFF_CLIENT_SECRET)
    )
      throw new SetupError(
        409,
        "Save the Canvas client settings before linking an administrator.",
      );
    await this.transaction(async (client) => {
      const c = await this.session(client, token, true);
      await client.query(
        "DELETE FROM bootstrap_oauth_states WHERE expires_at<=now()",
      );
      const count = (
        await client.query(
          "SELECT count(*)::int AS count FROM bootstrap_oauth_states WHERE created_at>now()-interval '1 minute'",
        )
      ).rows[0].count;
      if (count >= 20)
        throw new SetupError(
          429,
          "Too many setup sign-in attempts. Try again shortly.",
        );
      await client.query(
        "INSERT INTO bootstrap_oauth_states(state_hash,browser_hash,generation,purpose,encrypted_payload,expires_at) VALUES($1,$2,$3,$4,$5,$6)",
        [
          digest(state),
          digest(browser),
          c.row.generation,
          "canvas",
          protectSetting(
            JSON.stringify({
              email,
              fingerprint: config.fingerprint,
              tokenHash: token ? digest(token) : null,
              settingsHash: settings
                ? digest(
                    JSON.stringify(settings.CANVAS_STAFF_CLIENT_ID) +
                      JSON.stringify(settings.CANVAS_STAFF_CLIENT_SECRET),
                  )
                : null,
            }),
            "flow:" + digest(state),
            this.env,
          ),
          new Date(
            Math.min(
              config.expires,
              Date.parse(c.row.expires_at),
              Date.now() + 5 * 60_000,
            ),
          ),
        ],
      );
    });
    const authorization = new URL(
      "https://cedarville.instructure.com/login/oauth2/auth",
    );
    authorization.search = new URLSearchParams({
      client_id: clientId!,
      response_type: "code",
      redirect_uri: `${config.origin}/api/auth/canvas/callback`,
      scope: "/auth/userinfo",
      force_login: "1",
      state: "bootstrap." + state,
    }).toString();
    return authorization.href;
  }
  async consume(state: string, browser: string, token: string) {
    assertBootstrapSession(token, this.env);
    if (!opaque.test(state) || !opaque.test(browser)) denied();
    return this.transaction(async (client) => {
      const c = await this.session(client, token);
      const row = (
        await client.query(
          "DELETE FROM bootstrap_oauth_states WHERE state_hash=$1 AND browser_hash=$2 AND generation=$3 AND purpose=$4 AND expires_at>now() RETURNING encrypted_payload",
          [digest(state), digest(browser), c.row.generation, "canvas"],
        )
      ).rows[0];
      if (!row) denied();
      const payload = JSON.parse(
        revealSetting(row.encrypted_payload, "flow:" + digest(state), this.env),
      );
      if (
        payload.fingerprint !== c.config.fingerprint ||
        payload.tokenHash !== digest(token)
      )
        denied();
      return { ...c, payload };
    });
  }
  async status(token: string) {
    assertBootstrapSession(token, this.env);
    return setupStage("session_read", () =>
      this.transaction(async (client) => {
        const c = await this.session(client, token);
        const rows = (
          await client.query(
            "SELECT name,encrypted_value FROM application_settings",
          )
        ).rows;
        const settings: Record<string, unknown> = {};
        for (const name of setupSettingNames) {
          const stored = rows.find((row) => row.name === name);
          const value = stored
            ? await setupStage("settings_decrypt", async () =>
                revealSetting(
                  stored.encrypted_value,
                  "setting:" + name,
                  this.env,
                ),
              )
            : this.env[name];
          settings[name] = secretSettingNames.has(name)
            ? { configured: Boolean(value) }
            : { value: value || "", saved: Boolean(stored) };
        }
        const ready = await this.handoffReady(client, c.row);
        const migration = (
          await client.query(
            "SELECT count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS applied,count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::int AS failed FROM _prisma_migrations",
          )
        ).rows[0];
        return {
          origin: c.config.origin,
          owner: c.session.display_name,
          email: c.session.email,
          expiresAt: new Date(
            Math.min(
              c.config.expires,
              Date.parse(c.row.expires_at),
              Date.parse(c.session.expires_at),
            ),
          ).toISOString(),
          settings,
          canvasBaseUrl: "https://cedarville.instructure.com",
          canvasRedirectUri: `${c.config.origin}/api/auth/canvas/callback`,

          handoff: ready,
          database: {
            connected: true,
            appliedMigrations: migration.applied,
            failedMigrations: migration.failed,
          },
        };
      }),
    );
  }
  async save(token: string, input: Record<string, unknown>) {
    assertBootstrapSession(token, this.env);
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).length === 0 ||
      Object.keys(input).some(
        (name) => !(setupSettingNames as readonly string[]).includes(name),
      )
    )
      throw new SetupError(
        400,
        "Only the displayed application settings can be changed here.",
      );
    const values: Record<string, string> = {};
    for (const [name, value] of Object.entries(input)) {
      if (typeof value !== "string" || /[\x00-\x1f\x7f]/.test(value))
        throw new SetupError(400, "A setting has an invalid value.");
      if (secretSettingNames.has(name) && value === "") continue;
      if (
        name === "CANVAS_STAFF_CLIENT_ID" &&
        !/^[1-9][0-9]{0,30}$/.test(value)
      )
        throw new SetupError(400, "Enter the numeric Canvas client ID.");
      if (
        name === "CANVAS_STAFF_CLIENT_SECRET" &&
        (value.length < 16 ||
          value.length > 2048 ||
          /^(REPLACE_|CHANGE_ME)/i.test(value))
      )
        throw new SetupError(400, "Enter a valid Canvas client secret.");
      if (
        name.endsWith("SESSION_HOURS") &&
        !/^(?:[1-9]|1[0-9]|2[0-4])$/.test(value)
      )
        throw new SetupError(400, "Session hours must be between 1 and 24.");
      if (
        name === "CANVAS_STAFF_FORCE_LOGIN" &&
        !["true", "false"].includes(value)
      )
        throw new SetupError(400, "Force login must be true or false.");
      values[name] = value;
    }
    await this.transaction(async (client) => {
      const c = await this.session(client, token, true);
      for (const [name, value] of Object.entries(values))
        await client.query(
          "INSERT INTO application_settings(name,encrypted_value,updated_by) VALUES($1,$2,$3) ON CONFLICT(name) DO UPDATE SET encrypted_value=excluded.encrypted_value,updated_by=excluded.updated_by,updated_at=now()",
          [
            name,
            protectSetting(value, "setting:" + name, this.env),
            "bootstrap:key",
          ],
        );
      await this.audit(client, "bootstrap.settings_updated", {
        names: Object.keys(values),
      });
    });
  }
  async finishCanvas(callback: URL, browser: string, token: string) {
    assertBootstrapSession(token, this.env);
    if (!callback.searchParams.get("state")?.startsWith("bootstrap.")) denied();
    if (
      ["state", "code", "error"].some(
        (key) => callback.searchParams.getAll(key).length > 1,
      )
    )
      denied();
    const flow = await this.consume(
      (callback.searchParams.get("state") || "").replace(/^bootstrap\./, ""),
      browser,
      token,
    );
    if (
      callback.origin !== flow.config.origin ||
      callback.pathname !== "/api/auth/canvas/callback" ||
      callback.searchParams.has("error")
    )
      denied();
    const code = callback.searchParams.get("code");
    if (!code || code.length > 2048) denied();
    const settings = {
      ...this.env,
      ...(await readApplicationSettings(this.pool, this.env)),
    };
    if (
      flow.payload.settingsHash !==
      digest(
        JSON.stringify(settings.CANVAS_STAFF_CLIENT_ID) +
          JSON.stringify(settings.CANVAS_STAFF_CLIENT_SECRET),
      )
    )
      denied();
    const response = await this.request(
      "https://cedarville.instructure.com/login/oauth2/token",
      {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: settings.CANVAS_STAFF_CLIENT_ID!,
          client_secret: settings.CANVAS_STAFF_CLIENT_SECRET!,
          redirect_uri: `${flow.config.origin}/api/auth/canvas/callback`,
          code,
        }),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );
    if (!response.ok)
      throw new SetupError(
        503,
        "Canvas identity verification is unavailable. Try again.",
      );
    const identity = await response.json();
    const subject = String(identity?.user?.id || "");
    if (
      identity.access_token !== null ||
      identity.refresh_token ||
      !/^[1-9][0-9]{0,19}$/.test(subject) ||
      (typeof identity.user.id === "number" &&
        !Number.isSafeInteger(identity.user.id))
    )
      denied();
    const email = flow.payload.email;
    if (
      typeof email !== "string" ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    )
      denied();
    const displayName =
      typeof identity.user.name === "string"
        ? identity.user.name.slice(0, 120)
        : "Canvas administrator";
    await this.transaction(async (client) => {
      await this.session(client, token, true);
      await this.linkAdministrator(
        client,
        { email, displayName, subject },
        "canvas_sign_in",
      );
    });
  }
  async addAdministrator(token: string, input: unknown) {
    assertBootstrapSession(token, this.env);
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).some(
        (key) => !["name", "email", "canvasUserId"].includes(key),
      )
    )
      throw new SetupError(
        400,
        "Enter the administrator name, contact email and Canvas user ID.",
      );
    const fields = input as Record<string, unknown>;
    if (
      typeof fields.name !== "string" ||
      typeof fields.email !== "string" ||
      typeof fields.canvasUserId !== "string"
    )
      throw new SetupError(
        400,
        "Enter the administrator name, contact email and Canvas user ID.",
      );
    const displayName = fields.name.trim(),
      email = fields.email.trim().toLowerCase(),
      subject = fields.canvasUserId.trim();
    if (
      !displayName ||
      displayName.length > 120 ||
      /[\x00-\x1f\x7f]/.test(displayName) ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !/^[1-9][0-9]{0,18}$/.test(subject)
    )
      throw new SetupError(
        400,
        "Use a name, valid contact email and numeric Canvas user ID (not a login name or email).",
      );
    try {
      await this.transaction(async (client) => {
        await this.session(client, token, true);
        await this.linkAdministrator(
          client,
          { email, displayName, subject },
          "entered_canvas_id",
        );
      });
    } catch (error) {
      if ((error as { code?: string })?.code === "23505")
        throw new SetupError(
          409,
          "That staff email or Canvas identity was linked concurrently. Review the existing account and try again.",
        );
      throw error;
    }
  }
  private async linkAdministrator(
    client: PoolClient,
    identity: { email: string; displayName: string; subject: string },
    method: "canvas_sign_in" | "entered_canvas_id",
  ) {
    const { email, displayName, subject } = identity;
    const existing = (
      await client.query(
        "SELECT * FROM staff_members WHERE email=$1 FOR UPDATE",
        [email],
      )
    ).rows[0];
    if (
      existing &&
      (!existing.active ||
        (existing.external_subject &&
          (existing.external_subject !== subject ||
            existing.auth_provider !==
              "canvas:https://cedarville.instructure.com")))
    )
      throw new SetupError(
        409,
        "The staff account has an existing identity or is inactive. Administrator review is required.",
      );
    const claimed = (
      await client.query(
        "SELECT id FROM staff_members WHERE auth_provider='canvas:https://cedarville.instructure.com' AND external_subject=$1",
        [subject],
      )
    ).rows[0];
    if (claimed && claimed.id !== existing?.id)
      throw new SetupError(
        409,
        "That Canvas identity is already linked to another staff account.",
      );
    const member = existing
      ? (
          await client.query(
            "UPDATE staff_members SET auth_provider='canvas:https://cedarville.instructure.com',external_subject=$1,roles=ARRAY(SELECT DISTINCT unnest(roles || ARRAY['staff_admin']::staff_role[])),version=version+1 WHERE id=$2 RETURNING id",
            [subject, existing.id],
          )
        ).rows[0]
      : (
          await client.query(
            "INSERT INTO staff_members(email,display_name,roles,auth_provider,external_subject) VALUES($1,$2,ARRAY['staff_admin']::staff_role[],'canvas:https://cedarville.instructure.com',$3) RETURNING id",
            [email, displayName, subject],
          )
        ).rows[0];
    await client.query(
      "UPDATE bootstrap_control SET handoff_staff_id=$1,handoff_linked_at=now() WHERE id=1",
      [member.id],
    );
    await this.audit(client, "bootstrap.administrator_linked", {
      staffId: member.id,
      method,
    });
  }

  async handoffReady(client: PoolClient, control: any) {
    if (!control.handoff_staff_id) return { linked: false, verified: false };
    const member = (
      await client.query(
        "SELECT id,display_name,email,active,roles,external_subject,auth_provider FROM staff_members WHERE id=$1 FOR UPDATE",
        [control.handoff_staff_id],
      )
    ).rows[0];
    const proof =
      member?.active &&
      member.roles.includes("staff_admin") &&
      member.auth_provider === "canvas:https://cedarville.instructure.com" &&
      (
        await client.query(
          "SELECT 1 FROM staff_sessions WHERE staff_id=$1 AND auth_provider=$2 AND external_subject=$3 AND expires_at>now() AND created_at>greatest($4::timestamptz,coalesce((SELECT max(updated_at) FROM application_settings),$4::timestamptz)) LIMIT 1",
          [
            member.id,
            member.auth_provider,
            member.external_subject,
            control.handoff_linked_at,
          ],
        )
      ).rowCount === 1;
    return {
      linked: true,
      verified: Boolean(proof),
      name: member?.display_name || "",
      email: member?.email || "",
      canvasUserId: member?.external_subject || "",
    };
  }
  async complete(token: string) {
    assertBootstrapSession(token, this.env);
    await this.transaction(async (client) => {
      const c = await this.session(client, token, true);
      if (!(await this.handoffReady(client, c.row)).verified)
        throw new SetupError(
          409,
          "Verify normal Canvas administrator sign-in in another tab before closing setup.",
        );
      await this.audit(client, "bootstrap.completed", {
        staffId: c.row.handoff_staff_id,
      });
      await client.query(
        "UPDATE bootstrap_control SET completed_at=now() WHERE id=1",
      );
      await client.query("DELETE FROM bootstrap_sessions WHERE generation=$1", [
        c.row.generation,
      ]);
      await client.query(
        "DELETE FROM bootstrap_oauth_states WHERE generation=$1",
        [c.row.generation],
      );
    });
  }
  async logout(token: string) {
    try {
      assertBootstrapSession(token, this.env);
    } catch {
      return;
    }
    await this.pool.query(
      "DELETE FROM bootstrap_sessions WHERE token_hash=$1",
      [digest(token)],
    );
  }
}
