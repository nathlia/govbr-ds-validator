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
import { findingIdentity, implementsBeyondCitation, projectFinding, type FindingDetail } from "./findings.js";
import { interactionOf } from "../checkers/interaction.js";
import { CROSS_ROUTE } from "../scan/session.js";

export const FAMILY_KEY =
  "rule.source + rule.id + rule.checker + rule.implements + rule.wcag + nature + mode + pathway + severity + " +
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

/** 3.6.5 (item 4): uma família com a mesma assinatura de evidência vista em outra rota/estado desta sessão. */
export interface AlsoIn {
  route: string;
  scanId: string;
  familyId: string;
  /** 3.7.2 (revisão MÉDIA 4): outra rota pela rota inteira (session.alsoIn); chave símbolo, fora do JSON. */
  [CROSS_ROUTE]?: boolean;
}

/**
 * 3.6.5 (D-155): o que a família mostra além da chave. Todos opcionais e decididos por quem chama (o servidor os
 * liga nos perfis com normas): sem eles, a família é a de sempre.
 */
export interface FamilyExtras {
  /** Item 2: a força da(s) unidade(s) citada(s), como vem da base (undefined = a base não tem). */
  forceOf?: (rule: Finding["rule"]) => string | undefined;
  /** Item 1: o passo mínimo de interação das famílias `mode:"interaction"`. */
  interaction?: boolean;
  /** Item 1 (revisão): as ações da receita do estado do lote (o Tab a partir do carregamento só vale sem ações). */
  recipeActions?: readonly unknown[];
  /** Item 4: a mesma assinatura em outra rota/estado da sessão. */
  alsoInFor?: (signature: string, familyId: string, memberLocators: string[]) => { items: AlsoIn[]; more: number };
  /**
   * 3.7.2: referências secundárias da norma — as cláusulas obrigatórias do DS/e-MAG do mesmo assunto de uma regra só
   * best-practice do axe (checkers/axe.ts, bestPracticeReferences). undefined = nenhuma.
   */
  referencesOf?: (finding: Finding) => Array<{ id: string; force?: string }> | undefined;
}

export interface FamilyPageOptions extends FamilyOptions, FamilyExtras {
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
      checker: finding.rule.checker ?? null,
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

/** 3.6.5 (item 4): a nota única da página quando alguma família tem alsoIn. */
export const ALSO_IN_NOTE =
  "alsoIn = a mesma evidência numa outra rota/estado desta sessão: é outro fato, com cartão próprio por rota/estado e o scanId do seu " +
  "(verify_finding recusa juntar rotas: mixed-states). Não o descarte como já relatado.";

/** 3.6.5 (item 1): a nota única da página quando alguma família precisa de passo de interação. */
export const INTERACTION_FAMILY_NOTE =
  "interaction.steps: o fato só existe depois destes passos (com o localizador de cada membro); no cartão, em state.steps depois da receita do estado. needed:\"unknown\" = o oráculo não sabe o passo: descreva o seu.";

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
  let trimmedForBudget = false;
  let familiesAlsoIn = 0;

  while (index < families.length) {
    if (projected.length >= limit) { stopReason = "limit"; break; }
    if (projected.length > 0 && expired(options)) { stopReason = "time-limit"; break; }
    const { familyId, members } = families[index];
    const first = members[0];
    // 3.6.5 (D-155, itens 1, 2 e 4): força da norma, passo de interação e a mesma evidência em outra rota/estado.
    const force = options.forceOf?.(first.rule);
    const interaction = options.interaction ? interactionOf(first, options.recipeActions) : undefined;
    const signature = evidenceSignature(first);
    const also = options.alsoInFor?.(signature, familyId, members.map((m) => m.element.locator));
    const references = options.referencesOf?.(first);
    if (also?.items.length) familiesAlsoIn += 1;
    const makeItem = (listedCount: number) => {
    const listed = members.slice(0, listedCount).map((member) => member.id);
    return {
      familyId,
      count: members.length,
      rule: {
        source: first.rule.source,
        id: first.rule.id,
        ...(first.rule.checker ? { checker: first.rule.checker } : {}),
        ...(implementsBeyondCitation(first.rule) ? { implements: [...first.rule.implements!] } : {}),
        ...(force !== undefined ? { force } : {}),
        // 3.7.2: a norma obrigatória do mesmo assunto (regra só best-practice do axe), como referência secundária.
        ...(references?.length ? { references } : {}),
      },
      property: propertyOf(first),
      nature: first.nature,
      mode: first.mode,
      severity: first.severity,
      // 3.4.4 (C1): o estado é um só por página — sai uma vez no topo (stateFingerprint), não por família.
      evidenceSignature: signature,
      // O texto do passo fica na nota única da página (interactionNote) e no achado/verify; aqui, só o estruturado. Sem
      // passo (o fato está no DOM do estado), nada: a família não cresce — o verify_finding o diz (interaction.needed:false).
      ...(interaction && interaction.needed !== false ? { interaction: { needed: interaction.needed, steps: interaction.steps } } : {}),
      ...(also?.items.length ? { alsoIn: also.items, ...(also.more ? { alsoInMore: also.more } : {}) } : {}),
      value: valueOf(first),
      // 3.3.0 (N-05): o exemplo não repete o que a família já diz (página, severidade, natureza, modo, via).
      example: slimExample(projectFinding(first, "summary") as Record<string, unknown>, valueOf(first)),
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
    };
    let item = makeItem(Math.min(memberLimit, members.length));
    let itemChars = JSON.stringify(item).length + (projected.length ? 1 : 0);
    if (projected.length > 0 && usedChars + itemChars > maxChars) { stopReason = "char-budget"; break; }
    // 3.3.0 (N-02): a 1ª família da página nunca é descartada por não caber — os ids dela é que são
    // cortados (com nextMemberCursor), e as contagens refletem o que veio.
    const untrimmed = item.membersReturned;
    for (let n = item.membersReturned; projected.length === 0 && itemChars > maxChars && n > 1; ) {
      n = Math.max(1, Math.floor(n / 2));
      item = makeItem(n);
      itemChars = JSON.stringify(item).length;
    }
    if (item.membersReturned < untrimmed) trimmedForBudget = true;
    const listed = item.memberIds;
    if (listed.length < members.length && listed.length === Math.min(memberLimit, members.length)) memberLimitHit = true;
    projected.push(item);
    usedChars += itemChars;
    membersListed += listed.length;
    index += 1;
  }

  const membersNotReturned = findings.length - membersListed -
    families.slice(0, cursor).reduce((sum, family) => sum + family.members.length, 0);
  const reasons: PartialReason[] = [
    ...(stopReason ? [stopReason] : trimmedForBudget ? ["char-budget" as const] : []),
    ...(memberLimitHit ? ["member-limit" as const] : []),
  ];
  const versions = identityVersions(findings, state);

  return {
    view: "families" as const,
    familyKey: FAMILY_KEY,
    evidenceSignatureKey: EVIDENCE_SIGNATURE_KEY,
    stateFingerprint: state,
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
    ...(familiesAlsoIn ? { alsoInNote: ALSO_IN_NOTE } : {}),
    ...(projected.some((f) => (f as { interaction?: unknown }).interaction) ? { interactionNote: INTERACTION_FAMILY_NOTE } : {}),
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

function slimExample(example: Record<string, unknown>, value?: string) {
  const { page: _page, ...element } = (example.element ?? {}) as Record<string, unknown>;
  // 3.4.4 (C1): a norma do exemplo é a da família (está na chave) — não se repete.
  const { severity: _s, nature: _n, mode: _m, pathway: _p, rule: _r, interaction: _i, ...rest } = example;
  // 3.4.0 (B6): `observed` igual ao `value` da família não se repete no exemplo.
  if (value !== undefined && rest.observed === value) delete rest.observed;
  return { ...rest, element };
}
