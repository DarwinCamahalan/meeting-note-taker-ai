/**
 * WorkosService — the single, thin adapter over `@workos-inc/node`. It owns the
 * lazily-constructed WorkOS client and exposes exactly the calls the SsoModule
 * needs (authorization URL, code exchange, org/connection admin, webhook
 * verification). Keeping every WorkOS-specific type behind this boundary means
 * the rest of the module speaks our DTOs, not vendor shapes.
 *
 * Fail-loud: any call made without WORKOS_API_KEY / WORKOS_CLIENT_ID throws an
 * UPSTREAM error at call time (the app still boots without WorkOS in local dev).
 *
 * TODO(prod): pin the webhook `tolerance` and add per-connection state signing
 * for the authorize/callback CSRF `state` (41-threat-model.md §SSO).
 */
import { Injectable, Logger } from '@nestjs/common';
import { DomainDataState, WorkOS } from '@workos-inc/node';
import type {
  Connection,
  Event,
  Organization,
  Profile,
  SSOAuthorizationURLOptions,
} from '@workos-inc/node';
import type { SsoProvider } from '@cue/types';
import { internal, unauthorized } from '../../common/problem-details.js';
import { AppConfig } from '../../config/app-config.js';

/** WorkOS SSO profile with the default custom-attributes shape. */
export type SsoProfile = Profile<Record<string, unknown>>;

/** Options for {@link WorkosService.getAuthorizationUrl} (pre-resolved routing). */
export interface AuthorizeUrlOptions {
  organizationId?: string | undefined;
  connectionId?: string | undefined;
  provider?: SsoProvider | undefined;
  redirectUri: string;
  state?: string | undefined;
}

@Injectable()
export class WorkosService {
  private readonly logger = new Logger(WorkosService.name);
  private client: WorkOS | undefined;

  constructor(private readonly config: AppConfig) {}

  /** True when both the API key and client id are configured. */
  get isConfigured(): boolean {
    return Boolean(this.config.workosApiKey && this.config.workosClientId);
  }

  /** The default callback URL WorkOS redirects to after authentication. */
  get redirectUri(): string {
    return this.config.workosRedirectUri;
  }

  /** Lazily construct + cache the WorkOS client; throw loudly when unconfigured. */
  private require(): { workos: WorkOS; clientId: string } {
    const { workosApiKey, workosClientId } = this.config;
    if (!workosApiKey || !workosClientId) {
      throw internal('WorkOS is not configured (WORKOS_API_KEY / WORKOS_CLIENT_ID).');
    }
    this.client ??= new WorkOS(workosApiKey, { clientId: workosClientId });
    return { workos: this.client, clientId: workosClientId };
  }

  /** Build the WorkOS-hosted authorization URL for a pre-resolved org/connection. */
  getAuthorizationUrl(options: AuthorizeUrlOptions): string {
    const { workos, clientId } = this.require();
    // Set only defined keys — WorkOS's options are exact-optional.
    const params: SSOAuthorizationURLOptions = { clientId, redirectUri: options.redirectUri };
    if (options.organizationId) params.organization = options.organizationId;
    if (options.connectionId) params.connection = options.connectionId;
    if (options.provider === 'authkit') params.provider = 'authkit';
    if (options.state) params.state = options.state;
    return workos.sso.getAuthorizationUrl(params);
  }

  /** Exchange a callback `code` for the authenticated user's SSO profile. */
  async getProfile(code: string): Promise<SsoProfile> {
    const { workos, clientId } = this.require();
    try {
      const { profile } = await workos.sso.getProfileAndToken({ code, clientId });
      return profile;
    } catch (err) {
      this.logger.warn(`WorkOS code exchange failed: ${errText(err)}`);
      throw unauthorized('Failed to exchange the SSO authorization code.');
    }
  }

  /** Find-or-create a WorkOS Organization bound to `domain`; returns its id. */
  async ensureOrganization(name: string, domain: string): Promise<Organization> {
    const { workos } = this.require();
    return workos.organizations.createOrganization({
      name,
      domainData: [{ domain, state: DomainDataState.Verified }],
    });
  }

  /** Delete a WorkOS connection. Idempotent from the caller's perspective. */
  async deleteConnection(connectionId: string): Promise<void> {
    const { workos } = this.require();
    await workos.sso.deleteConnection(connectionId);
  }

  /** Read a WorkOS connection (used to reconcile status on read). */
  async getConnection(connectionId: string): Promise<Connection> {
    const { workos } = this.require();
    return workos.sso.getConnection(connectionId);
  }

  /**
   * Verify a directory-sync webhook against WORKOS_WEBHOOK_SECRET and return the
   * typed {@link Event}. `payload` is the PARSED JSON body — the WorkOS SDK
   * re-serializes it when recomputing the HMAC. Throws on a bad signature.
   */
  async constructWebhookEvent(payload: unknown, sigHeader: string): Promise<Event> {
    const { workos } = this.require();
    const secret = this.config.workosWebhookSecret;
    if (!secret) {
      throw internal('WORKOS_WEBHOOK_SECRET is not configured.');
    }
    return workos.webhooks.constructEvent({ payload, sigHeader, secret });
  }
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
