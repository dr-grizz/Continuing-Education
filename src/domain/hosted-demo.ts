/** Explicit demo-only production opt-in, shared by the API and web access gate. */
export function hostedDemoConfig(env = process.env) {
  if (env.HOSTED_DEMO !== "true") return null;
  if (env.PROTOTYPE_MODE !== "true")
    throw new Error("Hosted demos require PROTOTYPE_MODE=true.");
  const origin = new URL(env.WEB_URL || "invalid:");
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/"
  )
    throw new Error("WEB_URL must be the HTTPS demo origin.");
  const gate = env.DEMO_ACCESS_GATE || "basic";
  if (gate !== "basic" && gate !== "none")
    throw new Error("DEMO_ACCESS_GATE must be basic or none.");
  if (
    gate === "none" &&
    (env.STAFF_AUTH_MODE !== "canvas" || env.LEARNER_AUTH_MODE !== "canvas")
  )
    throw new Error(
      "Public demos require Canvas OAuth for staff and learners.",
    );
  const username = env.DEMO_ACCESS_USERNAME || "";
  const password = env.DEMO_ACCESS_PASSWORD || "";
  if (
    gate === "basic" &&
    (!/^[a-zA-Z0-9_-]{1,64}$/.test(username) ||
      password.length < 24 ||
      !/^[\x21-\x7e]+$/.test(password) ||
      /^(REPLACE_|CHANGE_ME)/i.test(password))
  )
    throw new Error(
      "Hosted demos require a username and a random password of at least 24 printable characters.",
    );
  const tokens = [
    env.LEARNER_API_TOKEN,
    env.STAFF_API_TOKEN,
    env.AUTOMATION_API_TOKEN,
  ];
  if (
    tokens.some(
      (token) =>
        !token || token.length < 32 || /^(REPLACE_|CHANGE_ME)/i.test(token),
    ) ||
    new Set(tokens).size !== 3
  )
    throw new Error(
      "Hosted demos require three distinct broker tokens of at least 32 characters.",
    );
  if (
    env.STRIPE_SECRET_KEY &&
    !/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY.trim())
  )
    throw new Error("Hosted demos permit Stripe test keys only.");
  return { origin: origin.origin, username, password, gate };
}

export function assertPrototypeRuntime(env = process.env) {
  const hosted = hostedDemoConfig(env);
  if (
    env.PROTOTYPE_MODE !== "true" ||
    (env.NODE_ENV === "production" && !hosted)
  )
    throw new Error(
      "This prototype requires PROTOTYPE_MODE=true; production additionally requires a configured HOSTED_DEMO.",
    );
  return hosted;
}

export function assertHostedDatabase(value: string | undefined) {
  const url = new URL(value || "invalid:");
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["require", "verify-full"].includes(url.searchParams.get("sslmode") || "")
  )
    throw new Error(
      "Hosted DATABASE_URL must use PostgreSQL with sslmode=require or verify-full.",
    );
}
