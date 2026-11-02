import { test } from "node:test";
import assert from "node:assert/strict";
import { OnetService } from "../onet.mjs";
const occupation = { code: "25-9031.00", title: "Instructional Coordinators" };
const response = (data) => Response.json(data);
test("O*NET is disabled without a key, validates inputs, and never sends unsupported requests", async () => {
  let calls = 0;
  const service = new OnetService({
    apiKey: "",
    fetcher: async () => {
      calls++;
    },
  });
  assert.equal(service.status().configured, false);
  await assert.rejects(
    () => service.search({ query: "training" }),
    /not configured/,
  );
  assert.equal(calls, 0);
  const configured = new OnetService({
    apiKey: "private-test-key",
    fetcher: async () => {
      calls++;
    },
  });
  await assert.rejects(() => configured.search({ query: "a" }), /2–100/);
  await assert.rejects(
    () => configured.outlook("../../secrets"),
    /valid O\*NET/,
  );
  await assert.rejects(
    () => configured.call("https://attacker.test/"),
    /Unsupported/,
  );
  assert.equal(calls, 0);
  assert.ok(!JSON.stringify(configured.status()).includes("private-test-key"));
});
test("server header authentication, bounded search, deduplicated cache, and original outlook text", async () => {
  let calls = 0;
  const service = new OnetService({
    apiKey: "private-test-key",
    fetcher: async (url, init) => {
      calls++;
      assert.equal(new URL(url).origin, "https://api-v2.onetcenter.org");
      assert.equal(init.method, "GET");
      assert.equal(init.headers["X-API-Key"], "private-test-key");
      assert.equal(init.redirect, "error");
      assert.ok(init.signal);
      assert.ok(!url.includes("private-test-key"));
      await new Promise((resolve) => setTimeout(resolve, 5));
      return response(
        url.includes("/online/search")
          ? { occupation: [occupation] }
          : {
              outlook: {
                category: "Bright",
                description: "Original provider wording.",
              },
              bright_outlook: [{ code: "grow", title: "Grow Rapidly" }],
            },
      );
    },
  });
  const [one, two] = await Promise.all([
    service.search({ query: "train & teach" }),
    service.search({ query: "train & teach" }),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(one, two);
  one.occupations[0].title = "changed";
  assert.equal(
    (await service.search({ query: "train & teach" })).occupations[0].title,
    occupation.title,
  );
  assert.equal(calls, 1);
  const outlook = await service.outlook(occupation.code);
  assert.equal(outlook.outlook.description, "Original provider wording.");
  assert.equal(outlook.region, "US");
  assert.equal(outlook.brightOutlook[0].title, "Grow Rapidly");
  assert.ok(!JSON.stringify(outlook).includes("private-test-key"));
});
test("provider errors and invalid payloads fail safely without returning credentials or upstream details", async () => {
  for (const status of [401, 403, 404, 422, 429, 500]) {
    const service = new OnetService({
      apiKey: "private-test-key",
      fetcher: async () =>
        new Response("private-test-key upstream detail", { status }),
    });
    await assert.rejects(
      () => service.search({ query: "teaching" }),
      (error) => {
        assert.equal(error.status, status === 429 ? 429 : 503);
        assert.ok(!error.message.includes("private-test-key"));
        assert.ok(!error.message.includes("upstream detail"));
        return true;
      },
    );
  }
  for (const payload of ["bad-json", "x".repeat(1024 * 1024 + 1)]) {
    const service = new OnetService({
      apiKey: "private-test-key",
      fetcher: async () => new Response(payload),
    });
    await assert.rejects(
      () => service.search({ query: "teaching" }),
      /could not be retrieved/,
    );
  }
  const malformed = new OnetService({
    apiKey: "key",
    fetcher: async () =>
      response({ occupation: [{ code: "invalid", title: "Bad" }] }),
  });
  await assert.rejects(
    () => malformed.search({ query: "test" }),
    /unexpected occupation record/,
  );
});
test("throttle, Retry-After cooldown and cache expiry bound provider traffic", async () => {
  let time = Date.parse("2026-10-28T12:00:00Z"),
    calls = 0;
  const service = new OnetService({
    apiKey: "key",
    now: () => time,
    fetcher: async () => {
      calls++;
      return response({ occupation: [] });
    },
  });
  for (const query of ["aa", "bb", "cc", "dd"]) await service.search({ query });
  await assert.rejects(
    () => service.search({ query: "ee" }),
    (error) => error.status === 429,
  );
  assert.equal(calls, 4);
  time += 1100;
  await service.search({ query: "ee" });
  assert.equal(calls, 5);
  await service.search({ query: "aa" });
  assert.equal(calls, 5);
  time += 86400001;
  await service.search({ query: "aa" });
  assert.equal(calls, 6);
  let cooled = 0;
  const rate = new OnetService({
    apiKey: "key",
    now: () => time,
    fetcher: async () => {
      cooled++;
      return new Response("", { status: 429, headers: { "Retry-After": "5" } });
    },
  });
  await assert.rejects(() => rate.search({ query: "aa" }));
  await assert.rejects(() => rate.search({ query: "bb" }));
  assert.equal(cooled, 1);
  time += 5001;
  await assert.rejects(() => rate.search({ query: "bb" }));
  assert.equal(cooled, 2);
});
