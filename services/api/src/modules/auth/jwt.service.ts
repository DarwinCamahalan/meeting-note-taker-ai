/**
 * ES256 JWT signing/verification via `jose`.
 *
 * Keys load from env (PKCS#8 private / SPKI public PEM, `\n`-escaped accepted).
 * When absent — dev only — an EPHEMERAL keypair is generated so the service
 * boots; tokens then do not survive a restart.
 *
 * TODO(prod: KMS asymmetric signing per 40-authentication.md §2.3): sign via
 * kms:Sign against an ECC_NIST_P256 CMK; never ship a raw private key.
 */
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  SignJWT,
  generateKeyPair,
  importPKCS8,
  importSPKI,
  jwtVerify,
  type JWTPayload,
  type KeyLike,
} from 'jose';
import { AppConfig } from '../../config/app-config.js';

const ALG = 'ES256';
const ISSUER = 'https://api.usecue.app';

/** Claims minus the registered fields the signer sets (sub/iat/exp/iss). */
type CustomClaims<T extends JWTPayload> = Omit<T, 'iat' | 'exp' | 'iss'>;

@Injectable()
export class JwtService implements OnModuleInit {
  private readonly logger = new Logger(JwtService.name);
  private privateKey: KeyLike | undefined;
  private publicKey: KeyLike | undefined;

  constructor(private readonly config: AppConfig) {}

  async onModuleInit(): Promise<void> {
    const priv = this.config.jwtPrivateKey;
    const pub = this.config.jwtPublicKey;

    if (priv && pub) {
      this.privateKey = await importPKCS8(normalizePem(priv), ALG);
      this.publicKey = await importSPKI(normalizePem(pub), ALG);
      return;
    }

    if (this.config.isProduction) {
      throw new Error('JWT_PRIVATE_KEY/JWT_PUBLIC_KEY are required in production.');
    }

    this.logger.warn(
      'JWT_PRIVATE_KEY/JWT_PUBLIC_KEY not set — generating an EPHEMERAL dev ES256 keypair. ' +
        'Tokens will not survive a restart. TODO(prod): load keys from env / KMS.',
    );
    const { privateKey, publicKey } = await generateKeyPair(ALG, { extractable: false });
    this.privateKey = privateKey;
    this.publicKey = publicKey;
  }

  private requirePrivate(): KeyLike {
    if (!this.privateKey) throw new Error('JwtService not initialized (no signing key).');
    return this.privateKey;
  }

  private requirePublic(): KeyLike {
    if (!this.publicKey) throw new Error('JwtService not initialized (no verification key).');
    return this.publicKey;
  }

  /** Sign a JWT with `ttlSeconds` expiry. `sub` is promoted to the standard claim. */
  async sign<T extends JWTPayload>(claims: CustomClaims<T> & { sub: string }, ttlSeconds: number): Promise<string> {
    const { sub, ...rest } = claims;
    return new SignJWT(rest as JWTPayload)
      .setProtectedHeader({ alg: ALG, typ: 'JWT' })
      .setSubject(sub)
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime(`${String(ttlSeconds)}s`)
      .sign(this.requirePrivate());
  }

  /** Verify signature + issuer and return the typed payload. Throws on failure. */
  async verify<T extends JWTPayload>(token: string): Promise<T> {
    const { payload } = await jwtVerify(token, this.requirePublic(), { issuer: ISSUER });
    return payload as T;
  }
}

/** Accept PEM with literal `\n` escapes (common when stored in a single env var). */
function normalizePem(pem: string): string {
  return pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
}
