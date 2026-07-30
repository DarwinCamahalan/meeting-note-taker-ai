/**
 * Update tamper-rejection suite (required release gate — release-desktop.yml).
 *
 * Exercises the INDEPENDENT manifest verification in `./update-verify` against
 * the attacks it exists to stop (docs/05-remediation-plan, docs/60 §7.7):
 *   - a swapped installer  -> manifest bytes changed -> signature invalid
 *   - a forged / absent .minisig
 *   - a signature made by a key that is NOT the pinned key (key-id mismatch)
 * plus the happy paths (legacy `Ed` and prehashed `ED`) so a regression that
 * simply accepts everything is caught too.
 *
 * The helpers build real minisign-format artifacts with Node's Ed25519 crypto,
 * so the test never shells out and needs no fixtures.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign as edSign,
  type KeyObject,
} from 'node:crypto';
import { verifyManifestSignature } from './update-verify';

const ED25519_SPKI_PREFIX_LEN = 12;

interface TestKeyPair {
  /** Bare base64 minisign public-key payload (`Ed` || keyId || pk). */
  publicKeyB64: string;
  /** 8-byte key id (hex). */
  keyId: Buffer;
  privateKey: KeyObject;
  rawPublicKey: Buffer;
}

/** Generate an Ed25519 keypair and its minisign-format public-key payload. */
function makeKeyPair(keyId: Buffer = randomBytes(8)): TestKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const spki = publicKey.export({ format: 'der', type: 'spki' });
  const rawPublicKey = spki.subarray(ED25519_SPKI_PREFIX_LEN);
  const payload = Buffer.concat([Buffer.from('Ed', 'ascii'), keyId, rawPublicKey]);
  return { publicKeyB64: payload.toString('base64'), keyId, privateKey, rawPublicKey };
}

/** Produce a bare minisign detached-signature payload over `manifest`. */
function signManifest(
  manifest: Buffer,
  kp: TestKeyPair,
  algorithm: 'Ed' | 'ED' = 'Ed',
): string {
  const message =
    algorithm === 'ED' ? createHash('blake2b512').update(manifest).digest() : manifest;
  const signature = edSign(null, message, kp.privateKey);
  const payload = Buffer.concat([Buffer.from(algorithm, 'ascii'), kp.keyId, signature]);
  return payload.toString('base64');
}

const MANIFEST = Buffer.from(
  ['version: 1.4.0', 'path: Cue-1.4.0-universal.dmg', 'sha512: aGVsbG8=', 'releaseDate: 2026-07-30'].join(
    '\n',
  ),
  'utf8',
);

test('accepts a valid legacy (Ed) signature from the pinned key', () => {
  const kp = makeKeyPair();
  const sig = signManifest(MANIFEST, kp, 'Ed');
  const result = verifyManifestSignature(MANIFEST, sig, kp.publicKeyB64);
  assert.equal(result.ok, true, result.reason);
});

test('accepts a valid prehashed (ED) signature from the pinned key', () => {
  const kp = makeKeyPair();
  const sig = signManifest(MANIFEST, kp, 'ED');
  const result = verifyManifestSignature(MANIFEST, sig, kp.publicKeyB64);
  assert.equal(result.ok, true, result.reason);
});

test('rejects a swapped installer (manifest bytes mutated after signing)', () => {
  const kp = makeKeyPair();
  const sig = signManifest(MANIFEST, kp, 'Ed');
  // Attacker rewrites the sha512 to point at a malicious installer.
  const tampered = Buffer.from(MANIFEST.toString('utf8').replace('sha512: aGVsbG8=', 'sha512: ZXZpbA=='), 'utf8');
  const result = verifyManifestSignature(tampered, sig, kp.publicKeyB64);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'primary signature invalid');
});

test('rejects a signature made by a non-pinned key (key-id mismatch)', () => {
  const pinned = makeKeyPair(Buffer.from('1111111111111111', 'hex'));
  const attacker = makeKeyPair(Buffer.from('2222222222222222', 'hex'));
  const sig = signManifest(MANIFEST, attacker, 'Ed');
  const result = verifyManifestSignature(MANIFEST, sig, pinned.publicKeyB64);
  assert.equal(result.ok, false);
  assert.match(result.reason ?? '', /key id mismatch/);
});

test('rejects a signature from the right key id but wrong private key', () => {
  const sharedId = Buffer.from('abababababababab', 'hex');
  const pinned = makeKeyPair(sharedId);
  // Same advertised key id, different underlying private key => forgery.
  const forger = makeKeyPair(sharedId);
  const sig = signManifest(MANIFEST, forger, 'Ed');
  const result = verifyManifestSignature(MANIFEST, sig, pinned.publicKeyB64);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'primary signature invalid');
});

test('rejects an absent / empty .minisig', () => {
  const kp = makeKeyPair();
  const result = verifyManifestSignature(MANIFEST, '', kp.publicKeyB64);
  assert.equal(result.ok, false);
  assert.ok(result.reason && result.reason.length > 0);
});

test('rejects a malformed (wrong-length) signature payload', () => {
  const kp = makeKeyPair();
  const garbage = Buffer.from('not-a-real-signature').toString('base64');
  const result = verifyManifestSignature(MANIFEST, garbage, kp.publicKeyB64);
  assert.equal(result.ok, false);
  assert.match(result.reason ?? '', /Signature must be/);
});
