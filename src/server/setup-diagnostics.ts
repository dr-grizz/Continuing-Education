import { SetupError } from "./bootstrap-auth";
import { databaseDiagnostic } from "./database-errors";

export type SetupStage =
  | "runtime_load"
  | "database_connect"
  | "database_transaction"
  | "sign_in_limit"
  | "setup_control"
  | "session_create"
  | "session_cleanup"
  | "audit_write"
  | "session_read"
  | "settings_decrypt";
const labels: Record<SetupStage, string> = {
  runtime_load: "loading the setup runtime",
  database_connect: "connecting to PostgreSQL",
  database_transaction: "starting the database transaction",
  sign_in_limit: "checking the shared sign-in limit",
  setup_control: "checking the saved setup gate",
  session_create: "creating the setup session",
  session_cleanup: "updating previous setup sessions",
  audit_write: "recording the setup audit event",
  session_read: "reading the setup session and settings",
  settings_decrypt: "decrypting the saved application settings",
};
function safeReason(error: unknown) {
  const item = error as { code?: unknown; name?: unknown } | null;
  if (
    item?.code === "MODULE_NOT_FOUND" ||
    item?.code === "ERR_MODULE_NOT_FOUND"
  )
    return "dependency_missing";
  if (
    [
      "ERR_REQUIRE_ESM",
      "ERR_REQUIRE_ASYNC_MODULE",
      "ERR_PACKAGE_PATH_NOT_EXPORTED",
    ].includes(String(item?.code))
  )
    return "module_compatibility";
  if (item?.name === "TypeError") return "runtime_type_error";
  if (item?.name === "RangeError") return "runtime_range_error";
  return "unexpected_error";
}
export class SetupStageError extends SetupError {
  readonly code: string;
  readonly reason: string;
  constructor(
    readonly stage: SetupStage,
    error: unknown,
  ) {
    const diagnostic = databaseDiagnostic(error);
    const code = diagnostic?.code || "SETUP_" + stage.toUpperCase() + "_FAILED";
    const reason = diagnostic ? "database_error" : safeReason(error);
    const message =
      diagnostic?.message || `Setup failed while ${labels[stage]}.`;
    super(503, `${message} [${code}; ${stage}; ${reason}]`);
    this.code = code;
    this.reason = reason;
  }
}
export async function setupStage<T>(
  stage: SetupStage,
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof SetupError) throw error;
    throw new SetupStageError(stage, error);
  }
}
