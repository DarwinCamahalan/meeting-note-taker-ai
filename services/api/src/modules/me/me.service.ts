/** Assembles the `GET /v1/me` response from the caller's auth context. */
import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { orgMembers, orgs, users } from '@cue/db';
import type { Org as OrgRow, User as UserRow } from '@cue/db';
import type { MeResponse, Org, User } from '@cue/types';
import type { AuthContext } from '../../common/auth-context.js';
import { notFound } from '../../common/problem-details.js';
import { DbService } from '../../database/db.service.js';

@Injectable()
export class MeService {
  constructor(private readonly db: DbService) {}

  async getMe(ctx: AuthContext): Promise<MeResponse> {
    const [userRow] = await this.db.db.select().from(users).where(eq(users.id, ctx.userId)).limit(1);
    const [orgRow] = await this.db.db.select().from(orgs).where(eq(orgs.id, ctx.orgId)).limit(1);
    if (!userRow || !orgRow) {
      throw notFound('User or org not found.');
    }

    const memberships = await this.db.db
      .select()
      .from(orgMembers)
      .where(and(eq(orgMembers.userId, ctx.userId), eq(orgMembers.orgId, ctx.orgId)));

    return {
      user: toUserDto(userRow, orgRow.id),
      org: toOrgDto(orgRow),
      roles: memberships.map((m) => m.role),
    };
  }
}

function toUserDto(row: UserRow, orgId: string): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    dataRegion: row.dataRegion,
    orgId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toOrgDto(row: OrgRow): Org {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    dataRegion: row.dataRegion,
    isPersonal: row.isPersonal,
    createdAt: row.createdAt.toISOString(),
  };
}
