/**
 * Verificações guardadas pelo servidor (v02, fatia 4).
 *
 * `save_report` aceitava o campo `verification` que o chamador enviasse: bastava escrever
 * `verdict: "confirmed"`. Agora o servidor guarda o resultado de cada `verify_finding` pelo SHA-256
 * do payload verificado, e o relatório só usa o que está guardado. Um achado alterado depois de
 * verificado tem outro hash e volta a ser não verificado.
 */
import { createHash } from "node:crypto";
import type { Finding, Verification } from "../schema/finding.js";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)])
    );
  }
  return value;
}

/** Hash do achado inteiro, exceto o campo `verification`, que é resultado e não alegação. */
export function findingSha256(finding: Finding): string {
  const { verification: _ignored, ...payload } = finding;
  return createHash("sha256").update(JSON.stringify(canonical(payload))).digest("hex");
}

export interface StoredVerification {
  verificationId: string;
  findingSha256: string;
  verifiedAt: string;
  verification: Verification;
}

export class VerificationStore {
  private readonly byHash = new Map<string, StoredVerification>();
  private counter = 0;

  /** A verificação mais recente de um mesmo payload substitui a anterior. */
  record(finding: Finding, verification: Verification): StoredVerification {
    this.counter += 1;
    const stored: StoredVerification = {
      verificationId: `V-${String(this.counter).padStart(3, "0")}`,
      findingSha256: findingSha256(finding),
      verifiedAt: new Date().toISOString(),
      verification,
    };
    this.byHash.set(stored.findingSha256, stored);
    return stored;
  }

  lookup(finding: Finding): StoredVerification | undefined {
    return this.byHash.get(findingSha256(finding));
  }
}
