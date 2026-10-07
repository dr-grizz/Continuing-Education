import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
export type Principal = {
  actor: string;
  scopes: string[];
  learnerId?: string;
  staffId?: string;
};
import { DEMO_LEARNER } from "../domain/db";
import { prisma } from "../domain/prisma";
import { scopesFor } from "./roles";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Prototype authentication: three local bearer tokens identify the calling system.
// People are selected by header and are mock identities, not proof of who they are:
// learners by X-Prototype-Learner-Id, staff by X-Prototype-Staff-Id (see ADR 0004).
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
      // Without a staff member selected, the staff token can only run mock sign-in.
      [
        process.env.STAFF_API_TOKEN,
        { actor: "staff-session-broker", scopes: ["staff:session"] },
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
      if (typeof learnerId !== "string" || !uuid.test(learnerId))
        throw new UnauthorizedException("Invalid demo learner.");
      const found = await prisma.learners.findUnique({
        where: { id: learnerId },
        select: { id: true, active: true },
      });
      if (!found) throw new UnauthorizedException("Demo learner not found.");
      if (!found.active)
        throw new UnauthorizedException("This learner account is deactivated.");
      req.principal.learnerId = found.id;
      req.principal.actor = `demo-learner:${found.id}`;
    }
    const staffId = req.headers["x-prototype-staff-id"];
    if (staffId && req.principal.scopes.includes("staff:session")) {
      if (typeof staffId !== "string" || !uuid.test(staffId))
        throw new UnauthorizedException("Invalid staff member.");
      const member = await prisma.staff_members.findUnique({
        where: { id: staffId },
        select: { id: true, roles: true, active: true },
      });
      if (!member?.active)
        throw new UnauthorizedException("Staff member not found or inactive.");
      // The staff member's roles, not the token, decide what they may do.
      req.principal = {
        actor: `staff:${member.id}`,
        staffId: member.id,
        scopes: scopesFor(member.roles),
      };
    }
    return true;
  }
}
export function requireScope(req: { principal: Principal }, scope: string) {
  if (!req.principal.scopes.includes(scope))
    throw new ForbiddenException(`Required scope: ${scope}`);
}
