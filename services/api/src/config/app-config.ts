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
   * Dev ES256 keypair (PKCS#8 private / SPKI public), PEM with literal `\n`
   * escapes accepted. Optional in dev — an ephemeral keypair is generated when
   * absent. TODO(prod: KMS asymmetric signing per 40-authentication.md §2.3).
   */
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),

  /** Web app origin — CORS + the PKCE `/activate` verification page. */
  WEB_BASE_URL: z.string().url().default('http://localhost:3000'),

  /** Public ws-gateway URL handed to clients in a ws-ticket. */
  WS_PUBLIC_URL: z.string().min(1).default('ws://localhost:3002'),

  /** Token / device-code lifetimes (seconds). */
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(600),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(2_592_000),
  DEVICE_CODE_TTL: z.coerce.number().int().positive().default(600),
  DEVICE_CODE_INTERVAL: z.coerce.number().int().positive().default(2),
  WS_TICKET_TTL: z.coerce.number().int().positive().default(60),
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
  readonly jwtPrivateKey: string | undefined;
  readonly jwtPublicKey: string | undefined;
  readonly webBaseUrl: string;
  readonly wsPublicUrl: string;
  readonly accessTokenTtl: number;
  readonly refreshTokenTtl: number;
  readonly deviceCodeTtl: number;
  readonly deviceCodeInterval: number;
  readonly wsTicketTtl: number;

  constructor(env: Env) {
    this.nodeEnv = env.NODE_ENV;
    this.apiPort = env.API_PORT;
    this.databaseUrl = env.DATABASE_URL;
    this.jwtPrivateKey = env.JWT_PRIVATE_KEY;
    this.jwtPublicKey = env.JWT_PUBLIC_KEY;
    this.webBaseUrl = env.WEB_BASE_URL;
    this.wsPublicUrl = env.WS_PUBLIC_URL;
    this.accessTokenTtl = env.ACCESS_TOKEN_TTL;
    this.refreshTokenTtl = env.REFRESH_TOKEN_TTL;
    this.deviceCodeTtl = env.DEVICE_CODE_TTL;
    this.deviceCodeInterval = env.DEVICE_CODE_INTERVAL;
    this.wsTicketTtl = env.WS_TICKET_TTL;
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
