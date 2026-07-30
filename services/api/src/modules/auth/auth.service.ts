/**
 * Auth service — the OAuth2 PKCE device-code flow (MVP variant per this spec).
 *
 * MVP shortcuts, all flagged:
 *  - `/pkce/start` stores the challenge in-memory (see DeviceCodeStore).
 *  - `/pkce/exchange` verifies the PKCE challenge then AUTO-APPROVES a single
 *    shared dev identity. TODO(real IdP: Clerk/WorkOS): require the web
 *    `/activate` page to approve the device against a real login, and bind the
 *    resulting IdP subject instead of the synthetic dev user.
 */
import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { orgMembers, orgs, users } from '@cue/db';
import type { AuthTokens, DataRegion, OrgRole } from '@cue/types';
import { createHash, randomBytes } from 'node:crypto';
import { AppConfig } from '../../config/app-config.js';
import { unauthorized } from '../../common/problem-details.js';
import { DbService } from '../../database/db.service.js';
import type {
  PkceExchangeRequestDto,
  PkceStartRequestDto,
  PkceStartResponseDto,
  RefreshRequestDto,
} from '../../contracts/index.js';
import { DeviceCodeStore } from './device-code.store.js';
import { JwtService } from './jwt.service.js';
import type { AccessClaims, RefreshClaims } from './token-claims.js';

/** MVP: a single shared dev user is provisioned on first exchange. */
const DEV_EMAIL = 'dev@usecue.app';
const DEV_REGION: DataRegion = 'us';

interface Identity {
  userId: string;
  orgId: string;
  email: string;
  region: DataRegion;
  roles: OrgRole[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly config: AppConfig,
    private readonly db: DbService,
    private readonly jwt: JwtService,
    private readonly deviceCodes: DeviceCodeStore,
  ) {}

  /** `POST /v1/auth/pkce/start` — register a device-code + challenge. */
  pkceStart(body: PkceStartRequestDto): PkceStartResponseDto {
    const now = Date.now();
    const deviceCode = randomBytes(32).toString('base64url');
    this.deviceCodes.create({
      deviceCode,
      codeChallenge: body.code_challenge,
      method: body.code_challenge_method ?? 'S256',
      createdAt: now,
      expiresAt: now + this.config.deviceCodeTtl * 1000,
      consumed: false,
    });

    return {
      device_code: deviceCode,
      verification_uri: `${this.config.webBaseUrl}/activate?code=${encodeURIComponent(deviceCode)}`,
      interval: this.config.deviceCodeInterval,
      expires_in: this.config.deviceCodeTtl,
    };
  }

  /** `POST /v1/auth/pkce/exchange` — verify PKCE, auto-approve dev, mint tokens. */
  async pkceExchange(body: PkceExchangeRequestDto): Promise<AuthTokens> {
    const record = this.deviceCodes.get(body.device_code);
    if (!record || record.consumed) {
      throw unauthorized('Unknown, expired, or already-used device_code.');
    }
    if (!verifyPkce(body.code_verifier, record.codeChallenge)) {
      throw unauthorized('PKCE verification failed.');
    }
    this.deviceCodes.consume(body.device_code);

    const identity = await this.resolveDevIdentity();
    return this.issueTokens(identity);
  }

  /** `POST /v1/auth/refresh` — verify + rotate the refresh token. */
  async refresh(body: RefreshRequestDto): Promise<AuthTokens> {
    let claims: RefreshClaims;
    try {
      claims = await this.jwt.verify<RefreshClaims>(body.refresh_token);
    } catch {
      throw unauthorized('Invalid or expired refresh token.');
    }
    if (claims.typ !== 'refresh') {
      throw unauthorized('Wrong token type for refresh.');
    }

    const identity = await this.loadIdentity(claims.sub, claims.org);
    if (!identity) {
      throw unauthorized('User no longer exists.');
    }
    return this.issueTokens(identity);
  }

  private async issueTokens(identity: Identity): Promise<AuthTokens> {
    const access = await this.jwt.sign<AccessClaims>(
      {
        sub: identity.userId,
        org: identity.orgId,
        email: identity.email,
        region: identity.region,
        roles: identity.roles,
        typ: 'access',
      },
      this.config.accessTokenTtl,
    );
    const refresh = await this.jwt.sign<RefreshClaims>(
      { sub: identity.userId, org: identity.orgId, typ: 'refresh' },
      this.config.refreshTokenTtl,
    );
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: 'Bearer',
      expires_in: this.config.accessTokenTtl,
    };
  }

  private async loadIdentity(userId: string, orgId: string): Promise<Identity | undefined> {
    const [user] = await this.db.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return undefined;
    const memberships = await this.db.db
      .select()
      .from(orgMembers)
      .where(and(eq(orgMembers.userId, userId), eq(orgMembers.orgId, orgId)));
    const roles = memberships.map((m) => m.role);
    return { userId: user.id, orgId, email: user.email, region: user.dataRegion, roles };
  }

  /**
   * Find or provision the shared MVP dev identity (user + personal org + owner
   * membership). TODO(real IdP): derive identity from an approved IdP subject.
   */
  private async resolveDevIdentity(): Promise<Identity> {
    const [existing] = await this.db.db
      .select()
      .from(users)
      .where(eq(users.email, DEV_EMAIL))
      .limit(1);

    if (existing) {
      const [membership] = await this.db.db
        .select()
        .from(orgMembers)
        .where(eq(orgMembers.userId, existing.id))
        .limit(1);
      if (membership) {
        return {
          userId: existing.id,
          orgId: membership.orgId,
          email: existing.email,
          region: existing.dataRegion,
          roles: [membership.role],
        };
      }
    }

    return this.db.db.transaction(async (tx): Promise<Identity> => {
      const [org] = await tx
        .insert(orgs)
        .values({
          name: 'Personal',
          slug: `personal-${randomBytes(4).toString('hex')}`,
          dataRegion: DEV_REGION,
          isPersonal: true,
        })
        .returning();
      const [user] =
        existing !== undefined
          ? [existing]
          : await tx
              .insert(users)
              .values({
                email: DEV_EMAIL,
                clerkUserId: `dev|${randomBytes(8).toString('hex')}`,
                displayName: 'Dev User',
                dataRegion: DEV_REGION,
              })
              .returning();
      if (!org || !user) {
        throw new Error('Failed to provision dev identity.');
      }
      await tx.insert(orgMembers).values({ orgId: org.id, userId: user.id, role: 'owner' });
      return {
        userId: user.id,
        orgId: org.id,
        email: user.email,
        region: user.dataRegion,
        roles: ['owner'],
      };
    });
  }
}

/** RFC 7636 S256: base64url(sha256(code_verifier)) must equal the challenge. */
function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const computed = createHash('sha256').update(codeVerifier).digest('base64url');
  return computed === codeChallenge;
}
