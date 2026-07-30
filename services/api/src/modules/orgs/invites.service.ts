/**
 * InvitesService — org membership invitations. Create issues an opaque
 * single-use token (returned to the caller only as a hash-backed row; the raw
 * token is delivered out-of-band). Accept redeems a raw token as the signed-in
 * user, provisioning their `org_members` row at the invited role.
 *
 * The raw token is stored only as a SHA-256 hash (`invitations.token`), so a DB
 * leak never yields a usable accept credential.
 *
 * TODO(phase-3): deliver the raw accept token by email (out of scope here). For
 * now it is logged once at creation for dev/manual redemption.
 */
import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { invitations, orgMembers, users } from '@cue/db';
import type { NewInvitation, NewOrgMember } from '@cue/db';
import type { AdminMemberView, OrgInvite, Role } from '@cue/types';
import type { AuthContext } from '../../common/auth-context.js';
import { conflict, notFound } from '../../common/problem-details.js';
import { DbService } from '../../database/db.service.js';
import type { CreateInviteRequestDto } from '../../contracts/index.js';
import { AuditService } from '../audit/audit.service.js';
import { toAdminMemberView, toOrgInviteDto, type MemberJoin } from './orgs.mapper.js';
import { MembersService } from './members.service.js';

/** Invitations expire 7 days after issue. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);

  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly members: MembersService,
  ) {}

  /** Issue an invitation. Rejects if the email already belongs to the org. */
  async create(actor: AuthContext, orgId: string, dto: CreateInviteRequestDto): Promise<OrgInvite> {
    const email = dto.email.trim().toLowerCase();
    if (await this.isAlreadyMember(orgId, email)) {
      throw conflict('That email already belongs to a member of this org.');
    }

    const rawToken = randomBytes(32).toString('hex');
    const values: NewInvitation = {
      orgId,
      email,
      role: dto.role,
      token: hashToken(rawToken),
      status: 'pending',
      invitedBy: actor.userId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    };

    const [row] = await this.db.db.insert(invitations).values(values).returning();
    if (!row) throw conflict('Could not create the invitation.');

    // TODO(phase-3): email the accept link containing rawToken. Logged for dev.
    this.logger.log(`Invite ${row.id} for ${email} (org ${orgId}) accept token: ${rawToken}`);

    await this.audit.record({
      orgId,
      action: 'member.invite',
      actorUserId: actor.userId,
      targetType: 'invite',
      targetId: row.id,
      metadata: { email, role: dto.role },
    });

    return toOrgInviteDto(row);
  }

  /** List the org's invitations, newest first. */
  async list(orgId: string): Promise<OrgInvite[]> {
    const rows = await this.db.db
      .select()
      .from(invitations)
      .where(eq(invitations.orgId, orgId))
      .orderBy(desc(invitations.id));
    return rows.map(toOrgInviteDto);
  }

  /**
   * Redeem a raw invite token as the signed-in user. Verifies the token is
   * pending, unexpired, and issued to the caller's email, then provisions (or
   * reuses) the member's `org_members` row at the invited role.
   */
  async accept(actor: AuthContext, rawToken: string): Promise<AdminMemberView> {
    const tokenHash = hashToken(rawToken);
    const [invite] = await this.db.db
      .select()
      .from(invitations)
      .where(eq(invitations.token, tokenHash))
      .limit(1);
    if (!invite) throw notFound('Invitation not found.');

    if (invite.status !== 'pending') {
      throw conflict(`Invitation is ${invite.status}.`);
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      await this.db.db
        .update(invitations)
        .set({ status: 'expired' })
        .where(eq(invitations.id, invite.id));
      throw conflict('Invitation has expired.');
    }
    if (invite.email.toLowerCase() !== actor.email.toLowerCase()) {
      throw conflict('This invitation was issued to a different email address.');
    }

    const role = (invite.role === 'billing' ? 'member' : invite.role) as Role;
    await this.db.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: orgMembers.id })
        .from(orgMembers)
        .where(and(eq(orgMembers.orgId, invite.orgId), eq(orgMembers.userId, actor.userId)))
        .limit(1);

      if (existing) {
        await tx.update(orgMembers).set({ role }).where(eq(orgMembers.id, existing.id));
      } else {
        const member: NewOrgMember = { orgId: invite.orgId, userId: actor.userId, role };
        await tx.insert(orgMembers).values(member);
      }
      await tx.update(invitations).set({ status: 'accepted' }).where(eq(invitations.id, invite.id));
    });

    await this.audit.record({
      orgId: invite.orgId,
      action: 'member.invite.accept',
      actorUserId: actor.userId,
      targetType: 'user',
      targetId: actor.userId,
      metadata: { inviteId: invite.id, role },
    });

    const join = await this.memberJoin(invite.orgId, actor.userId);
    if (!join) throw notFound('Member not found after accept.');
    const ssoLinked = await this.members.isSsoLinked(invite.orgId, join.email);
    return toAdminMemberView(join, ssoLinked);
  }

  private async isAlreadyMember(orgId: string, email: string): Promise<boolean> {
    const [row] = await this.db.db
      .select({ id: orgMembers.id })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(orgMembers.orgId, orgId), eq(users.email, email)))
      .limit(1);
    return row !== undefined;
  }

  private async memberJoin(orgId: string, userId: string): Promise<MemberJoin | undefined> {
    const [row] = await this.db.db
      .select({
        userId: orgMembers.userId,
        orgId: orgMembers.orgId,
        role: orgMembers.role,
        joinedAt: orgMembers.joinedAt,
        email: users.email,
        displayName: users.displayName,
        lastActiveAt: users.lastActiveAt,
      })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
      .limit(1);
    return row;
  }
}

/** SHA-256 hash of a raw token — what is persisted + compared. */
function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
