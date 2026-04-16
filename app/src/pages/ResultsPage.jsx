import { useState, useEffect, useCallback } from "react";
import groundTruth from "../data/ground-truth.json";

const CATEGORY_LABELS = {
  structural:    { label: "Estrutural",    color: "#6c757d", title: "Detectável por ferramentas estáticas" },
  token:         { label: "Token DS",      color: "#0d6efd", title: "Requer conhecimento dos tokens do DS" },
  "ds-pattern":  { label: "Padrão DS",     color: "#6610f2", title: "Requer conhecimento das convenções do DS" },
  "emag-specific": { label: "e-MAG",       color: "#198754", title: "Norma brasileira — ausente em ferramentas genéricas" },
  compositional: { label: "Composicional", color: "#fd7e14", title: "Requer raciocínio entre múltiplos elementos" },
};

function Badge({ category }) {
  const meta = CATEGORY_LABELS[category];
  if (!meta) return null;
  return (
    <span title={meta.title} style={{
      display: "inline-block",
      background: meta.color + "22",
      color: meta.color,
      border: `1px solid ${meta.color}55`,
      borderRadius: "4px",
      fontSize: "10px",
      fontWeight: 600,
      padding: "1px 5px",
      marginRight: "3px",
      whiteSpace: "nowrap",
    }}>
      {meta.label}
    </span>
  );
}

function DetectionCell({ value }) {
  if (value === null) return <td style={{ textAlign: "center", color: "#aaa" }}>—</td>;
  if (value === true)  return <td style={{ textAlign: "center", background: "#d1e7dd", color: "#146c43", fontWeight: 700 }}>✓</td>;
  if (value === false) return <td style={{ textAlign: "center", background: "#f8d7da", color: "#842029", fontWeight: 700 }}>✗</td>;
  return <td style={{ textAlign: "center" }}>{value}</td>;
}

function ActualCell({ value, isReference }) {
  if (isReference) return <td style={{ textAlign: "center", color: "#aaa" }}>—</td>;
  if (value === true)  return <td style={{ textAlign: "center", background: "#d1e7dd", color: "#146c43", fontWeight: 700 }}>✓</td>;
  if (value === false) return <td style={{ textAlign: "center", background: "#f8d7da", color: "#842029", fontWeight: 700 }}>✗</td>;
  return <td style={{ textAlign: "center", color: "#aaa", fontSize: "11px" }} title="Clique em 'Executar' para atualizar">—</td>;
}

function computeMetrics(cases, toolKey, actualMap) {
  let TP = 0, FP = 0, FN = 0, TN = 0;
  const rows = [];

  for (const [id, c] of Object.entries(cases)) {
    if (c.detection[toolKey] === null) continue; // reference case
    const hasViolation = c.violations.length > 0;
    const actual = actualMap?.[id];
    if (actual === undefined) { rows.push({ id, outcome: "?" }); continue; }

    let outcome;
    if (hasViolation && actual)    { TP++; outcome = "TP"; }
    else if (!hasViolation && actual) { FP++; outcome = "FP"; }
    else if (hasViolation && !actual) { FN++; outcome = "FN"; }
    else                              { TN++; outcome = "TN"; }
    rows.push({ id, outcome });
  }

  const precision = TP + FP === 0 ? null : TP / (TP + FP);
  const recall    = TP + FN === 0 ? null : TP / (TP + FN);
  const f1 = precision != null && recall != null && (precision + recall) > 0
    ? 2 * precision * recall / (precision + recall) : null;
  return { TP, FP, FN, TN, precision, recall, f1, rows };
}

function pct(v) {
  return v == null ? "—" : (v * 100).toFixed(1) + "%";
}

const OUTCOME_STYLE = {
  TP: { color: "#146c43", fontWeight: 700 },
  TN: { color: "#6c757d" },
  FP: { color: "#842029", fontWeight: 700 },
  FN: { color: "#842029", fontWeight: 700 },
};
const OUTCOME_LABEL = { TP: "✓ TP", TN: "· TN", FP: "! FP", FN: "✗ FN" };

function OutcomeCell({ outcome, isRef }) {
  if (isRef) return <td style={{ ...TD, textAlign: "center", color: "#aaa" }}>ref</td>;
  if (!outcome || outcome === "?") return <td style={{ ...TD, textAlign: "center", color: "#aaa" }}>—</td>;
  return <td style={{ ...TD, textAlign: "center", ...OUTCOME_STYLE[outcome] }}>{OUTCOME_LABEL[outcome]}</td>;
}

function CaseRows({ cases, tools, eslintExpected }) {
  const axeRows    = tools[0].actual ? computeMetrics(cases, "axe",         tools[0].actual).rows : [];
  const eslintRows = computeMetrics(cases, "eslint_a11y", eslintExpected).rows;
  const agentRows  = tools[2].actual ? computeMetrics(cases, "agent",       tools[2].actual).rows : [];

  return Object.entries(cases).map(([id, c]) => {
    const isRef   = c.violations.length === 0;
    const axeO    = axeRows.find(r => r.id === id)?.outcome    ?? null;
    const eslintO = eslintRows.find(r => r.id === id)?.outcome ?? null;
    const agentO  = agentRows.find(r => r.id === id)?.outcome  ?? null;
    return (
      <tr key={id} style={{ borderBottom: "1px solid #dee2e6", background: isRef ? "#f8f9fa" : "#fff" }}>
        <td style={{ ...TD, fontFamily: "monospace", fontWeight: 600 }}>{id}</td>
        <OutcomeCell outcome={axeO}    isRef={isRef} />
        <OutcomeCell outcome={eslintO} isRef={isRef} />
        <OutcomeCell outcome={agentO}  isRef={isRef} />
        <td style={{ ...TD, color: isRef ? "#888" : "#212529", fontStyle: isRef ? "italic" : "normal" }}>
          {isRef ? "Referência correta" : c.description}
        </td>
      </tr>
    );
  });
}

function MetricsSection({ cases, axeActual, agentActual, agentRaw, axeRaw }) {
  const hasAxe   = Object.keys(axeActual).length > 0;
  const hasAgent = Object.keys(agentActual).length > 0;

  // eslint uses ground-truth expected values (no runtime runner)
  const eslintExpected = {};
  for (const [id, c] of Object.entries(cases)) {
    if (c.detection.eslint_a11y !== null) eslintExpected[id] = c.detection.eslint_a11y;
  }

  const tools = [
    { key: "axe",         label: "axe-core",    actual: hasAxe   ? axeActual       : null, source: axeRaw   ? new Date(axeRaw.timestamp).toLocaleString("pt-BR")  : null },
    { key: "eslint_a11y", label: "eslint-a11y", actual: eslintExpected,                    source: "valores esperados (sem executor em tempo real)" },
    { key: "agent",       label: "Agente",       actual: hasAgent ? agentActual     : null, source: agentRaw ? `${new Date(agentRaw.timestamp).toLocaleString("pt-BR")} — ${agentRaw.model}` : null },
  ];

  const violationCases = Object.values(cases).filter(c => c.violations.length > 0);
  const agentOnlyIds   = Object.entries(cases)
    .filter(([, c]) => c.violations.length > 0 && c.detection.axe === false && c.detection.eslint_a11y === false && c.detection.agent === true)
    .map(([id]) => id);

  return (
    <section style={{ marginTop: "1rem", marginBottom: "3rem" }}>
      <h2 style={{ borderBottom: "2px solid #1351b4", paddingBottom: "0.5rem", marginBottom: "1.5rem" }}>
        Métricas de Detecção
      </h2>

      {/* Metrics table */}
      <div style={{ overflowX: "auto", marginBottom: "1.5rem" }}>
        <table style={{ borderCollapse: "collapse", fontSize: "13px", minWidth: "600px" }}>
          <thead>
            <tr style={{ background: "#f8f9fa" }}>
              {["Ferramenta", "TP", "FP", "FN", "TN", "Precisão", "Recall", "F1", "Fonte"].map(h => (
                <th key={h} style={{ ...TH, textAlign: h === "Ferramenta" || h === "Fonte" ? "left" : "center" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tools.map(({ key, label, actual, source }) => {
              const m = computeMetrics(cases, key, actual);
              const notRun = actual === null;
              return (
                <tr key={key} style={{ borderBottom: "1px solid #dee2e6" }}>
                  <td style={{ ...TD, fontWeight: 600 }}>{label}</td>
                  {["TP","FP","FN","TN"].map(k => (
                    <td key={k} style={{ ...TD, textAlign: "center", color: notRun ? "#aaa" : "#212529" }}>
                      {notRun ? "—" : m[k]}
                    </td>
                  ))}
                  <td style={{ ...TD, textAlign: "center", fontWeight: notRun ? 400 : 700, color: notRun ? "#aaa" : m.precision === 1 ? "#146c43" : "#842029" }}>
                    {notRun ? "—" : pct(m.precision)}
                  </td>
                  <td style={{ ...TD, textAlign: "center", fontWeight: notRun ? 400 : 700, color: notRun ? "#aaa" : m.recall === 1 ? "#146c43" : "#fd7e14" }}>
                    {notRun ? "—" : pct(m.recall)}
                  </td>
                  <td style={{ ...TD, textAlign: "center", fontWeight: notRun ? 400 : 700, color: notRun ? "#aaa" : "#1351b4" }}>
                    {notRun ? "—" : pct(m.f1)}
                  </td>
                  <td style={{ ...TD, color: "#767676", fontSize: "11px" }}>
                    {notRun ? <em>não executado</em> : source}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Agent-only callout */}
      <div style={{ background: "#e8f4fd", border: "1px solid #bee3f8", borderRadius: "6px", padding: "1rem 1.25rem", maxWidth: "680px", marginBottom: "1.5rem" }}>
        <strong>Violações detectadas apenas pelo agente ({agentOnlyIds.length} / {violationCases.length}):</strong>
        <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
          {agentOnlyIds.map(id => (
            <code key={id} style={{ background: "#fff", border: "1px solid #bee3f8", borderRadius: "3px", padding: "1px 6px", fontSize: "12px" }}>{id}</code>
          ))}
        </div>
      </div>

      {/* Per-case outcome grid */}
      <h3 style={{ fontSize: "14px", marginBottom: "0.75rem", color: "#555" }}>Resultado por caso</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ background: "#f8f9fa" }}>
              <th style={{ ...TH, width: "90px" }}>Caso</th>
              <th style={{ ...TH, textAlign: "center", width: "70px" }}>axe-core</th>
              <th style={{ ...TH, textAlign: "center", width: "70px" }}>eslint</th>
              <th style={{ ...TH, textAlign: "center", width: "70px" }}>Agente</th>
              <th style={TH}>Descrição</th>
            </tr>
          </thead>
          <tbody>
            <CaseRows cases={cases} tools={tools} eslintExpected={eslintExpected} />
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: "11px", color: "#888", marginTop: "0.5rem" }}>
        TP = verdadeiro positivo &nbsp;·&nbsp; TN = verdadeiro negativo &nbsp;·&nbsp; FP = falso positivo &nbsp;·&nbsp; FN = falso negativo
      </p>
    </section>
  );
}

function buildAxeActual(raw, cases) {
  const axeActual = {};
  if (!raw?.results) return axeActual;
  for (const [id, c] of Object.entries(cases)) {
    if (raw.results[c.page]) axeActual[id] = false;
  }
  for (const pageData of Object.values(raw.results)) {
    for (const [caseId, viols] of Object.entries(pageData.byCaseId || {})) {
      if (viols.length > 0) axeActual[caseId] = true;
    }
  }
  return axeActual;
}

function buildAgentActual(raw) {
  if (!raw?.verdicts) return {};
  const map = {};
  for (const [id, v] of Object.entries(raw.verdicts)) {
    map[id] = v.detected === true;
  }
  return map;
}

export default function ResultsPage({ navigateTo }) {
  const cases = groundTruth.cases;

  const [axeRaw,      setAxeRaw]      = useState(null);
  const [axeRunning,  setAxeRunning]  = useState(false);
  const [axeError,    setAxeError]    = useState(null);

  const [agentRaw,    setAgentRaw]    = useState(null);
  const [agentTs,     setAgentTs]     = useState(null);

  const fetchAxeResults = useCallback(() => {
    fetch("/axe-results.json?t=" + Date.now())
      .then((r) => r.json())
      .then((data) => { if (data.results) setAxeRaw(data); })
      .catch(() => {});
  }, []);

  const fetchAgentResults = useCallback(() => {
    fetch("/agent-results.json?t=" + Date.now())
      .then((r) => r.json())
      .then((data) => {
        if (data.verdicts) {
          setAgentRaw(data);
          setAgentTs(data.timestamp);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchAxeResults();
    fetchAgentResults();
  }, [fetchAxeResults, fetchAgentResults]);

  const runAxe = async () => {
    setAxeRunning(true);
    setAxeError(null);
    try {
      const res  = await fetch("/api/run-axe", { method: "POST" });
      const data = await res.json();
      if (data.ok) fetchAxeResults();
      else setAxeError(data.error ?? "Unknown error");
    } catch (e) {
      setAxeError(e.message);
    } finally {
      setAxeRunning(false);
    }
  };

  const axeActual   = buildAxeActual(axeRaw, cases);
  const agentActual = buildAgentActual(agentRaw);

  const buttonCases = Object.entries(cases).filter(([, c]) => c.page === "buttons");
  const formCases   = Object.entries(cases).filter(([, c]) => c.page === "forms");

  const violationCases    = Object.values(cases).filter((c) => c.violations.length > 0);
  const agentOnlyExpected = violationCases.filter((c) =>
    c.detection.axe === false && c.detection.eslint_a11y === false && c.detection.agent === true
  ).length;

  // Compute actual agent score when results are loaded
  const agentTP = violationCases.filter((c) => {
    const id = Object.entries(cases).find(([, v]) => v === c)?.[0];
    return id && agentActual[id] === true;
  }).length;

  return (
    <main style={{ padding: "2rem", fontFamily: "Rawline, Raleway, sans-serif" }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "2rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <h1 style={{ margin: 0 }}>Matriz de Detecção</h1>

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-start" }}>
          {/* axe runner */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
            <button
              onClick={runAxe}
              disabled={axeRunning}
              style={{
                background: axeRunning ? "#6c757d" : "#1351b4",
                color: "#fff", border: "none", borderRadius: "4px",
                padding: "0.5rem 1.25rem",
                fontFamily: "Rawline, Raleway, sans-serif",
                fontSize: "14px", fontWeight: 600,
                cursor: axeRunning ? "wait" : "pointer", whiteSpace: "nowrap",
              }}
            >
              {axeRunning ? "Executando axe…" : "▶ Executar axe-core"}
            </button>
            {axeRaw?.timestamp && (
              <span style={{ fontSize: "11px", color: "#767676" }}>
                axe: {new Date(axeRaw.timestamp).toLocaleTimeString("pt-BR")}
              </span>
            )}
            {axeError && <span style={{ fontSize: "11px", color: "#e52207" }}>Erro: {axeError}</span>}
          </div>

          {/* agent run hint */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
            <div style={{
              background: agentRaw ? "#198754" : "#6c757d",
              color: "#fff", borderRadius: "4px",
              padding: "0.5rem 1.25rem",
              fontFamily: "Rawline, Raleway, sans-serif",
              fontSize: "14px", fontWeight: 600, whiteSpace: "nowrap",
            }}>
              {agentRaw ? "✓ Agente executado" : "⚠ Agente não executado"}
            </div>
            {agentTs ? (
              <span style={{ fontSize: "11px", color: "#767676" }}>
                agente: {new Date(agentTs).toLocaleTimeString("pt-BR")} — {agentRaw?.model}
              </span>
            ) : (
              <span style={{ fontSize: "11px", color: "#767676" }}>
                Execute <code>/evaluate-all</code> no Claude Code
              </span>
            )}
          </div>
        </div>
      </div>

      <p style={{ color: "#555", marginBottom: "2rem", maxWidth: "720px" }}>
        Cada linha é um caso de teste. As colunas indicam se a ferramenta <strong>detecta</strong> (✓)
        ou <strong>não detecta</strong> (✗) a violação. Casos referência não têm violação (—).
        <br />
        <em>axe real</em> e <em>Agente real</em> mostram resultados medidos empiricamente.
      </p>

      {/* Summary callout */}
      <div style={{
        background: "#fff3cd", border: "1px solid #ffc107",
        borderRadius: "6px", padding: "1rem 1.25rem",
        marginBottom: "1.5rem", maxWidth: "680px",
      }}>
        <strong>Resultado esperado:</strong>{" "}
        {agentOnlyExpected} de {violationCases.length} violações detectadas apenas pelo agente —
        invisíveis para axe-core e eslint-a11y.
        {agentRaw && (
          <span style={{ marginLeft: "1rem", color: "#146c43" }}>
            <strong>Real:</strong> agente detectou {agentTP} / {violationCases.length} violações.
          </span>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        {Object.entries(CATEGORY_LABELS).map(([key]) => (
          <Badge key={key} category={key} />
        ))}
        <span style={{ fontSize: "11px", color: "#888", alignSelf: "center" }}>
          — passe sobre o badge para ver a descrição
        </span>
      </div>

      {/* Tables */}
      {[
        { title: "Botões", data: buttonCases },
        { title: "Formulários", data: formCases },
      ].map(({ title, data }) => (
        <section key={title} style={{ marginBottom: "3rem" }}>
          <h2 style={{ marginBottom: "1rem", borderBottom: "2px solid #1351b4", paddingBottom: "0.5rem" }}>
            {title}
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f8f9fa" }}>
                  <th style={TH}>Caso</th>
                  <th style={TH}>Violação</th>
                  <th style={TH}>Categoria</th>
                  <th style={{ ...TH, width: "70px", textAlign: "center" }}>axe</th>
                  <th style={{ ...TH, width: "70px", textAlign: "center" }}>eslint</th>
                  <th style={{ ...TH, width: "70px", textAlign: "center" }}>Agente</th>
                  <th style={{ ...TH, width: "80px", textAlign: "center", borderLeft: "2px solid #dee2e6" }}>axe real *</th>
                  <th style={{ ...TH, width: "90px", textAlign: "center" }}>Agente real *</th>
                </tr>
              </thead>
              <tbody>
                {data.map(([id, c]) => {
                  const isReference = c.violations.length === 0;
                  const isAgentOnly = !isReference &&
                    c.detection.axe === false &&
                    c.detection.eslint_a11y === false &&
                    c.detection.agent === true;

                  return (
                    <tr key={id} style={{
                      background: isReference ? "#f8f9fa" : isAgentOnly ? "#fff8e1" : "#fff",
                      borderBottom: "1px solid #dee2e6",
                    }}>
                      <td style={{ ...TD, fontFamily: "monospace", fontWeight: 600, whiteSpace: "nowrap" }}>
                        <button
                          onClick={() => navigateTo?.(id)}
                          title="Ver caso de teste"
                          style={{
                            background: "none", border: "none", padding: 0,
                            fontFamily: "monospace", fontWeight: 600, fontSize: "inherit",
                            color: isReference ? "#888" : "#1351b4",
                            cursor: "pointer", textDecoration: "underline dotted",
                          }}
                        >
                          {id}
                        </button>
                        {isAgentOnly && (
                          <span title="Apenas o agente detecta esta violação" style={{
                            marginLeft: "6px", fontSize: "10px",
                            background: "#fd7e14", color: "#fff",
                            borderRadius: "3px", padding: "1px 4px",
                          }}>
                            só agente
                          </span>
                        )}
                      </td>
                      <td style={{ ...TD, color: isReference ? "#888" : "#212529", fontStyle: isReference ? "italic" : "normal" }}>
                        {isReference
                          ? "Referência correta"
                          : c.violations[0]?.split(" — ")[0] ?? c.description}
                      </td>
                      <td style={TD}>
                        {c.categories.map((cat) => <Badge key={cat} category={cat} />)}
                      </td>
                      <DetectionCell value={c.detection.axe} />
                      <DetectionCell value={c.detection.eslint_a11y} />
                      <DetectionCell value={c.detection.agent} />

                      {/* axe real */}
                      <td style={{ textAlign: "center", borderLeft: "2px solid #dee2e6" }}>
                        {isReference
                          ? <span style={{ color: "#aaa" }}>—</span>
                          : axeActual[id] === true  ? <span style={{ color: "#146c43", fontWeight: 700 }}>✓</span>
                          : axeActual[id] === false ? <span style={{ color: "#842029", fontWeight: 700 }}>✗</span>
                          : <span style={{ color: "#aaa", fontSize: "11px" }}>—</span>}
                      </td>

                      {/* agent real */}
                      <ActualCell value={agentActual[id]} isReference={isReference} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: "11px", color: "#888", marginTop: "0.5rem" }}>
            * Colunas <em>real</em>: resultados medidos empiricamente. axe → clique em ▶ Executar axe-core.
            Agente → execute <code>/evaluate-all</code> no Claude Code.
          </p>
        </section>
      ))}

      <MetricsSection
        cases={cases}
        axeActual={axeActual}
        agentActual={agentActual}
        agentRaw={agentRaw}
        axeRaw={axeRaw}
      />
    </main>
  );
}

const TH = {
  padding: "8px 12px",
  textAlign: "left",
  fontWeight: 600,
  borderBottom: "2px solid #dee2e6",
  whiteSpace: "nowrap",
};

const TD = {
  padding: "8px 12px",
  verticalAlign: "top",
};
