/**
 * INDEPENDENT auto-update manifest verification (minisign-style Ed25519).
 *
 * This module is deliberately PURE and free of any Electron / `electron-updater`
 * imports so the signature check is unit-testable in a plain Node context and
 * cannot be influenced by the updater's own trust chain. It implements the
 * security control mandated by `docs/05-remediation-plan`:
 *
 *   Before `electron-updater` is allowed to download/apply an update, the
 *   release *manifest* (`latest*.yml`) MUST carry a detached signature made with
 *   a key that is DISTINCT from the artifact-host (R2/S3/CDN) credentials. We
 *   verify that signature here, against a PINNED public key, so that a party who
 *   only controls the artifact host (or a MITM on the CDN) cannot ship a
 *   malicious manifest. Only after this passes do we let `electron-updater`
 *   perform its own sha512 + OS code-signature checks.
 *
 * Format: compatible with `minisign` (https://jedisct1.github.io/minisign/).
 *   Public key line : base64( "Ed"        || keyId[8] || edPublicKey[32] )   = 42 bytes
 *   Signature line  : base64( "Ed" | "ED" || keyId[8] || edSignature[64] )   = 74 bytes
 *     - "Ed" (0x45 0x64): legacy, signature is over the RAW manifest bytes.
 *     - "ED" (0x45 0x44): prehashed, signature is over BLAKE2b-512(manifest).
 * The trusted-comment global signature (minisign line 4) is verified too when
 * present, but the primary signature over the manifest bytes is the control
 * that gates the update.
 */
import { createHash, createPublicKey, verify as edVerify, type KeyObject } from 'node:crypto';

/** Minisign signature algorithm tags. */
export type MinisignAlgorithm = 'Ed' | 'ED';

const ALGO_LEGACY = 'Ed'; // sign raw message
const ALGO_PREHASHED = 'ED'; // sign BLAKE2b-512(message)

const PUBLIC_KEY_BYTES = 42; // 2 (algo) + 8 (keyId) + 32 (ed25519 pk)
const SIGNATURE_BYTES = 74; // 2 (algo) + 8 (keyId) + 64 (ed25519 sig)
const ED25519_PK_LEN = 32;
const ED25519_SIG_LEN = 64;

/** DER SPKI prefix for a raw 32-byte Ed25519 public key. */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/** Parsed minisign public key. */
export interface MinisignPublicKey {
  algorithm: MinisignAlgorithm;
  /** 8-byte key id, hex-encoded (lowercase). */
  keyId: string;
  /** Raw 32-byte Ed25519 public key. */
  publicKey: Buffer;
}

/** Parsed minisign detached signature. */
export interface MinisignSignature {
  algorithm: MinisignAlgorithm;
  /** 8-byte key id, hex-encoded (lowercase). */
  keyId: string;
  /** Raw 64-byte Ed25519 signature over the (possibly prehashed) message. */
  signature: Buffer;
  /** Optional minisign trusted comment (line 3, after `trusted comment: `). */
  trustedComment?: string;
  /** Optional global signature (line 4) over `signature || trustedComment`. */
  globalSignature?: Buffer;
}

/** Result of a manifest verification attempt. */
export interface VerifyResult {
  ok: boolean;
  /** Machine-readable reason on failure (for tamper logging). */
  reason?: string;
}

/** Thrown when a minisign artifact cannot be parsed into a valid structure. */
export class MinisignParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MinisignParseError';
  }
}

function decodeAlgorithm(tag: string): MinisignAlgorithm {
  if (tag === ALGO_LEGACY) return ALGO_LEGACY;
  if (tag === ALGO_PREHASHED) return ALGO_PREHASHED;
  throw new MinisignParseError(`Unsupported minisign algorithm tag: ${JSON.stringify(tag)}`);
}

/** Return the non-empty, non-comment base64 payload lines of a minisign file. */
function payloadLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Parse a minisign public-key file (or a bare base64 key line). Accepts either
 * the two-line `.pub` file or just the base64 payload (as pinned in env).
 */
export function parseMinisignPublicKey(text: string): MinisignPublicKey {
  const lines = payloadLines(text);
  // A .pub file's second line is the payload; a bare env value is a single line.
  const b64 = lines.length >= 2 && !lines[0]?.includes('=') ? lines[1] : lines[0];
  if (!b64) throw new MinisignParseError('Empty minisign public key');

  let raw: Buffer;
  try {
    raw = Buffer.from(b64, 'base64');
  } catch {
    throw new MinisignParseError('Public key is not valid base64');
  }
  if (raw.length !== PUBLIC_KEY_BYTES) {
    throw new MinisignParseError(
      `Public key must be ${PUBLIC_KEY_BYTES} bytes, got ${raw.length}`,
    );
  }
  return {
    algorithm: decodeAlgorithm(raw.subarray(0, 2).toString('ascii')),
    keyId: raw.subarray(2, 10).toString('hex'),
    publicKey: raw.subarray(10, 10 + ED25519_PK_LEN),
  };
}

/** Parse a minisign detached signature file (`.minisig`). */
export function parseMinisignSignature(text: string): MinisignSignature {
  const lines = payloadLines(text);
  if (lines.length === 0) throw new MinisignParseError('Empty minisign signature');

  // Line ordering in a real .minisig:
  //   [0] untrusted comment: ...
  //   [1] <base64 primary signature>
  //   [2] trusted comment: ...
  //   [3] <base64 global signature>
  // A bare payload (no comments) may have just the base64 line(s).
  const primaryIdx = lines.findIndex((l) => !l.toLowerCase().startsWith('untrusted comment:'));
  const primaryB64 = lines[primaryIdx === -1 ? 0 : primaryIdx];
  if (!primaryB64) throw new MinisignParseError('Missing primary signature line');

  const raw = Buffer.from(primaryB64, 'base64');
  if (raw.length !== SIGNATURE_BYTES) {
    throw new MinisignParseError(
      `Signature must be ${SIGNATURE_BYTES} bytes, got ${raw.length}`,
    );
  }

  const sig: MinisignSignature = {
    algorithm: decodeAlgorithm(raw.subarray(0, 2).toString('ascii')),
    keyId: raw.subarray(2, 10).toString('hex'),
    signature: raw.subarray(10, 10 + ED25519_SIG_LEN),
  };

  const trustedLine = lines.find((l) => l.toLowerCase().startsWith('trusted comment:'));
  if (trustedLine) {
    sig.trustedComment = trustedLine.slice(trustedLine.indexOf(':') + 1).trim();
    const globalIdx = lines.indexOf(trustedLine) + 1;
    const globalB64 = lines[globalIdx];
    if (globalB64) {
      const global = Buffer.from(globalB64, 'base64');
      if (global.length === ED25519_SIG_LEN) sig.globalSignature = global;
    }
  }
  return sig;
}

/** Build a Node KeyObject from a raw 32-byte Ed25519 public key. */
function toKeyObject(rawPublicKey: Buffer): KeyObject {
  const der = Buffer.concat([ED25519_SPKI_PREFIX, rawPublicKey]);
  return createPublicKey({ key: der, format: 'der', type: 'spki' });
}

/** Message actually signed for a given algorithm (raw, or BLAKE2b-512 prehash). */
function signedMessage(manifest: Buffer, algorithm: MinisignAlgorithm): Buffer {
  return algorithm === ALGO_PREHASHED
    ? createHash('blake2b512').update(manifest).digest()
    : manifest;
}

/**
 * Verify a detached minisign signature over the manifest bytes against a pinned
 * public key. PURE — no I/O, no globals — so it is trivially unit-testable.
 *
 * @param manifest   Raw bytes of the release manifest (`latest*.yml`).
 * @param signature  Contents of the detached `.minisig` file (or bare payload).
 * @param publicKey  Pinned minisign public key (`.pub` text or bare base64).
 */
export function verifyManifestSignature(
  manifest: Buffer,
  signature: string,
  publicKey: string,
): VerifyResult {
  let pub: MinisignPublicKey;
  let sig: MinisignSignature;
  try {
    pub = parseMinisignPublicKey(publicKey);
    sig = parseMinisignSignature(signature);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'parse error' };
  }

  // The signature must have been made by the PINNED key, not merely any key.
  if (sig.keyId !== pub.keyId) {
    return {
      ok: false,
      reason: `key id mismatch: manifest signed by ${sig.keyId}, pinned key is ${pub.keyId}`,
    };
  }

  const key = toKeyObject(pub.publicKey);
  const message = signedMessage(manifest, sig.algorithm);

  let primaryOk = false;
  try {
    primaryOk = edVerify(null, message, key, sig.signature);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'verify threw' };
  }
  if (!primaryOk) return { ok: false, reason: 'primary signature invalid' };

  // If the trusted-comment global signature is present, verify it too. minisign
  // signs `primarySignature || trustedComment` with the same key.
  if (sig.globalSignature && sig.trustedComment !== undefined) {
    const globalMsg = Buffer.concat([sig.signature, Buffer.from(sig.trustedComment, 'utf8')]);
    let globalOk = false;
    try {
      globalOk = edVerify(null, globalMsg, key, sig.globalSignature);
    } catch {
      globalOk = false;
    }
    if (!globalOk) return { ok: false, reason: 'trusted-comment (global) signature invalid' };
  }

  return { ok: true };
}
