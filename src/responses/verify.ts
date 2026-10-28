/**
 * 3.0.0 (NAT-99): campos de leitura do verify_finding (§11). Derivados mecanicamente do objeto
 * `verification` (inalterado) e do payload; nenhum julgamento novo, nenhuma mudança na lógica do
 * portão. Um veredito sobre citação, aplicabilidade ou estado nunca põe `observation.status` em
 * `contradicted`: só contraevidência medida (predicado ou registro) o faz (parecer R7).
 */
import type { Finding } from "../schema/finding.js";
import type { GateVerification } from "../verify/gate.js";
import { UNGROUNDED_NEXT } from "../verify/gate.js";
import { groundingForCheckId } from "../verify/registries.js";
import { getRuleById } from "../data/knowledge.js";
import { CONTRACT, MESSAGES, PREDICATE_NOT_RUN, factNotEvaluated, step, type NextStep } from "./contract.js";

type About = "citation" | "applicability" | "evidence" | "fact" | "state" | "none";
type ObservationStatus = "verified" | "contradicted" | "not-contradicted" | "not-evaluated";

interface Reason {
  object: About;
  code: string;
  detail: string;
  status: ObservationStatus;
}

const ORACLE_SOURCES = new Set(["govbr-ds-token", "govbr-ds-structure", "govbr-ds-page"]);

/** Frases que dependem do perfil: o knowledge-free não nomeia fonte que não serve. */
function texts(knowledgeFree: boolean) {
  const refs = knowledgeFree ? "o critério WCAG que você justifica (source 'wcag')" : "o critério WCAG/e-MAG que você justifica (ex.: source 'wcag')";
  return {
    correct: `Cite um id devolvido por uma ferramenta nesta sessão que sustente o fato. Se nenhum sustentar, cite ${refs}, ou rule: null. Não ajuste o id até ele existir.`,
    keep: "Se não houver norma citável, mantenha o fato medido como observação com rule: null e o grau de certeza declarado.",
  };
}

function firstSentence(detail: string): string {
  const text = detail.trim();
  return text.length > 400 ? `${text.slice(0, 399)}…` : text;
}

/** Razões em ordem de decisão; a 1ª define `about` e `observation.status`. */
function reasonsOf(finding: Finding, v: GateVerification, knowledgeFree: boolean): { reasons: Reason[]; legacy?: { successors: string[] } } {
  const checks = v.checks ?? { ruleExists: "unknown", applicability: "unknown", evidenceConsistent: "unknown", violation: "not-checked" };
  const binding = v.binding ?? { live: false, elements: null };
  const detail = firstSentence(v.detail ?? "");
  const reasons: Reason[] = [];
  const source = finding.rule.source;
  let legacy: { successors: string[] } | undefined;

  if (checks.ruleExists === "fail") {
    const unknownSource = /Fonte de regra desconhecida/.test(v.detail ?? "");
    const wcagCross = !unknownSource && source !== "wcag" && Boolean(finding.rule.wcag) && /WCAG/i.test(v.detail ?? "");
    reasons.push({
      object: "citation",
      code: unknownSource ? "citation-source-unknown" : source === "wcag" || wcagCross ? "citation-wcag-invalid" : "citation-unknown-id",
      detail,
      status: "not-evaluated",
    });
  }
  if (!knowledgeFree && source === "govbr-ds-kb" && checks.ruleExists === "pass") {
    const rule = getRuleById(finding.rule.id);
    if (rule?.force === "example") {
      reasons.push({ object: "applicability", code: "applicability-example", detail, status: "not-evaluated" });
    } else if (rule?.legacy?.class === "dropped") {
      reasons.push({ object: "citation", code: "citation-legacy-dropped", detail, status: "not-contradicted" });
    } else if (rule?.legacy?.class === "superseded") {
      legacy = { successors: rule.legacy.supersededBy.filter((id) => Boolean(getRuleById(id))) };
      // §11: o id legado com sucessora segue a sucessora — o estado da observação vem das razões
      // seguintes (aplicabilidade/fato da sucessora), não de um "não avaliado" sobre a citação.
      reasons.push({ object: "citation", code: "citation-legacy-superseded", detail, status: "follows" as ObservationStatus });
    }
  }
  if (v.next === UNGROUNDED_NEXT) {
    reasons.push({ object: "citation", code: "citation-ungrounded-check", detail, status: "not-contradicted" });
  }
  if (checks.evidenceConsistent === "fail") {
    if (v.verifiedBy === "token-registry") {
      reasons.push({ object: "evidence", code: "evidence-registry-inconsistent", detail, status: "contradicted" });
    } else if (binding.live && binding.elements === 0) {
      // Localizador sem elemento no estado reproduzido: limitação de estado, não contraevidência (S-04).
      reasons.push({ object: "state", code: "locator-no-elements", detail, status: "not-evaluated" });
    } else if (binding.live && (binding.elements ?? 0) > 0) {
      reasons.push({ object: "evidence", code: "evidence-contradicted", detail, status: "contradicted" });
    } else {
      reasons.push({ object: "evidence", code: "evidence-inconsistent", detail, status: "not-evaluated" });
    }
  }
  // 3.3.0 (S-04, N-01, N-06): o que impediu a decisão sem contraevidência medida — sempre "não avaliado".
  switch (v.issue) {
    case "evidence-inconsistent":
      reasons.push({ object: "evidence", code: "evidence-inconsistent", detail, status: "not-evaluated" });
      break;
    case "evidence-incomplete":
      reasons.push({ object: "evidence", code: "evidence-incomplete", detail, status: "not-evaluated" });
      break;
    case "locator-no-elements":
      reasons.push({ object: "state", code: "locator-no-elements", detail, status: "not-evaluated" });
      break;
    case "locator-ambiguous":
      reasons.push({ object: "evidence", code: "locator-ambiguous", detail, status: "not-evaluated" });
      break;
    case "invalid-locator":
      reasons.push({ object: "evidence", code: "invalid-locator", detail, status: "not-evaluated" });
      break;
    case "page-http-error":
      reasons.push({ object: "state", code: "page-http-error", detail, status: "not-evaluated" });
      break;
    // 3.4.0 (B2): inaplicabilidade e sujeito errado não desmentem o fato — ficam sem decisão, com passo próprio.
    case "rule-not-applicable":
      reasons.push({ object: "applicability", code: "rule-not-applicable", detail, status: "not-contradicted" });
      break;
    case "subject-not-a-dialog":
      reasons.push({ object: "evidence", code: "subject-not-a-dialog", detail, status: "not-evaluated" });
      break;
    default:
      break;
  }
  const limitation = ((binding as { state?: unknown }).state as { limitation?: { kind: string } } | undefined)?.limitation;
  if (limitation) {
    reasons.push({
      object: "state",
      code: limitation.kind === "state-not-reproduced" ? "state-not-reproduced" : "state-not-reached",
      detail,
      status: "not-evaluated",
    });
  }
  switch (checks.violation) {
    case "contradicted":
      reasons.push({ object: "fact", code: "fact-contradicted", detail, status: "contradicted" });
      break;
    case "no-predicate":
      // S-05: sem predicado nada foi medido — "não avaliado", não "não desmentido".
      if (v.issue !== "evidence-incomplete") reasons.push({ object: "fact", code: "no-predicate", detail, status: "not-evaluated" });
      break;
    case "undetermined":
      if (!v.issue) reasons.push({ object: "fact", code: "undetermined", detail, status: "not-contradicted" });
      break;
    case "error":
      reasons.push({ object: "state", code: "page-error", detail, status: "not-evaluated" });
      break;
    case "not-checked":
      if (v.predicate && !binding.live && !reasons.some((r) => (r.status as string) !== "follows")) {
        reasons.push({ object: "none", code: "predicate-not-run", detail, status: "not-evaluated" });
      }
      break;
    default:
      break;
  }
  if (v.verdict === "unverifiable" && !reasons.some((r) => (r.status as string) !== "follows")) {
    reasons.push({ object: "fact", code: "undetermined", detail, status: "not-contradicted" });
  }
  return { reasons, legacy };
}

const FACT_NOT_MEASURED =
  "O oráculo não tem predicado que meça este fato: nada foi medido; o fato não foi avaliado nem desmentido.";

function observationMessage(status: ObservationStatus, about: About): string {
  if (status === "verified") return MESSAGES["fact-verified"];
  if (status === "contradicted") return MESSAGES["fact-contradicted"];
  if (status === "not-contradicted") return MESSAGES["fact-not-contradicted"];
  if (about === "none") return PREDICATE_NOT_RUN;
  if (about === "fact") return FACT_NOT_MEASURED;
  return factNotEvaluated(
    about === "applicability" ? "aplicabilidade" : about === "state" ? "reprodução do estado" : about === "evidence" ? "evidência" : "citação",
  );
}

function actionsOf(reasons: Reason[], finding: Finding, scanId: string | undefined, knowledgeFree: boolean, legacy?: { successors: string[] }): NextStep[] {
  const t = texts(knowledgeFree);
  const out: NextStep[] = [];
  const keep = ["element", "evidence", ...(scanId ? ["scanId"] : [])];
  const add = (s: NextStep) => {
    if (!out.some((o) => o.action === s.action && o.what === s.what)) out.push(s);
  };
  for (const r of reasons) {
    switch (r.code) {
      case "citation-unknown-id":
        add(step("correct-citation", t.correct, "verify_finding", undefined, { keep }));
        add(step("keep-uncertain", t.keep));
        break;
      case "citation-wcag-invalid":
      case "citation-source-unknown":
      case "applicability-example":
        add(step("correct-citation", t.correct, "verify_finding", undefined, { keep }));
        break;
      case "citation-legacy-dropped":
        add(step("correct-citation", `Id legado sem sucessora auditada: ${t.correct}`, "verify_finding", undefined, { keep }));
        break;
      case "citation-legacy-superseded":
        add(
          legacy?.successors.length
            ? step("correct-citation", "Cite a sucessora: leia as regras que substituem o id legado.", "get_ds_rules", { ids: legacy.successors })
            : step("correct-citation", t.correct, "verify_finding", undefined, { keep }),
        );
        break;
      case "citation-ungrounded-check":
        add(step("keep-uncertain", UNGROUNDED_NEXT));
        break;
      case "evidence-registry-inconsistent":
        add(step("measure-condition", "O valor alegado é de um token do DS: meça de novo e corrija evidence.data antes de reenviar.", "verify_finding", undefined, { keep: ["element", ...(scanId ? ["scanId"] : [])] }));
        break;
      case "evidence-inconsistent":
        add(step("fix-evidence-data", "Corrija os dados estruturados (evidence.data: property, valor observado e expectedCondition exata do predicado) e repita; o fato não foi avaliado.", "verify_finding", undefined, { keep: ["element", ...(scanId ? ["scanId"] : [])] }));
        break;
      case "evidence-incomplete":
        add(
          step(
            "request-detail",
            "Faltam campos de evidence.data: peça o achado com get_finding_details (detail 'evidence' ou 'full' traz evidence.data) e reenvie o payload completo.",
            "get_finding_details",
            { ids: [finding.id], detail: "full" },
          ),
        );
        break;
      case "locator-ambiguous":
      case "invalid-locator":
        add(step("fix-locator", r.code === "invalid-locator" ? "Use um seletor CSS válido (sem XPath nem text=) e repita." : "Restrinja element.locator ao elemento do defeito (o localizador resolveu elementos com valores diferentes) e repita.", "verify_finding", undefined, { keep: ["evidence", ...(scanId ? ["scanId"] : [])] }));
        break;
      case "rule-not-applicable":
        add(step("keep-uncertain", "A condição desta regra não vale no estado medido (o detail diz por quê): isto não desmente o fato. Cite a regra que se aplica a este caso, ou mantenha o fato medido com rule: null."));
        break;
      case "subject-not-a-dialog":
        add(step("fix-locator", "Use em element.locator o próprio diálogo (role=dialog/alertdialog, .br-modal, <dialog>), não o botão que o abre, e repita com as mesmas actions.", "verify_finding", undefined, { keep: ["evidence", ...(scanId ? ["scanId"] : [])] }));
        break;
      case "page-http-error":
        add(step("reproduce-state", "A página reaberta é uma página de erro HTTP: cite a URL da página validada (element.page) e repita."));
        break;
      case "evidence-contradicted":
        add(step("measure-condition", "O valor medido no elemento difere do alegado: meça de novo no estado certo antes de reenviar."));
        break;
      case "locator-no-elements":
        add(step("reproduce-state", "O localizador não encontrou elemento no estado reproduzido: cite o scanId do estado em que ele existe, ou envie as actions que o produzem."));
        break;
      case "predicate-not-run":
        add(step("measure-condition", "Repita com live:true no estado do achado (scanId), sem mudar o achado.", "verify_finding", { live: true, ...(scanId ? { scanId } : {}) }, { keep: ["finding"] }));
        break;
      case "no-predicate":
        add(step("keep-uncertain", t.keep));
        break;
      case "undetermined":
        add(step("measure-condition", "Os dados medidos não decidem: o detail diz o que faltou; meça e reenvie com os dados estruturados."));
        break;
      case "state-not-reached":
      case "state-not-reproduced":
        add(step("reproduce-state", "Corrija actions/arrival ou cite o scanId do estado alegado e repita."));
        break;
      case "page-error":
        add(step("reproduce-state", "Repita a verificação; a página falhou ao reabrir."));
        add(step("keep-uncertain", t.keep));
        break;
      default:
        break;
    }
  }
  return out.slice(0, 3);
}

function normResolutionOf(finding: Finding, knowledgeFree: boolean) {
  const { source, id } = finding.rule;
  if (knowledgeFree || !ORACLE_SOURCES.has(source)) return undefined;
  const grounded = groundingForCheckId(source, id);
  if (grounded === null) return undefined;
  const declared = finding.rule.implements;
  const payloadImplements =
    declared === undefined ? "absent" : declared.length === grounded.length && declared.every((r) => grounded.includes(r)) ? "equal" : "ignored";
  return {
    source: grounded.length ? "server-check-id" : "none",
    checkId: id,
    implements: grounded,
    payloadImplements,
    message: grounded.length ? MESSAGES["norm-resolved"] : UNGROUNDED_NEXT,
  };
}

export function verificationEnvelope(
  finding: Finding,
  verification: GateVerification,
  options: { verificationId: string; knowledgeFree: boolean; scanId?: string; absenceNote?: string },
) {
  const { reasons, legacy } = reasonsOf(finding, verification, options.knowledgeFree);
  const confirmed = verification.verdict === "confirmed";
  const about: About = confirmed ? "fact" : reasons[0]?.object ?? "none";
  // "follows" (id legado substituído): o estado é o da 1ª razão seguinte, ou "verified" se confirmou.
  const decided = reasons.find((r) => (r.status as string) !== "follows");
  const status: ObservationStatus = confirmed ? "verified" : decided?.status ?? "not-evaluated";
  const normResolution = normResolutionOf(finding, options.knowledgeFree);
  return {
    contract: CONTRACT,
    kind: "verification",
    findingId: finding.id,
    verificationId: options.verificationId,
    verdict: verification.verdict,
    about,
    observation: { status, message: observationMessage(status, about) },
    ...(normResolution ? { normResolution } : {}),
    reasons: confirmed ? [] : reasons.map(({ status: _s, ...r }) => r),
    actions: confirmed ? [] : actionsOf(reasons, finding, options.scanId, options.knowledgeFree, legacy),
    verification,
    ...(options.absenceNote ? { absenceNote: options.absenceNote } : {}),
  };
}
