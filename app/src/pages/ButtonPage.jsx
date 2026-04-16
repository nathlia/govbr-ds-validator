import "./overrides.css";

const CASE_STYLE = {
  margin: "1.5rem 0",
  borderLeft: "3px solid #dee2e6",
  paddingLeft: "1rem",
};

const ID_STYLE = {
  fontSize: "11px",
  color: "#767676",
  fontFamily: "monospace",
  display: "block",
  marginBottom: "0.5rem",
};

export default function ButtonPage() {
  return (
    <main style={{ padding: "2rem", fontFamily: "Rawline, Raleway, sans-serif" }}>
      <h1 style={{ marginBottom: "2rem" }}>Botões — Casos de Teste</h1>

      {/* TC-B-01 */}
      <section id="TC-B-01" data-testid="TC-B-01" style={CASE_STYLE}>
        <span aria-hidden="true" style={ID_STYLE}>TC-B-01</span>
        <button className="br-button primary" type="button">Entrar</button>
      </section>

      {/* TC-B-02 */}
      <section id="TC-B-02" data-testid="TC-B-02" style={CASE_STYLE}>
        <span aria-hidden="true" style={ID_STYLE}>TC-B-02</span>
        <button className="br-button circle" type="button">
          <i className="fas fa-search" aria-hidden="true"></i>
        </button>
      </section>

      {/* TC-B-03 */}
      <section id="TC-B-03" data-testid="TC-B-03" style={CASE_STYLE}>
        <span aria-hidden="true" style={ID_STYLE}>TC-B-03</span>
        <div className="br-button primary" style={{ display: "inline-block", cursor: "pointer" }}>
          Confirmar
        </div>
      </section>

      {/* TC-B-04 */}
      <section id="TC-B-04" data-testid="TC-B-04" style={CASE_STYLE}>
        <span aria-hidden="true" style={ID_STYLE}>TC-B-04</span>
        <button className="br-button primary v-token-a" type="button">Confirmar</button>
      </section>

      {/* TC-B-05 */}
      <section id="TC-B-05" data-testid="TC-B-05" style={CASE_STYLE}>
        <span aria-hidden="true" style={ID_STYLE}>TC-B-05</span>
        <button className="br-button primary v-font-a" type="button">Acessar sistema</button>
      </section>

      {/* TC-B-06 */}
      <section id="TC-B-06" data-testid="TC-B-06" style={CASE_STYLE}>
        <span aria-hidden="true" style={ID_STYLE}>TC-B-06</span>
        <button className="br-button danger" type="button">Excluir conta</button>
      </section>

      {/* TC-B-07 */}
      <section id="TC-B-07" data-testid="TC-B-07" style={CASE_STYLE}>
        <span aria-hidden="true" style={ID_STYLE}>TC-B-07</span>
        <button className="br-button primary" type="button" aria-label="Cancelar">Confirmar</button>
      </section>

      {/* TC-B-08 */}
      <section id="TC-B-08" data-testid="TC-B-08" style={CASE_STYLE}>
        <span aria-hidden="true" style={ID_STYLE}>TC-B-08</span>
        <button className="br-button secondary v-radius-a" type="button">Cancelar</button>
      </section>

      {/* TC-B-09 */}
      <section id="TC-B-09" data-testid="TC-B-09" style={CASE_STYLE}>
        <span aria-hidden="true" style={ID_STYLE}>TC-B-09</span>
        <button className="br-button circle" type="button" aria-label="Pesquisar">
          <i className="fas fa-search" aria-hidden="true"></i>
        </button>
      </section>

      {/* TC-B-10 */}
      <section id="TC-B-10" data-testid="TC-B-10" style={CASE_STYLE}>
        <span aria-hidden="true" style={ID_STYLE}>TC-B-10</span>
        <button className="br-button primary v-focus-a" type="button">Salvar alterações</button>
      </section>

      {/* TC-B-11 — role="button" sem tabindex: tem role interativo mas não é focável por teclado */}
      <section id="TC-B-11" data-testid="TC-B-11" style={CASE_STYLE}>
        <span aria-hidden="true" style={ID_STYLE}>TC-B-11</span>
        <span className="br-button primary" role="button">Confirmar</span>
      </section>

      {/* TC-B-12 — <a href="#"> usado como botão de ação (não-navegação) */}
      <section id="TC-B-12" data-testid="TC-B-12" style={CASE_STYLE}>
        <span aria-hidden="true" style={ID_STYLE}>TC-B-12</span>
        <a href="#" className="br-button primary">Excluir arquivo</a>
      </section>

      {/* TC-B-13 — referência: navegação com secondary antes de primary (ordem correta) */}
      <section id="TC-B-13" data-testid="TC-B-13" style={CASE_STYLE}>
        <span aria-hidden="true" style={ID_STYLE}>TC-B-13</span>
        <div style={{ display: "flex", gap: "1rem" }}>
          <button className="br-button secondary" type="button">Voltar</button>
          <button className="br-button primary" type="button">Próxima etapa</button>
        </div>
      </section>
    </main>
  );
}
