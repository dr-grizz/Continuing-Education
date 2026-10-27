import { HttpException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { RequestLimiter } from "../domain/request-limiter";

const limiter = new RequestLimiter();
/** Call only after Canvas's server-to-server response establishes the subject. */
export function enforceCanvasLoginLimit(provider: string, subject: string) {
  if (process.env.HOSTED_DEMO !== "true") return;
  // Provider + subject is stable across sessions and staff/learner flows.
  // Email/display name may be absent, changed or unverified; never use them.
  const key = createHash("sha256")
    .update(JSON.stringify([provider, subject]))
    .digest("hex");
  const retryAfter = limiter.consume(key, 20);
  if (retryAfter)
    throw new HttpException(
      {
        message:
          "Too many sign-ins for this Canvas account. Wait a minute and try again.",
        retryAfter,
      },
      429,
    );
}
