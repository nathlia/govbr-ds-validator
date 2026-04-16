const CASE_STYLE = {
  marginBottom: "3rem",
  borderLeft: "3px solid #dee2e6",
  paddingLeft: "1rem",
};

const ID_STYLE = {
  fontSize: "11px",
  color: "#767676",
  fontFamily: "monospace",
  display: "block",
  marginBottom: "0.75rem",
};

export default function FormPage() {
  return (
    <main style={{ padding: "2rem", fontFamily: "Rawline, Raleway, sans-serif", maxWidth: "720px" }}>
      <h1 style={{ marginBottom: "2rem" }}>Formulários — Casos de Teste</h1>

      {/* TC-F-01 — reference: all rules satisfied */}
      <section id="TC-F-01" data-testid="TC-F-01" style={CASE_STYLE}>
        <span style={ID_STYLE}>TC-F-01</span>
        <form noValidate>
          <div className="br-input" style={{ marginBottom: "1rem" }}>
            <label htmlFor="f01-name">Nome completo</label>
            <input id="f01-name" className="br-input" type="text"
              placeholder="Digite seu nome" aria-required="true" required />
          </div>
          <div className="br-input" style={{ marginBottom: "1rem" }}>
            <label htmlFor="f01-cpf">CPF</label>
            <small id="f01-cpf-hint" style={{ display: "block", color: "#555" }}>
              Formato: 000.000.000-00
            </small>
            <input id="f01-cpf" className="br-input" type="text"
              placeholder="000.000.000-00" aria-required="true"
              aria-describedby="f01-cpf-hint" required />
          </div>
          <div style={{ display: "flex", gap: "1rem" }}>
            <button className="br-button secondary" type="button">Cancelar</button>
            <button className="br-button primary" type="submit">Confirmar cadastro</button>
          </div>
        </form>
      </section>

      {/* TC-F-02 — label for/id mismatch */}
      <section id="TC-F-02" data-testid="TC-F-02" style={CASE_STYLE}>
        <span style={ID_STYLE}>TC-F-02</span>
        <form noValidate>
          <div className="br-input" style={{ marginBottom: "1rem" }}>
            <label htmlFor="usuario">Nome de usuário</label>
            <input id="username" className="br-input" type="text"
              aria-required="true" required />
          </div>
          <button className="br-button primary" type="submit">Entrar</button>
        </form>
      </section>

      {/* TC-F-03 — input without label, placeholder only */}
      <section id="TC-F-03" data-testid="TC-F-03" style={CASE_STYLE}>
        <span style={ID_STYLE}>TC-F-03</span>
        <form noValidate>
          <div style={{ marginBottom: "1rem" }}>
            <input id="f03-email" className="br-input" type="email"
              placeholder="E-mail" aria-required="true" />
          </div>
          <button className="br-button primary" type="submit">Enviar</button>
        </form>
      </section>

      {/* TC-F-04 — visual required indicator (*) but no aria-required */}
      {/* Label says "Nome *" — screen reader reads the * but field is not programmatically required */}
      <section id="TC-F-04" data-testid="TC-F-04" style={CASE_STYLE}>
        <span style={ID_STYLE}>TC-F-04</span>
        <form noValidate>
          <div className="br-input" style={{ marginBottom: "1rem" }}>
            <label htmlFor="f04-name">Nome *</label>
            <input id="f04-name" className="br-input" type="text" />
          </div>
          <button className="br-button primary" type="submit">Continuar</button>
        </form>
      </section>

      {/* TC-F-05 — CPF field without format hint (e-MAG 6.5: complex inputs need hint BEFORE field) */}
      <section id="TC-F-05" data-testid="TC-F-05" style={CASE_STYLE}>
        <span style={ID_STYLE}>TC-F-05</span>
        <form noValidate>
          <div className="br-input" style={{ marginBottom: "1rem" }}>
            <label htmlFor="f05-cpf">CPF</label>
            <input id="f05-cpf" className="br-input" type="text"
              aria-required="true" required />
          </div>
          <button className="br-button primary" type="submit">Salvar</button>
        </form>
      </section>

      {/* TC-F-06 — error message exists but not linked via aria-describedby */}
      <section id="TC-F-06" data-testid="TC-F-06" style={CASE_STYLE}>
        <span style={ID_STYLE}>TC-F-06</span>
        <form noValidate>
          <div className="br-input" style={{ marginBottom: "0.25rem" }}>
            <label htmlFor="f06-cpf">CPF</label>
            <input id="f06-cpf" className="br-input danger" type="text"
              defaultValue="123" aria-required="true" aria-invalid="true" />
          </div>
          <p id="f06-error" style={{ color: "#e52207", fontSize: "12px", marginBottom: "1rem" }}>
            CPF inválido. Verifique o número digitado.
          </p>
          <button className="br-button primary" type="submit">Salvar</button>
        </form>
      </section>

      {/* TC-F-07 — button order reversed: primary first, secondary second */}
      {/* DS spec: secondary action always comes before primary */}
      <section id="TC-F-07" data-testid="TC-F-07" style={CASE_STYLE}>
        <span style={ID_STYLE}>TC-F-07</span>
        <form noValidate>
          <div className="br-input" style={{ marginBottom: "1rem" }}>
            <label htmlFor="f07-name">Nome completo</label>
            <input id="f07-name" className="br-input" type="text"
              aria-required="true" required />
          </div>
          <div style={{ display: "flex", gap: "1rem" }}>
            <button className="br-button primary" type="submit">Confirmar</button>
            <button className="br-button secondary" type="button">Cancelar</button>
          </div>
        </form>
      </section>

      {/* TC-F-08 — select with aria-label only, no visible <label> element */}
      {/* e-MAG: all form fields must have a VISIBLE label, not just aria-label */}
      <section id="TC-F-08" data-testid="TC-F-08" style={CASE_STYLE}>
        <span style={ID_STYLE}>TC-F-08</span>
        <form noValidate>
          <div style={{ marginBottom: "1rem" }}>
            <select id="f08-state" className="br-select" aria-label="Estado" aria-required="true">
              <option value="">Selecione um estado</option>
              <option value="SP">São Paulo</option>
              <option value="RJ">Rio de Janeiro</option>
            </select>
          </div>
          <button className="br-button primary" type="submit">Confirmar</button>
        </form>
      </section>

      {/* TC-F-09 — grupo de checkboxes sem <fieldset><legend> */}
      {/* e-MAG 6.2 / WCAG 1.3.1: controles agrupados devem ter fieldset+legend */}
      <section id="TC-F-09" data-testid="TC-F-09" style={CASE_STYLE}>
        <span style={ID_STYLE}>TC-F-09</span>
        <form noValidate>
          <p style={{ marginBottom: "0.5rem", fontWeight: 600 }}>Canais de notificação</p>
          <div style={{ marginBottom: "1rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <label><input type="checkbox" name="notif" value="email" /> E-mail</label>
            <label><input type="checkbox" name="notif" value="sms" /> SMS</label>
            <label><input type="checkbox" name="notif" value="push" /> Push</label>
          </div>
          <button className="br-button primary" type="submit">Salvar preferências</button>
        </form>
      </section>

      {/* TC-F-10 — dois botões com nome acessível idêntico ("Salvar") em contextos diferentes */}
      {/* WCAG 2.4.6 / e-MAG: controles com funções diferentes devem ter nomes distintos */}
      <section id="TC-F-10" data-testid="TC-F-10" style={CASE_STYLE}>
        <span style={ID_STYLE}>TC-F-10</span>
        <form noValidate>
          <div style={{ display: "flex", gap: "3rem", flexWrap: "wrap" }}>
            <div>
              <p style={{ fontSize: "12px", fontWeight: 600, marginBottom: "0.5rem" }}>Perfil público</p>
              <div className="br-input" style={{ marginBottom: "0.75rem" }}>
                <label htmlFor="f10-name">Nome exibido</label>
                <input id="f10-name" className="br-input" type="text" />
              </div>
              <button className="br-button primary" type="button">Salvar</button>
            </div>
            <div>
              <p style={{ fontSize: "12px", fontWeight: 600, marginBottom: "0.5rem" }}>Configurações</p>
              <div className="br-input" style={{ marginBottom: "0.75rem" }}>
                <label htmlFor="f10-lang">Idioma</label>
                <input id="f10-lang" className="br-input" type="text" defaultValue="Português" />
              </div>
              <button className="br-button primary" type="button">Salvar</button>
            </div>
          </div>
        </form>
      </section>

      {/* TC-F-11 — aria-labelledby apontando para ID inexistente no DOM */}
      {/* A referência está quebrada: o input não tem nome acessível */}
      <section id="TC-F-11" data-testid="TC-F-11" style={CASE_STYLE}>
        <span style={ID_STYLE}>TC-F-11</span>
        <form noValidate>
          <div className="br-input" style={{ marginBottom: "1rem" }}>
            <input id="f11-name" className="br-input" type="text"
              aria-labelledby="ghost-label-id" placeholder="Nome completo" />
          </div>
          <button className="br-button primary" type="submit">Continuar</button>
        </form>
      </section>

      {/* TC-F-12 — referência: aria-labelledby válido apontando para heading existente */}
      {/* Armadilha de falso positivo: sem <label> visível, mas aria-labelledby é válido */}
      <section id="TC-F-12" data-testid="TC-F-12" style={CASE_STYLE}>
        <span style={ID_STYLE}>TC-F-12</span>
        <form noValidate>
          <h3 id="f12-section-label" style={{ fontSize: "14px", marginBottom: "0.5rem" }}>
            Endereço de entrega
          </h3>
          <div className="br-input" style={{ marginBottom: "1rem" }}>
            <input id="f12-address" className="br-input" type="text"
              aria-labelledby="f12-section-label" placeholder="Digite o endereço completo" />
          </div>
          <button className="br-button primary" type="submit">Confirmar</button>
        </form>
      </section>

      {/* TC-F-13 — cor de borda do br-input fora do token DS */}
      <section id="TC-F-13" data-testid="TC-F-13" style={CASE_STYLE}>
        <span style={ID_STYLE}>TC-F-13</span>
        <form noValidate>
          <div className="br-input" style={{ marginBottom: "1rem" }}>
            <label htmlFor="f13-name">Nome completo</label>
            <input id="f13-name" className="br-input v-border-a" type="text"
              aria-required="true" required />
          </div>
          <button className="br-button primary" type="submit">Salvar</button>
        </form>
      </section>
    </main>
  );
}
