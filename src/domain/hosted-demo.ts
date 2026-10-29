/** Hosted profiles share identity and simulation safeguards. */
export function isHostedRuntime(env = process.env) {
  return env.HOSTED_DEMO === "true" || env.HOSTED_BETA === "true";
}

export function hostedRuntimeConfig(env = process.env) {
  if (
    env.HOSTED_BETA !== undefined &&
    !["true", "false"].includes(env.HOSTED_BETA)
  )
    throw new Error("HOSTED_BETA must be true or false.");
  const beta = env.HOSTED_BETA === "true";
  if (beta && env.HOSTED_DEMO === "true")
    throw new Error("Select HOSTED_BETA or HOSTED_DEMO, not both.");
  if (!isHostedRuntime(env)) return null;
  if (env.PROTOTYPE_MODE !== "true")
    throw new Error("Hosted demo and beta require PROTOTYPE_MODE=true.");
  const origin = new URL(env.WEB_URL || "invalid:");
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/"
  )
    throw new Error("WEB_URL must be the HTTPS hosted origin.");
  const gate = env.DEMO_ACCESS_GATE || "basic";
  if (beta && gate !== "none")
    throw new Error(
      "Hosted beta requires DEMO_ACCESS_GATE=none and Canvas OAuth.",
    );
  if (gate !== "basic" && gate !== "none")
    throw new Error("DEMO_ACCESS_GATE must be basic or none.");
  if (
    gate === "none" &&
    (env.STAFF_AUTH_MODE !== "canvas" || env.LEARNER_AUTH_MODE !== "canvas")
  )
    throw new Error(
      "Public hosted sites require Canvas OAuth for staff and learners.",
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
      "Hosted sites require three distinct broker tokens of at least 32 characters.",
    );
  if (
    env.STRIPE_SECRET_KEY &&
    !/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY.trim())
  )
    throw new Error("Hosted demo and beta permit Stripe test keys only.");
  return { origin: origin.origin, username, password, gate };
}

// Retained for existing demo callers; new code should use the profile-neutral name.
export const hostedDemoConfig = hostedRuntimeConfig;

export function assertPrototypeRuntime(env = process.env) {
  const hosted = hostedRuntimeConfig(env);
  if (
    env.PROTOTYPE_MODE !== "true" ||
    (env.NODE_ENV === "production" && !hosted)
  )
    throw new Error(
      "This prototype requires PROTOTYPE_MODE=true; production additionally requires a configured HOSTED_DEMO or HOSTED_BETA.",
    );
  return hosted;
}

export function assertHostedDatabase(
  value: string | undefined,
  env: Record<string, string | undefined> = process.env,
) {
  const url = new URL(value || "invalid:");
  const testingException =
    env.HOSTED_BETA_ALLOW_INSECURE_DATABASE === "true" &&
    env.HOSTED_BETA === "true" &&
    env.HOSTED_DEMO !== "true" &&
    env.PROTOTYPE_MODE === "true";
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    (!testingException &&
      !["require", "verify-full"].includes(
        url.searchParams.get("sslmode") || "",
      ))
  )
    throw new Error(
      "Hosted DATABASE_URL must use PostgreSQL with sslmode=require or verify-full.",
    );
}
