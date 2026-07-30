/**
 * In-memory device-code store for the PKCE MVP flow.
 *
 * TODO(prod: Redis/IdP): replace with a Redis-backed store keyed by device_code
 * with a native TTL, and track real approval state written by the web
 * `/activate` page after a genuine IdP (Clerk/WorkOS) login — not the MVP
 * auto-approve. Nothing here is durable or multi-instance safe.
 */
import { Injectable } from '@nestjs/common';

export interface DeviceCodeRecord {
  deviceCode: string;
  /** base64url(sha256(code_verifier)) captured at /pkce/start. */
  codeChallenge: string;
  method: 'S256';
  createdAt: number;
  expiresAt: number;
  consumed: boolean;
}

@Injectable()
export class DeviceCodeStore {
  private readonly records = new Map<string, DeviceCodeRecord>();

  create(record: DeviceCodeRecord): void {
    this.records.set(record.deviceCode, record);
  }

  /** Fetch a live (non-expired) record, pruning it if stale. */
  get(deviceCode: string): DeviceCodeRecord | undefined {
    const record = this.records.get(deviceCode);
    if (!record) return undefined;
    if (record.expiresAt <= Date.now()) {
      this.records.delete(deviceCode);
      return undefined;
    }
    return record;
  }

  /** Mark a record consumed (single-use exchange). */
  consume(deviceCode: string): void {
    const record = this.records.get(deviceCode);
    if (record) record.consumed = true;
  }
}
