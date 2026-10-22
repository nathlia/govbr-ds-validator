/**
 * Famílias de achados (2.11.0, NAT-84) — uma PROJEÇÃO de apresentação sobre findings já deduplicados.
 *
 * Em telas reais, dezenas de instâncias idênticas (dias de um calendário, células de tabela, 50
 * `.br-button`) inundavam as respostas. A família agrupa o que é a mesma alegação repetida, sem
 * perder nenhum membro: cada Finding ID, localizador, valor, assinatura de evidência e veredito
 * individual continua recuperável, e a paginação de membros percorre todos os ids.
 *
 * Regras:
 * - A chave da família inclui norma (fonte, id, implements, wcag), tipo (natureza, modo, caminho,
 *   severidade), propriedade, estado (página + fingerprint do lote) e a assinatura da evidência
 *   (observed, expected, data). Estados, normas, causas ou valores materialmente diferentes nunca
 *   caem na mesma família.
 * - O veredito do portão NÃO está na chave e NUNCA é herdado: cada membro carrega o seu, e a família
 *   só mostra a contagem por veredito, sem um veredito de família.
 * - Uma identidade (findingIdentity) que reaparece com evidência alterada vira outra assinatura —
 *   outra família — e as versões ficam listadas em `identityVersions`.
 * - Nada aqui altera a lista de findings, `summary`, `deduplication` ou o JSON do CLI de linha de
 *   base: agrupar é apresentação. Nada aqui depende do perfil de ferramentas.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import type { CheckStatus, Finding, Verdict, Verification } from "../schema/finding.js";
import { canonical } from "../verify/store.js";
import { findingIdentity, projectFinding, type FindingDetail } from "./findings.js";

export const FAMILY_KEY =
  "rule.source + rule.id + rule.implements + rule.wcag + nature + mode + pathway + severity + " +
  "element.page + stateFingerprint do lote + evidence.data.property + evidenceSignature";

export const EVIDENCE_SIGNATURE_KEY = "sha256(canonical({observed, expected, data})) — 16 hex";

export const DEFAULT_FAMILY_LIMIT = 20;
export const DEFAULT_MEMBER_LIMIT = 25;
export const DEFAULT_MEMBER_PAGE_LIMIT = 100;
export const DEFAULT_FAMILY_MAX_CHARS = 12_000;

export const FamilyViewInputShape = {
  view: z
    .enum(["findings", "families"])
    .optional()
    .describe(
      "families (padrão): agrupa instâncias idênticas (mesma norma, tipo, propriedade, estado e evidência) com contagem, " +
        "um exemplo, vereditos por membro e ids com cursor. findings: a página plana de findings. Só apresentação: " +
        "contagens e lote não mudam"
    ),
  memberLimit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Com view=families: máximo de ids listados por família (padrão 25); o resto via get_finding_details scanId+familyId"),
};

export type PartialReason = "limit" | "char-budget" | "member-limit" | "time-limit";

export interface FamilyOptions {
  /** Fingerprint do estado do lote (scan_page); null quando a ferramenta não produz um. */
  stateFingerprint?: string | null;
  /** Verificação guardada pelo servidor para o payload exato do membro. */
  verificationFor?: (finding: Finding) => Verification | undefined;
  /** Instante (ms desde a época) a partir do qual a projeção para e devolve resultado parcial. */
  deadline?: number;
  /** Relógio injetável (testes). */
  now?: () => number;
}

export interface FamilyPageOptions extends FamilyOptions {
  cursor?: number;
  limit?: number;
  maxChars?: number;
  memberLimit?: number;
}

export interface MemberPageOptions extends FamilyOptions {
  cursor?: number;
  limit?: number;
  maxChars?: number;
  detail?: FindingDetail;
}

/**
 * Três campos separados, de propósito:
 *   acceptedByAgent  o validador não vê a decisão final do agente — sempre null aqui; quem preenche
 *                    é o livro-razão da avaliação (govbr-eval)
 *   ruleApplicable   resultado da conferência de aplicabilidade do portão; "not-checked" sem portão
 *   confirmedByGate  true só com veredito confirmed guardado; false com outro veredito; null sem portão
 */
export interface MemberStatus {
  acceptedByAgent: null;
  ruleApplicable: CheckStatus | "not-checked";
  confirmedByGate: boolean | null;
  gateVerdict: Verdict | null;
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Assinatura do conteúdo da evidência — o que foi observado, o que se esperava e os dados. */
export function evidenceSignature(finding: Finding): string {
  const { observed, expected, data } = finding.evidence;
  return `ev-${sha(JSON.stringify(canonical({ observed, expected, data: data ?? null }))).slice(0, 16)}`;
}

function propertyOf(finding: Finding): string | null {
  const property = finding.evidence.data?.property;
  return typeof property === "string" ? property : null;
}

/**
 * Limitação conhecida: um achado de token não carrega a folha/seletor que declarou o valor (só
 * `authoredDeclarations` com os valores). Duas regras CSS diferentes com o mesmo valor fora da escala
 * caem na mesma família. Pôr a origem na chave exigiria gravá-la em `evidence.data`, o que mudaria o
 * JSON do CLI de linha de base; fica para quando o finding passar a carregar a causa.
 */
export function familyKey(finding: Finding, stateFingerprint: string | null = null): string {
  return JSON.stringify(
    canonical({
      source: finding.rule.source,
      ruleId: finding.rule.id,
      implements: [...(finding.rule.implements ?? [])].sort(),
      wcag: finding.rule.wcag ?? null,
      nature: finding.nature,
      mode: finding.mode,
      pathway: finding.pathway,
      severity: finding.severity,
      page: finding.element.page,
      stateFingerprint,
      property: propertyOf(finding),
      evidenceSignature: evidenceSignature(finding),
    })
  );
}

export function familyIdOf(finding: Finding, stateFingerprint: string | null = null): string {
  return `FAM-${sha(familyKey(finding, stateFingerprint)).slice(0, 12)}`;
}

function identityOf(finding: Finding): string {
  return `id-${sha(findingIdentity(finding)).slice(0, 12)}`;
}

function memberStatus(finding: Finding, verificationFor?: FamilyOptions["verificationFor"]): MemberStatus {
  // Só o que o servidor guardou conta; `verification` enviado por um chamador não é confiável.
  const verification = verificationFor?.(finding);
  if (!verification) {
    return { acceptedByAgent: null, ruleApplicable: "not-checked", confirmedByGate: null, gateVerdict: null };
  }
  return {
    acceptedByAgent: null,
    ruleApplicable: verification.checks?.applicability ?? "not-checked",
    confirmedByGate: verification.verdict === "confirmed",
    gateVerdict: verification.verdict,
  };
}

function truncate(value: string, max = 160): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function valueOf(finding: Finding): string {
  const property = propertyOf(finding);
  const observed = finding.evidence.data?.observed;
  if (property && typeof observed === "string") return `${property}: ${observed}`;
  return truncate(finding.evidence.observed);
}

interface Family {
  familyId: string;
  members: Finding[];
}

/**
 * Agrupa pela chave COMPLETA (nunca pelo id curto), preservando a ordem de primeira aparição e a dos
 * membros. Se duas chaves distintas derem o mesmo familyId de 12 hex, falha alto: um id ambíguo
 * faria a paginação de membros devolver a família errada.
 */
export function groupFamilies(findings: Finding[], stateFingerprint: string | null = null): Family[] {
  const byKey = new Map<string, Family>();
  const keyById = new Map<string, string>();
  for (const finding of findings) {
    const key = familyKey(finding, stateFingerprint);
    let family = byKey.get(key);
    if (!family) {
      const familyId = `FAM-${sha(key).slice(0, 12)}`;
      const owner = keyById.get(familyId);
      if (owner !== undefined && owner !== key) {
        throw new Error(`familyId ${familyId} colide entre duas chaves de família distintas`);
      }
      keyById.set(familyId, key);
      family = { familyId, members: [] };
      byKey.set(key, family);
    }
    family.members.push(finding);
  }
  return [...byKey.values()];
}

/** Identidades que aparecem com mais de uma assinatura de evidência na mesma projeção. */
export function identityVersions(findings: Finding[], stateFingerprint: string | null = null) {
  const byIdentity = new Map<string, Map<string, { evidenceSignature: string; familyId: string; memberIds: string[] }>>();
  for (const finding of findings) {
    const identity = identityOf(finding);
    const signature = evidenceSignature(finding);
    const versions = byIdentity.get(identity) ?? new Map();
    const version = versions.get(signature) ?? {
      evidenceSignature: signature,
      familyId: familyIdOf(finding, stateFingerprint),
      memberIds: [],
    };
    version.memberIds.push(finding.id);
    versions.set(signature, version);
    byIdentity.set(identity, versions);
  }
  return [...byIdentity.entries()]
    .filter(([, versions]) => versions.size > 1)
    .map(([identity, versions]) => ({ identity, versions: [...versions.values()] }));
}

function gateTally(members: Finding[], verificationFor?: FamilyOptions["verificationFor"]) {
  const tally = { confirmed: 0, rejected: 0, unverifiable: 0, notVerified: 0 };
  for (const member of members) {
    const verdict = memberStatus(member, verificationFor).gateVerdict;
    if (verdict) tally[verdict] += 1;
    else tally.notVerified += 1;
  }
  return tally;
}

function projectMember(finding: Finding, detail: FindingDetail, options: FamilyOptions) {
  const base = {
    id: finding.id,
    locator: finding.element.locator,
    value: valueOf(finding),
    evidenceSignature: evidenceSignature(finding),
    identity: identityOf(finding),
    status: memberStatus(finding, options.verificationFor),
  };
  if (detail === "summary") return base;
  if (detail === "evidence") {
    return { ...base, evidence: { observed: finding.evidence.observed, expected: finding.evidence.expected } };
  }
  return { ...base, finding };
}

function expired(options: FamilyOptions): boolean {
  return options.deadline !== undefined && (options.now ?? Date.now)() >= options.deadline;
}

const FAMILY_HINT =
  "Família = mesma norma, tipo, propriedade, estado e assinatura de evidência. Contagens e vereditos são por membro: " +
  "nenhum membro herda o veredito de outro. Os demais ids de uma família: get_finding_details(scanId, familyId, cursor=nextMemberCursor) " +
  "— não repita o scanner. Próxima página de famílias: get_finding_details(scanId, cursor=nextCursor).";

/**
 * Página de famílias. Cada família traz contagem, um exemplo, a contagem de vereditos individuais e
 * até `memberLimit` ids (com cursor para o resto). Truncamento, orçamento ou prazo devolvem resultado
 * parcial com o motivo e quantos membros conhecidos ficaram de fora desta resposta.
 */
export function buildFamilyPage(findings: Finding[], options: FamilyPageOptions = {}) {
  const state = options.stateFingerprint ?? null;
  const families = groupFamilies(findings, state);
  const cursor = Math.min(options.cursor ?? 0, families.length);
  const limit = options.limit ?? DEFAULT_FAMILY_LIMIT;
  const maxChars = options.maxChars ?? DEFAULT_FAMILY_MAX_CHARS;
  const memberLimit = options.memberLimit ?? DEFAULT_MEMBER_LIMIT;

  const projected: unknown[] = [];
  let usedChars = 0;
  let index = cursor;
  let membersListed = 0;
  let stopReason: PartialReason | undefined;
  let memberLimitHit = false;

  while (index < families.length) {
    if (projected.length >= limit) { stopReason = "limit"; break; }
    if (projected.length > 0 && expired(options)) { stopReason = "time-limit"; break; }
    const { familyId, members } = families[index];
    const first = members[0];
    const listed = members.slice(0, memberLimit).map((member) => member.id);
    const item = {
      familyId,
      count: members.length,
      rule: {
        source: first.rule.source,
        id: first.rule.id,
        ...(first.rule.implements?.length ? { implements: [...first.rule.implements] } : {}),
      },
      property: propertyOf(first),
      nature: first.nature,
      mode: first.mode,
      severity: first.severity,
      stateFingerprint: state,
      evidenceSignature: evidenceSignature(first),
      value: valueOf(first),
      example: projectFinding(first, "summary"),
      gate: gateTally(members, options.verificationFor),
      memberIds: listed,
      membersReturned: listed.length,
      membersNotReturned: members.length - listed.length,
      ...(listed.length < members.length
        ? {
            nextMemberCursor: listed.length,
            nextMemberCall: `get_finding_details(scanId, familyId="${familyId}", cursor=${listed.length})`,
          }
        : {}),
    };
    const itemChars = JSON.stringify(item).length + (projected.length ? 1 : 0);
    if (projected.length > 0 && usedChars + itemChars > maxChars) { stopReason = "char-budget"; break; }
    if (listed.length < members.length) memberLimitHit = true;
    projected.push(item);
    usedChars += itemChars;
    membersListed += listed.length;
    index += 1;
  }

  const membersNotReturned = findings.length - membersListed -
    families.slice(0, cursor).reduce((sum, family) => sum + family.members.length, 0);
  const reasons: PartialReason[] = [...(stopReason ? [stopReason] : []), ...(memberLimitHit ? ["member-limit" as const] : [])];
  const versions = identityVersions(findings, state);

  return {
    view: "families" as const,
    familyKey: FAMILY_KEY,
    evidenceSignatureKey: EVIDENCE_SIGNATURE_KEY,
    totalFindings: findings.length,
    totalFamilies: families.length,
    cursor,
    count: projected.length,
    families: projected,
    // `truncated` é o campo que a telemetria lê; `complete`/`partial` dizem o mesmo com o motivo.
    truncated: reasons.length > 0,
    complete: reasons.length === 0,
    ...(reasons.length
      ? {
          partial: {
            reasons,
            familiesNotReturned: families.length - index,
            membersNotReturned,
            ...(index < families.length ? { nextCursor: index } : {}),
          },
        }
      : {}),
    ...(index < families.length ? { nextCursor: index } : {}),
    ...(versions.length ? { identityVersions: versions } : {}),
    responseCharsEstimate: usedChars,
    familyHint: FAMILY_HINT,
  };
}

/** Membros de uma família, paginados — o cursor percorre todos os ids. */
export function buildFamilyMemberPage(findings: Finding[], familyId: string, options: MemberPageOptions = {}) {
  const state = options.stateFingerprint ?? null;
  const family = groupFamilies(findings, state).find((candidate) => candidate.familyId === familyId);
  if (!family) return undefined;
  const detail = options.detail ?? "summary";
  const members = family.members;
  const cursor = Math.min(options.cursor ?? 0, members.length);
  const limit = options.limit ?? DEFAULT_MEMBER_PAGE_LIMIT;
  const maxChars = options.maxChars ?? DEFAULT_FAMILY_MAX_CHARS;

  const projected: unknown[] = [];
  let usedChars = 0;
  let index = cursor;
  let stopReason: PartialReason | undefined;
  let budgetExceeded = false;

  while (index < members.length) {
    if (projected.length >= limit) { stopReason = "limit"; break; }
    if (projected.length > 0 && expired(options)) { stopReason = "time-limit"; break; }
    const item = projectMember(members[index], detail, options);
    const itemChars = JSON.stringify(item).length + (projected.length ? 1 : 0);
    if (projected.length > 0 && usedChars + itemChars > maxChars) { stopReason = "char-budget"; break; }
    if (projected.length === 0 && itemChars > maxChars) budgetExceeded = true;
    projected.push(item);
    usedChars += itemChars;
    index += 1;
  }

  return {
    view: "family-members" as const,
    familyId,
    detail,
    total: members.length,
    cursor,
    count: projected.length,
    members: projected,
    truncated: index < members.length,
    complete: index >= members.length,
    ...(index < members.length
      ? {
          nextCursor: index,
          partial: { reasons: [stopReason ?? "limit"], membersNotReturned: members.length - index, nextCursor: index },
        }
      : {}),
    gate: gateTally(members, options.verificationFor),
    responseCharsEstimate: usedChars,
    ...(budgetExceeded ? { budgetExceeded: true } : {}),
  };
}

/** Índice mínimo para a visão de findings: diz que existe agrupamento, sem mudar a página. */
export function familyIndex(findings: Finding[], stateFingerprint: string | null = null) {
  const families = groupFamilies(findings, stateFingerprint);
  const largest = families.reduce((max, family) => Math.max(max, family.members.length), 0);
  return {
    totalFamilies: families.length,
    largestFamily: largest,
    hint: "view=families agrupa instâncias idênticas (contagem, exemplo, ids); a lista de findings e as contagens não mudam.",
  };
}
