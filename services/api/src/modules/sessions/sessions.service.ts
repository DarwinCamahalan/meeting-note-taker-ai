/**
 * Sessions service — persists session records via @cue/db and mints realtime
 * ws-tickets. Listing uses keyset pagination on the time-ordered uuidv7 PK
 * (id desc == newest first), so no offset scan is needed.
 */
import { Injectable } from '@nestjs/common';
import { and, desc, eq, lt } from 'drizzle-orm';
import { sessions } from '@cue/db';
import type { NewSession } from '@cue/db';
import type { Paginated, Session, WsTicket } from '@cue/types';
import { AppConfig } from '../../config/app-config.js';
import type { AuthContext } from '../../common/auth-context.js';
import { notFound } from '../../common/problem-details.js';
import { DbService } from '../../database/db.service.js';
import type { CreateSessionRequestDto, ListSessionsQueryDto } from '../../contracts/index.js';
import { JwtService } from '../auth/jwt.service.js';
import type { WsTicketClaims } from '../auth/token-claims.js';
import { toSessionDto } from './sessions.mapper.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class SessionsService {
  constructor(
    private readonly config: AppConfig,
    private readonly db: DbService,
    private readonly jwt: JwtService,
  ) {}

  async create(ctx: AuthContext, body: CreateSessionRequestDto): Promise<Session> {
    const values: NewSession = {
      orgId: ctx.orgId,
      userId: ctx.userId,
      mode: body.kind,
      disclosed: body.disclosed ?? false,
      title: body.title ?? null,
      language: body.language ?? 'en',
    };
    const [row] = await this.db.db.insert(sessions).values(values).returning();
    if (!row) {
      throw new Error('Failed to create session.');
    }
    return toSessionDto(row);
  }

  async list(ctx: AuthContext, query: ListSessionsQueryDto): Promise<Paginated<Session>> {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = query.cursor;

    const where =
      cursor !== undefined
        ? and(eq(sessions.orgId, ctx.orgId), lt(sessions.id, cursor))
        : eq(sessions.orgId, ctx.orgId);

    const rows = await this.db.db
      .select()
      .from(sessions)
      .where(where)
      .orderBy(desc(sessions.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);

    return {
      data: page.map(toSessionDto),
      nextCursor: hasMore && last ? last.id : null,
      hasMore,
    };
  }

  async get(ctx: AuthContext, id: string): Promise<Session> {
    const [row] = await this.db.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.orgId, ctx.orgId)))
      .limit(1);
    if (!row) {
      throw notFound('Session not found.');
    }
    return toSessionDto(row);
  }

  /** Mint a single-use, short-lived ws-ticket the gateway verifies statelessly. */
  async wsTicket(ctx: AuthContext, id: string): Promise<WsTicket> {
    // Ensure the session exists and belongs to the caller's org.
    await this.get(ctx, id);

    const ticket = await this.jwt.sign<WsTicketClaims>(
      { sub: ctx.userId, org: ctx.orgId, sid: id, typ: 'ws' },
      this.config.wsTicketTtl,
    );
    return {
      ticket,
      wsUrl: this.config.wsPublicUrl,
      protocol: 'cue.v1',
      expiresAt: new Date(Date.now() + this.config.wsTicketTtl * 1000).toISOString(),
    };
  }
}
