/** Convert known driver codes to safe messages; never return the driver's text. */
export type DatabaseDiagnostic = { code: string; message: string };
const diagnostics: Record<string, DatabaseDiagnostic> = {
  "28P01": {
    code: "DB_AUTHENTICATION_FAILED",
    message:
      "Database authentication failed. Ask the administrator to check the database username, password or secret reference.",
  },
  "28000": {
    code: "DB_ACCESS_REJECTED",
    message:
      "The database rejected access. Ask the administrator to check the database account and connection policy.",
  },
  "42501": {
    code: "DB_PERMISSION_DENIED",
    message:
      "The database account lacks required permissions. Ask the administrator to check schema and table access.",
  },
  "42P01": {
    code: "DB_TABLE_MISSING",
    message:
      "A required database table is missing. Check database migrations and confirm the app uses the intended database.",
  },
  "42703": {
    code: "DB_COLUMN_MISSING",
    message:
      "A required database column is missing. Check that the database migrations match this app version.",
  },
  "23502": {
    code: "DB_SCHEMA_CONSTRAINT",
    message:
      "The database rejected a required setup field. Check that the deployed migrations and table definitions match this app version.",
  },
  "23514": {
    code: "DB_SCHEMA_CONSTRAINT",
    message:
      "The database rejected a setup constraint. Check database migrations and table definitions before retrying.",
  },
  "3D000": {
    code: "DB_NOT_FOUND",
    message:
      "The configured database does not exist. Ask the administrator to check the database configuration.",
  },
  "53300": {
    code: "DB_CONNECTION_LIMIT",
    message:
      "The database connection limit was reached. Wait briefly and ask the administrator to check connection capacity.",
  },
  "57014": {
    code: "DB_QUERY_CANCELLED",
    message:
      "The database check timed out or was cancelled. Retry, then check database availability and load.",
  },
};
const connectionCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "08000",
  "08001",
  "08003",
  "08006",
  "57P01",
  "57P02",
  "57P03",
]);
const tlsCodes = new Set([
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "CERT_HAS_EXPIRED",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);
export function databaseDiagnostic(
  error: unknown,
): DatabaseDiagnostic | undefined {
  for (
    let depth = 0;
    depth < 3 && error && typeof error === "object";
    depth++
  ) {
    const item = error as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    const code = typeof item.code === "string" ? item.code : "";
    if (
      code === "ERR_INVALID_URL" ||
      (typeof item.message === "string" &&
        /^SASL:.*password must be a string/.test(item.message))
    )
      return {
        code: "DB_CONFIGURATION_INVALID",
        message:
          "Database connection settings are invalid. Ask the administrator to check the resolved database connection and password configuration.",
      };
    if (Object.hasOwn(diagnostics, code)) return diagnostics[code];
    if (connectionCodes.has(code))
      return {
        code: "DB_CONNECTION_FAILED",
        message:
          "Could not connect to the database. Check database availability, DNS and private-network access.",
      };
    if (
      code === "ETIMEDOUT" ||
      code === "ERR_SOCKET_CONNECTION_TIMEOUT" ||
      (typeof item.message === "string" &&
        /^(Connection terminated due to connection timeout|timeout exceeded when trying to connect)/.test(
          item.message,
        ))
    )
      return {
        code: "DB_CONNECTION_TIMEOUT",
        message:
          "The database connection timed out. Check database availability and private-network access, then retry.",
      };
    if (tlsCodes.has(code))
      return {
        code: "DB_TLS_FAILED",
        message:
          "Database TLS certificate verification failed. Ask the administrator to check the certificate, hostname and trusted CA configuration.",
      };
    error = item.cause;
  }
  return undefined;
}
