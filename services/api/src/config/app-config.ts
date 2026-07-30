/**
 * Typed, validated application configuration. All secrets/config come from the
 * environment only (never hardcoded). The env is validated once at boot with
 * Zod; an invalid environment fails fast with a readable message.
 */
import { z } from 'zod';

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  API_PORT: z.coerce.number().int().positive().default(3001),

  /** Postgres + pgvector connection string (consumed by @cue/db). */
  DATABASE_URL: z.string().min(1),

  /**
   * Voyage AI key for `voyage-3.5` embeddings (RAG document ingest + query).
   * Optional so the app boots without it; document upload fails fast with a
   * clear error when it is unset.
   */
  VOYAGE_API_KEY: z.string().optional(),

  /**
   * Dev ES256 keypair (PKCS#8 private / SPKI public), PEM with literal `\n`
   * escapes accepted. Optional in dev — an ephemeral keypair is generated when
   * absent. TODO(prod: KMS asymmetric signing per 40-authentication.md §2.3).
   */
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),

  /**
   * Control-Redis connection string (rate-limit counters, per 70 §2.6). Optional
   * so the app boots without Redis in local dev; the rate limiter then
   * fails OPEN (allows) — never fail-closed on request admission.
   */
  REDIS_URL: z.string().optional(),

  /** Fixed-window rate-limit period, seconds (per authenticated user / IP). */
  RATE_LIMIT_WINDOW: z.coerce.number().int().positive().default(60),
  /** Max requests per window before a 429 (RATE_LIMITED). */
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),

  /**
   * AWS region tag — drives the per-region admission budgets (70 §4.4). Purely
   * informational for `api`; the token buckets live in `ai-orchestrator`.
   */
  AWS_REGION: z.string().default('us-east-1'),

  /** Web app origin — the PKCE `/activate` verification page + default CORS origin. */
  WEB_BASE_URL: z.string().url().default('http://localhost:3000'),

  /**
   * Extra allowed CORS origins, comma-separated. Lets a hosted API accept the
   * deployed web origin (e.g. the Vercel URL) AND localhost without overloading
   * WEB_BASE_URL (which must stay a single URL for the activate-link builder).
   * When unset, CORS allows exactly WEB_BASE_URL.
   */
  CORS_ORIGINS: z.string().optional(),

  /** Public ws-gateway URL handed to clients in a ws-ticket. */
  WS_PUBLIC_URL: z.string().min(1).default('ws://localhost:3002'),

  /** Token / device-code lifetimes (seconds). */
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(600),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(2_592_000),
  DEVICE_CODE_TTL: z.coerce.number().int().positive().default(600),
  DEVICE_CODE_INTERVAL: z.coerce.number().int().positive().default(2),
  WS_TICKET_TTL: z.coerce.number().int().positive().default(60),

  /* ---- Billing (Stripe). All optional so the app boots without billing in
   * local dev; BillingModule / BillingWebhooksModule throw a clear error at
   * call time when a required key is absent (fail-loud, never silently). ---- */
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_TEAM: z.string().optional(),
  STRIPE_PRICE_OVERAGE: z.string().optional(),
  /** Stripe Customer Portal configuration id (optional; pins allowed prices). */
  STRIPE_PORTAL_CONFIG_ID: z.string().optional(),

  /* ---- Enterprise SSO/SCIM (WorkOS). All optional so the app boots without
   * WorkOS in local dev; the SsoModule throws a clear error at call time when a
   * required key is absent (fail-loud, never silently). ---- */
  /** WorkOS API secret key (`sk_...`). */
  WORKOS_API_KEY: z.string().optional(),
  /** WorkOS client id (`client_...`) used to build authorization URLs. */
  WORKOS_CLIENT_ID: z.string().optional(),
  /** WorkOS webhook signing secret; verifies the SCIM directory-sync webhook. */
  WORKOS_WEBHOOK_SECRET: z.string().optional(),
  /** Absolute callback URL WorkOS redirects to (`GET /v1/sso/callback`). */
  WORKOS_REDIRECT_URI: z.string().url().default('http://localhost:3001/v1/sso/callback'),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Injectable, frozen config object. Injected by class token into every service
 * that needs configuration.
 */
export class AppConfig {
  readonly nodeEnv: Env['NODE_ENV'];
  readonly apiPort: number;
  readonly databaseUrl: string;
  readonly redisUrl: string | undefined;
  readonly rateLimitWindow: number;
  readonly rateLimitMax: number;
  readonly awsRegion: string;
  readonly voyageApiKey: string | undefined;
  readonly jwtPrivateKey: string | undefined;
  readonly jwtPublicKey: string | undefined;
  readonly webBaseUrl: string;
  readonly corsOrigins: string[];
  readonly wsPublicUrl: string;
  readonly accessTokenTtl: number;
  readonly refreshTokenTtl: number;
  readonly deviceCodeTtl: number;
  readonly deviceCodeInterval: number;
  readonly wsTicketTtl: number;
  readonly stripeSecretKey: string | undefined;
  readonly stripeWebhookSecret: string | undefined;
  readonly stripePricePro: string | undefined;
  readonly stripePriceTeam: string | undefined;
  readonly stripePriceOverage: string | undefined;
  readonly stripePortalConfigId: string | undefined;
  readonly workosApiKey: string | undefined;
  readonly workosClientId: string | undefined;
  readonly workosWebhookSecret: string | undefined;
  readonly workosRedirectUri: string;

  constructor(env: Env) {
    this.nodeEnv = env.NODE_ENV;
    this.apiPort = env.API_PORT;
    this.databaseUrl = env.DATABASE_URL;
    this.redisUrl = env.REDIS_URL;
    this.rateLimitWindow = env.RATE_LIMIT_WINDOW;
    this.rateLimitMax = env.RATE_LIMIT_MAX;
    this.awsRegion = env.AWS_REGION;
    this.voyageApiKey = env.VOYAGE_API_KEY;
    this.jwtPrivateKey = env.JWT_PRIVATE_KEY;
    this.jwtPublicKey = env.JWT_PUBLIC_KEY;
    this.webBaseUrl = env.WEB_BASE_URL;
    this.corsOrigins = env.CORS_ORIGINS
      ? env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
      : [env.WEB_BASE_URL];
    this.wsPublicUrl = env.WS_PUBLIC_URL;
    this.accessTokenTtl = env.ACCESS_TOKEN_TTL;
    this.refreshTokenTtl = env.REFRESH_TOKEN_TTL;
    this.deviceCodeTtl = env.DEVICE_CODE_TTL;
    this.deviceCodeInterval = env.DEVICE_CODE_INTERVAL;
    this.wsTicketTtl = env.WS_TICKET_TTL;
    this.stripeSecretKey = env.STRIPE_SECRET_KEY;
    this.stripeWebhookSecret = env.STRIPE_WEBHOOK_SECRET;
    this.stripePricePro = env.STRIPE_PRICE_PRO;
    this.stripePriceTeam = env.STRIPE_PRICE_TEAM;
    this.stripePriceOverage = env.STRIPE_PRICE_OVERAGE;
    this.stripePortalConfigId = env.STRIPE_PORTAL_CONFIG_ID;
    this.workosApiKey = env.WORKOS_API_KEY;
    this.workosClientId = env.WORKOS_CLIENT_ID;
    this.workosWebhookSecret = env.WORKOS_WEBHOOK_SECRET;
    this.workosRedirectUri = env.WORKOS_REDIRECT_URI;
    Object.freeze(this);
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }
}

/** Validate `process.env` (or an override) and build the {@link AppConfig}. */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return new AppConfig(parsed.data);
}
