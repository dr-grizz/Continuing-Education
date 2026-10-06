import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
export type Principal = { actor: string; scopes: string[]; learnerId?: string };
import { DEMO_LEARNER } from "../domain/db";
import { prisma } from "../domain/prisma";
@Injectable()
export class PrototypeGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    const profiles: [string | undefined, Principal][] = [
      [
        process.env.LEARNER_API_TOKEN,
        { actor: "demo-learner", learnerId: DEMO_LEARNER, scopes: ["learner"] },
      ],
      [
        process.env.STAFF_API_TOKEN,
        {
          actor: "demo-staff",
          scopes: [
            "catalog:write",
            "approvals:decide",
            "reports:read",
            "exceptions:resolve",
          ],
        },
      ],
      [
        process.env.AUTOMATION_API_TOKEN,
        { actor: "demo-automation", scopes: ["reports:read"] },
      ],
    ];
    const match = profiles.find(([key]) => key && token === key);
    if (!match)
      throw new UnauthorizedException(
        "A local prototype bearer token is required.",
      );
    req.principal = { ...match[1] };
    const learnerId = req.headers["x-prototype-learner-id"];
    if (learnerId && req.principal.scopes.includes("learner")) {
      if (
        typeof learnerId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          learnerId,
        )
      )
        throw new UnauthorizedException("Invalid demo learner.");
      const found = await prisma.learners.findUnique({
        where: { id: learnerId },
        select: { id: true },
      });
      if (!found) throw new UnauthorizedException("Demo learner not found.");
      req.principal.learnerId = found.id;
      req.principal.actor = `demo-learner:${found.id}`;
    }
    return true;
  }
}
export function requireScope(req: { principal: Principal }, scope: string) {
  if (!req.principal.scopes.includes(scope))
    throw new ForbiddenException(`Required scope: ${scope}`);
}
