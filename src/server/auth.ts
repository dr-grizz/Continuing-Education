import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
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
import { CanvasStaffAuthService } from "./canvas-staff-auth";
import { staffAuthMode } from "./staff-auth-config";
import { learnerAuthMode } from "./learner-auth-config";
import { CanvasLearnerAuthService } from "./canvas-learner-auth";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Three local broker tokens identify the calling system. Learners and mock-mode
// staff are selected by prototype headers (ADR 0004). Canvas-mode staff require
// a verified opaque session; prototype staff headers are rejected.
@Injectable()
export class PrototypeGuard implements CanActivate {
  constructor(
    private readonly canvasAuth: CanvasStaffAuthService,
    @Optional() private readonly learnerAuth?: CanvasLearnerAuthService,
  ) {}
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
    if (
      req.principal.scopes.includes("learner") &&
      learnerAuthMode() === "canvas"
    ) {
      if (req.headers["x-prototype-learner-id"] || !this.learnerAuth)
        throw new UnauthorizedException(
          "Mock learner identities are disabled.",
        );
      req.principal = await this.learnerAuth.principal(
        req.headers["x-learner-session"],
      );
      return true;
    }
    if (
      req.principal.scopes.includes("staff:session") &&
      staffAuthMode() === "canvas"
    ) {
      if (req.headers["x-prototype-staff-id"])
        throw new UnauthorizedException("Mock staff identities are disabled.");
      req.principal = await this.canvasAuth.principal(
        req.headers["x-staff-session"],
      );
      return true;
    }
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
/** Allows the request when the principal holds any one of the scopes. */
export function requireAnyScope(
  req: { principal: Principal },
  ...scopes: string[]
) {
  if (!scopes.some((scope) => req.principal.scopes.includes(scope)))
    throw new ForbiddenException(`Required scope: one of ${scopes.join(", ")}`);
}
