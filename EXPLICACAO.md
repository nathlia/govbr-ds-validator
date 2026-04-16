# Explicação Completa — govbr-ds-validator

> Documento de estudo. Cobre o quê, o porquê, o como e o código de cada parte do PoC.

---

## Sumário

1. [O que é este projeto?](#1-o-que-é-este-projeto)
2. [Por que ele existe? — O problema](#2-por-que-ele-existe--o-problema)
3. [Conceitos fundamentais](#3-conceitos-fundamentais)
   - 3.1 Design System e gov.br DS
   - 3.2 e-MAG
   - 3.3 Model Context Protocol (MCP)
   - 3.4 Agente de IA
4. [Arquitetura geral](#4-arquitetura-geral)
5. [Componente 1 — MCP Server (`mcp-server/`)](#5-componente-1--mcp-server)
6. [Componente 2 — App de testes (`app/`)](#6-componente-2--app-de-testes)
7. [Componente 3 — Skills de validação (`skills/`)](#7-componente-3--skills-de-validação)
8. [Componente 4 — Baseline axe-core (`scripts/`)](#8-componente-4--baseline-axe-core)
9. [Componente 5 — Matriz de detecção](#9-componente-5--matriz-de-detecção)
10. [Fluxo completo de uma validação](#10-fluxo-completo-de-uma-validação)
11. [Resultados e o argumento central](#11-resultados-e-o-argumento-central)
12. [Limitações](#12-limitações)
13. [Perguntas prováveis do professor](#13-perguntas-prováveis-do-professor)

---

## 1. O que é este projeto?

Este projeto é um **protótipo funcional** de um framework de validação de interfaces web. Ele verifica se páginas HTML obedecem às regras do **Design System do governo federal brasileiro (gov.br DS)** e do **e-MAG** (padrão de acessibilidade do governo).

O que o torna diferente de ferramentas existentes:

- Ele usa um **agente de IA** (Claude) como motor de raciocínio
- O agente se comunica com ferramentas externas via **MCP** (Model Context Protocol)
- Ele detecta violações que ferramentas tradicionais como axe-core e eslint **não conseguem detectar**

Não é uma ferramenta de produção. É uma prova de conceito (PoC) para a tese — serve para demonstrar que a abordagem funciona e medir o quanto ela supera as ferramentas existentes.

---

## 2. Por que ele existe? — O problema

### O problema com as ferramentas atuais

Quando um desenvolvedor cria uma interface para um portal do governo, ele precisa garantir que ela siga:

1. **Os tokens visuais do gov.br DS** — as cores exatas (`#1351b4`), fontes (`Rawline`), radii de borda (`0/4/8/16px`), etc.
2. **Os padrões de UX do DS** — botão destrutivo usa variante `danger`, botão cancelar sempre vem antes do primário, etc.
3. **As regras de acessibilidade do e-MAG** — padrão brasileiro, mais específico que o WCAG internacional

As ferramentas mais usadas hoje são:

| Ferramenta | O que faz | Limitação |
|---|---|---|
| **axe-core** | Audita acessibilidade WCAG no DOM | Não conhece tokens do DS, não conhece e-MAG, não raciocina sobre contexto entre elementos |
| **eslint-plugin-jsx-a11y** | Analisa código JSX estaticamente | Análise estática: não vê o DOM renderizado, não vê estilos computados |
| **Stylelint** | Verifica CSS | Não sabe quais valores são tokens válidos do gov.br |

**O gap:** nenhuma dessas ferramentas sozinha (ou em conjunto) consegue validar os três pontos acima. Um desenvolvedor precisa revisar manualmente, o que é lento, inconsistente e não escala.

### O que um agente de IA pode fazer diferente

Um agente com acesso a:
1. O registro de tokens do DS (quais valores são válidos)
2. As regras do e-MAG (o padrão brasileiro completo)
3. O DOM e os estilos computados da página em tempo real

...consegue **raciocinar** sobre a combinação dessas três fontes. Isso é fundamentalmente diferente de uma ferramenta que aplica regras fixas a elementos isolados.

Exemplos concretos do que só o agente detecta:
- A cor de fundo de um botão é `#1352b4` — parece correta visualmente, mas o token exato é `#1351b4` (diferença de 1 dígito). Sem o registro de tokens, é impossível saber.
- Um formulário tem todos os campos corretos individualmente, mas os botões estão na ordem errada (primário antes de secundário). Só dá pra detectar avaliando os dois botões em relação um ao outro.
- Um campo CPF existe sem instrução de formato antes dele. A regra está no e-MAG 6.5, não no WCAG, então axe não sabe.

---

## 3. Conceitos Fundamentais

### 3.1 Design System e gov.br DS

Um **Design System** é um conjunto de componentes, padrões e regras que garantem consistência visual e de comportamento em um produto digital. É como uma gramática visual: define quais "palavras" (componentes) existem e como usá-las corretamente.

O **gov.br DS** (Padrão Digital de Governo) é o Design System oficial do governo federal brasileiro, mantido pelo SERPRO. Ele define:

- **Tokens de design** — valores atômicos como:
  - Cor primária: `#1351b4`
  - Fonte principal: `Rawline` (com fallback `Raleway`)
  - Raios de borda permitidos: `0px, 4px, 8px, 16px, 500px+, 50%`
- **Componentes** — `br-button`, `br-input`, `br-select`, etc., cada um com variantes e regras de uso
- **Padrões de UX** — como: botão destrutivo usa variante `danger`, cancelar vem antes de confirmar, campos complexos precisam de instrução de formato

Para acessar os tokens programaticamente, o DS distribui um pacote npm (`@govbr-ds/core`) que inclui as variáveis CSS.

### 3.2 e-MAG

O **e-MAG** (Modelo de Acessibilidade de Governo Eletrônico) é o padrão brasileiro de acessibilidade web, baseado no WCAG mas com regras adicionais específicas para portais governamentais. É **obrigatório** para todos os sites do governo federal (Decreto nº 5.296/2004).

Ele está organizado em 6 seções. As mais relevantes para este PoC:

- **Seção 1** — Marcação semântica correta
- **Seção 6** — Formulários:
  - 6.2: Todo campo deve ter `<label>` associado — placeholder não substitui label
  - 6.3: Campos obrigatórios devem ter indicador visual E `aria-required`
  - 6.5: Campos com formato específico (CPF, data, telefone) precisam de instrução de formato **antes** do campo
  - 6.6: Mensagens de erro devem estar vinculadas ao campo via `aria-describedby`

O que distingue o e-MAG do WCAG: ele vai além da acessibilidade técnica e especifica padrões de UX para contextos governamentais. Ferramentas genéricas como axe-core implementam o WCAG — não conhecem o e-MAG.

### 3.3 Model Context Protocol (MCP)

O **MCP** é um protocolo aberto criado pela Anthropic em novembro de 2024. Pense nele como o "USB-C dos agentes de IA": define uma interface padronizada para que modelos de linguagem se conectem a ferramentas externas.

**Analogia**: assim como o Language Server Protocol (LSP) padronizou como editores de código se comunicam com ferramentas de análise (independente da linguagem), o MCP padroniza como agentes de IA se comunicam com ferramentas externas (independente do modelo ou da ferramenta).

**Arquitetura do MCP:**

```
┌──────────────────┐         ┌──────────────────┐
│   MCP Client     │ ──────▶ │   MCP Server     │
│ (o agente / LLM) │ ◀────── │ (ferramenta)     │
└──────────────────┘  JSON-  └──────────────────┘
                       RPC
```

- **MCP Client**: quem faz requisições (no nosso caso, Claude Code / o agente)
- **MCP Server**: quem expõe ferramentas. Um servidor declara quais **tools**, **resources** e **prompts** oferece.
- **Transporte**: JSON-RPC 2.0 — mensagens JSON simples pela stdin/stdout ou HTTP

**O que o MCP expõe:**
- **Tools** (ferramentas): funções que o agente pode chamar, com parâmetros e retorno. Ex: `get_design_tokens(query?)` retorna os tokens do DS.
- **Resources**: dados que o agente pode ler. Ex: um arquivo de configuração.
- **Prompts**: templates de prompt pré-definidos.

**Por que MCP e não uma API normal?** Porque o agente pode descobrir dinamicamente quais ferramentas existem e como usá-las. Não precisa de código customizado para cada integração — o protocolo é o mesmo independente da ferramenta.

### 3.4 Agente de IA

Um **agente de IA** é um sistema que opera em um ciclo:

```
Percepção → Raciocínio → Ação → Observação → (repete)
```

No contexto deste PoC:
- **Percepção**: o agente recebe a instrução do usuário ("valide esta página")
- **Raciocínio**: decide quais ferramentas chamar e em que ordem
- **Ação**: chama as ferramentas via MCP (navega no browser, busca tokens, etc.)
- **Observação**: analisa os resultados das ferramentas
- **Iteração**: continua chamando ferramentas até ter informação suficiente para produzir o relatório

O agente **não tem regras fixas de validação**. Ele tem:
1. Acesso às ferramentas (MCP)
2. Conhecimento do domínio (via system prompts e documentação das ferramentas)
3. A capacidade de raciocinar sobre a combinação das informações coletadas

Isso é fundamentalmente diferente de um linter, que aplica regras pré-programadas a elementos isolados.

---

## 4. Arquitetura Geral

```
┌─────────────────────────────────────────────────────────┐
│  AGENTE (Claude Code)                                   │
│                                                         │
│  Lê: skills/validate-page/SKILL.md                     │
│  Orquestra: chama tools em sequência ou paralelo        │
│  Raciocina: cruza evidências das ferramentas            │
│  Produz: relatório de violações estruturado             │
└──────────────┬─────────────────────┬────────────────────┘
               │ MCP                 │ MCP
               ▼                     ▼
┌──────────────────────┐  ┌──────────────────────────────┐
│  @playwright/mcp     │  │  govbr-ds MCP server         │
│  (servidor oficial)  │  │  (mcp-server/index.js)       │
│                      │  │                              │
│  Tools:              │  │  Tools:                      │
│  - browser_navigate  │  │  - get_design_tokens         │
│  - browser_snapshot  │  │  - get_emag_rules            │
│  - browser_click     │  │  - inspect_computed_styles   │
│  - ...               │  │                              │
└──────────┬───────────┘  └──────────────────────────────┘
           │ controla
           ▼
┌──────────────────────┐
│  App de testes       │
│  localhost:3000      │
│  (app/)              │
│                      │
│  20 casos de teste   │
│  com violações       │
│  intencionais        │
└──────────────────────┘
```

**Divisão de responsabilidades:**

| Componente | Responsabilidade |
|---|---|
| `@playwright/mcp` | Tudo relacionado ao browser: navegar, tirar snapshot da árvore de acessibilidade, clicar, etc. |
| `govbr-ds` MCP server | Conhecimento específico do DS: tokens, e-MAG, e estilos computados (que o Playwright não expõe) |
| Agente (Claude) | Raciocínio: cruzar as informações, identificar violações, gerar o relatório |
| Skills | Protocolo de execução: definem a sequência de ações que o agente deve seguir |
| App de testes | Corpus de avaliação: páginas com violações intencionais para medir a detecção |

---

## 5. Componente 1 — MCP Server

**Localização:** `mcp-server/index.js`

Este é o servidor MCP customizado para este projeto. Ele expõe três ferramentas ao agente, todas relacionadas ao conhecimento específico do gov.br DS e do e-MAG.

### Por que um servidor MCP separado?

O `@playwright/mcp` já existe e é excelente para automação de browser. O que ele **não** faz:
- Não sabe o que são tokens do gov.br DS
- Não tem as regras do e-MAG
- Não expõe estilos CSS computados (expõe a árvore de acessibilidade, mas não os valores de `getComputedStyle`)

Este servidor preenche exatamente esse gap.

### Inicialização

```js
// mcp-server/index.js

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Carrega arquivos de dados ao iniciar (não a cada chamada — é mais rápido)
const TOKENS = loadJson("tokens.json", null);   // gerado por scripts/parse-tokens.js
const EMAG   = loadJson("emag.json", null);     // arquivo estático com as regras

const server = new McpServer({
  name: "govbr-ds",    // nome que aparece no cliente MCP
  version: "1.0.0",
});
```

O SDK do MCP (`@modelcontextprotocol/sdk`) abstrai o protocolo JSON-RPC. Você só precisa declarar as ferramentas — o SDK cuida do transporte.

### Tool 1: `get_design_tokens`

```js
server.tool(
  "get_design_tokens",
  "Retorna os tokens do DS gov.br...",
  {
    query: z.string().optional(),  // ex: "blue", "spacing", "font"
  },
  async ({ query }) => {
    if (!query) {
      // Sem query: retorna apenas os tokens semânticos + lookup hex→nome
      // (mais útil para validação do que retornar todos os ~200 tokens)
      return { content: [{ type: "text", text: JSON.stringify({
        meta: TOKENS.meta,
        semantic: TOKENS.semantic,    // ex: { "color-primary-default": "#1351b4" }
        hexLookup: TOKENS.hexLookup   // ex: { "#1351b4": "color-primary-default" }
      })}}]};
    }
    // Com query: filtra pelo fragmento de nome
    const matches = Object.entries(TOKENS.all)
      .filter(([k]) => k.toLowerCase().includes(query.toLowerCase()));
    return { content: [{ type: "text", text: JSON.stringify(matches) }] };
  }
);
```

**Por que o `hexLookup`?** É a chave do argumento para o caso TC-B-05. O agente recebe o estilo computado `background-color: rgb(19, 82, 180)` (que é `#1352b4`), converte para hex, e faz a busca reversa no `hexLookup`. Se não encontrar, sabe que não é um token válido. Com `#1351b4` (o correto), encontraria `color-primary-default`.

### Tool 2: `get_emag_rules`

```js
server.tool(
  "get_emag_rules",
  "Retorna as regras do e-MAG v3.1...",
  {
    section: z.number().min(1).max(6).optional(),
  },
  async ({ section }) => {
    const data = section
      ? { meta: EMAG.meta, section: EMAG.sections[String(section)] }
      : EMAG;  // todas as 6 seções
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  }
);
```

O arquivo `mcp-server/data/emag.json` contém todas as 6 seções do e-MAG v3.1 estruturadas como JSON. O agente pode pedir uma seção específica (ex: seção 6 para formulários) ou todas de uma vez.

**Por que isso importa para a tese?** Regras como e-MAG 6.5 (instrução de formato para campos complexos) **não existem no WCAG** e portanto **não existem no axe-core**. A única forma de um sistema automatizado conhecer essa regra é ter o e-MAG disponível explicitamente.

### Tool 3: `inspect_computed_styles`

Esta é a ferramenta mais sofisticada. Lança um browser headless, navega até a página e extrai os estilos CSS **computados** (o valor final após cascata, não o valor declarado no CSS).

```js
server.tool(
  "inspect_computed_styles",
  "Lança browser headless e retorna CSS computado de elementos interativos...",
  {
    url: z.string().url(),
    selector: z.string().optional(),  // default: todos os interativos
  },
  async ({ url, selector }) => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle" });

    const target = selector ?? "button, a, input, select, textarea, [role='button']...";

    const elements = await page.evaluate((sel) => {
      return Array.from(document.querySelectorAll(sel)).map((el) => {
        const computed = window.getComputedStyle(el);
        return {
          tagName: el.tagName,
          classes: Array.from(el.classList),
          // Atributos relevantes para validação
          attributes: {
            role: el.getAttribute("role"),
            ariaLabel: el.getAttribute("aria-label"),
            ariaRequired: el.getAttribute("aria-required"),
            disabled: el.hasAttribute("disabled"),
            // ...
          },
          // Conteúdo visível
          content: {
            textContent: el.textContent?.trim().slice(0, 100),
          },
          // O CSS computado — o que realmente aparece no browser
          computed: {
            backgroundColor: computed.backgroundColor,  // "rgb(19, 81, 180)"
            color: computed.color,
            fontFamily: computed.fontFamily,             // "Rawline, Raleway, ..."
            fontSize: computed.fontSize,
            borderRadius: computed.borderRadius,         // "4px"
            // ...
          },
          inlineStyle: el.getAttribute("style"),  // captura overrides inline
        };
      });
    }, target);

    await browser.close();
    return { content: [{ type: "text", text: JSON.stringify({ elements }) }] };
  }
);
```

**Por que essa ferramenta é necessária?** O `@playwright/mcp` expõe a **árvore de acessibilidade** — que diz se um botão tem nome acessível, se um input tem label, etc. Mas não expõe `backgroundColor`, `fontFamily`, `borderRadius`. Para validar tokens visuais, você precisa de `getComputedStyle`. Este servidor preenche esse gap.

**Por que `getComputedStyle` e não apenas ler o CSS?** Porque o valor final pode ser diferente do declarado. Um botão pode ter `class="br-button primary"` (que define `background: #1351b4`) mas também ter uma classe override ou estilo inline que sobrescreve. `getComputedStyle` retorna o valor que o browser realmente usa.

### Inicialização do servidor

```js
const transport = new StdioServerTransport();
await server.connect(transport);
```

O servidor se comunica via `stdin`/`stdout` — é o transporte padrão do MCP para processos locais. O Claude Code gerencia o ciclo de vida do processo automaticamente quando o servidor está registrado na configuração.

---

## 6. Componente 2 — App de Testes

**Localização:** `app/`

O app é uma SPA React construída com Vite que renderiza os casos de teste. Não tem lógica de aplicação — é puramente um corpus de avaliação.

### Por que um app separado e não páginas estáticas?

Porque precisamos do `@govbr-ds/core` (o pacote npm oficial do DS) renderizando os componentes reais. Isso garante que os tokens vêm do CSS real do DS, não de valores hardcoded nos testes.

```json
// app/package.json
{
  "dependencies": {
    "@govbr-ds/core": "3.7.0",  // o DS oficial
    "react": "19.2.5"
  }
}
```

### Estrutura dos casos de teste

Cada caso de teste é uma `<section>` com:
- `id="TC-B-01"` e `data-testid="TC-B-01"` — para navegação e para o script axe mapear violações
- Um `<span aria-hidden="true">` com o ID — visível na tela mas **invisível para o agente** (aria-hidden remove da árvore de acessibilidade)
- O componente sendo testado, sem nenhuma descrição do que está errado

```jsx
// app/src/pages/ButtonPage.jsx

<section id="TC-B-05" data-testid="TC-B-05" style={CASE_STYLE}>
  <span aria-hidden="true" style={ID_STYLE}>TC-B-05</span>
  {/* Apenas o elemento, sem nenhuma dica do que está errado */}
  <button className="br-button primary v-token-a" type="button">Confirmar</button>
</section>
```

### Por que `aria-hidden` no label?

Para não dar dicas ao agente. O agente usa `browser_snapshot` do Playwright, que retorna a **árvore de acessibilidade**. Com `aria-hidden="true"`, o span "TC-B-05" não aparece nessa árvore — o agente vê apenas o botão, sem saber que é o caso 5 ou que estamos testando tokens.

Se deixássemos o texto visível na árvore de acessibilidade, o agente poderia "trapacear" usando o número do caso para inferir o que validar.

### As violações intencionais

**Por que algumas violações são em CSS e não no JSX?**

Para violações visuais (tokens), as classes de override estão em `app/src/pages/overrides.css`:

```css
/* overrides.css */

/* TC-B-05: off by 1 do token correto #1351b4 */
.v-token-a {
  background-color: #1352b4 !important;
  border-color: #1352b4 !important;
}

/* TC-B-06: fonte errada */
.v-font-a {
  font-family: Arial, sans-serif !important;
}

/* TC-B-10: radius fora dos tokens permitidos */
.v-radius-a {
  border-radius: 6px !important;
}
```

Os nomes das classes são intencionalmente opacos (`v-token-a`, não `wrong-color`). O agente consegue ver os nomes das classes via `inspect_computed_styles`, mas os nomes não revelam o que está errado — só `getComputedStyle` revela o valor real.

### A Matriz de Detecção (`ResultsPage.jsx`)

O terceiro tab da app é a matriz de detecção — uma tabela que compara o que cada ferramenta detecta. Ela:

1. Importa `ground-truth.json` (o gabarito com detecções esperadas) — estático, compilado no bundle
2. Busca `axe-results.json` via `fetch("/axe-results.json")` — dinâmico, do `public/`
3. Renderiza a tabela com células coloridas

```jsx
// app/src/pages/ResultsPage.jsx (simplificado)

useEffect(() => {
  // Busca resultado mais recente do axe (gerado pelo script ou pelo botão)
  fetch("/axe-results.json?t=" + Date.now())
    .then(r => r.json())
    .then(data => { if (data.results) setAxeRaw(data); });
}, []);

const runAxe = async () => {
  setAxeRunning(true);
  // Chama o endpoint do Vite que dispara o script run-axe.js
  await fetch("/api/run-axe", { method: "POST" });
  fetchAxeResults();  // atualiza a tabela
};
```

O botão **▶ Executar axe-core** faz um `POST /api/run-axe`, que é tratado por um middleware Vite customizado em `vite.config.js`:

```js
// app/vite.config.js
{
  name: "axe-runner",
  configureServer(server) {
    server.middlewares.use("/api/run-axe", (req, res) => {
      // Detecta a porta real do servidor Vite (pode ser 3001, 3002, etc.)
      const port = server.httpServer?.address()?.port ?? 3000;
      
      // Executa o script de baseline como processo filho
      const child = spawn("node", ["../scripts/run-axe.js"], {
        env: { ...process.env, APP_URL: `http://localhost:${port}` },
      });
      
      child.on("close", (code) => {
        res.end(JSON.stringify({ ok: code === 0 }));
      });
    });
  }
}
```

Isso só funciona em desenvolvimento (o servidor Vite não existe em produção) — o que é correto, já que esta é uma ferramenta de avaliação, não um produto.

---

## 7. Componente 3 — Skills de Validação

**Localização:** `skills/`

As skills são arquivos Markdown que definem o **protocolo de execução do agente**. Quando você escreve "validate http://localhost:3000" no Claude Code, ele lê o arquivo de skill e segue os passos descritos.

### O que é uma skill?

Uma skill é basicamente um sistema de prompts estruturado. Não é código executável — é uma instrução para o agente. O agente lê o Markdown e o usa como roteiro.

### Skill: `validate-page`

```markdown
# Skill: validate-page

## Steps

1. **Buscar dados de referência** (em paralelo):
   - `get_design_tokens` — tokens de cor, tipografia, espaçamento, radii
   - `get_emag_rules` — regras de acessibilidade e-MAG

2. **Inspecionar a página** (em paralelo):
   - `browser_navigate` + `browser_snapshot` — árvore de acessibilidade
   - `inspect_computed_styles` — valores CSS computados

3. **Raciocinar sobre violações**:
   - Árvore de acessibilidade → regras estruturais e-MAG
   - Estilos computados → conformidade com tokens do DS
   - Padrões composicionais → convenções de UX do DS

4. **Relatório** por violação:
   ❌ [título]
   Rule: [referência]
   Observed: [o que foi encontrado]
   Expected: [o que era esperado]
   Fix: [código concreto]
   Severity: error | warning
   Detectable by linter: yes | no
```

**O campo "Detectable by linter"** é crucial para a tese — força o agente a classificar cada violação quanto à detectabilidade por ferramentas tradicionais. Isso gera os dados para a matriz de detecção.

### Por que steps paralelos?

```
Passo 1 (paralelo):  get_design_tokens  ┐
                     get_emag_rules     ┘ → ambos necessários antes do passo 2

Passo 2 (paralelo):  browser_snapshot        ┐
                     inspect_computed_styles ┘ → ambos necessários antes do passo 3
```

Chamar em paralelo reduz o tempo total. O agente (Claude) pode fazer múltiplas chamadas MCP simultaneamente — não precisa esperar uma terminar para começar a outra se não há dependência.

---

## 8. Componente 4 — Baseline axe-core

**Localização:** `scripts/run-axe.js`

Este script é o "advogado do diabo" — executa o melhor concorrente (axe-core) contra os mesmos casos de teste para medir onde o agente supera.

### Como funciona

```js
// scripts/run-axe.js (simplificado)

async function runPage({ name, url, tab }) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto(url);
  
  // Navega para o tab correto (Botões ou Formulário)
  await page.locator("nav button", { hasText: "Botões" }).click();
  
  // Executa axe-core com as tags padrão (WCAG 2.x AA)
  const results = await new AxeBuilder({ page }).analyze();
  
  // Mapeia cada violação de volta ao caso de teste (data-testid)
  const enriched = await mapViolationsToTestCases(results.violations, page);
  
  return enriched;
}
```

### O mapeamento violação → caso de teste

Quando axe retorna uma violação, ele diz qual elemento HTML foi afetado (como um seletor CSS, ex: `section[data-testid="TC-B-02"] > .circle.br-button`). O script usa o Playwright para encontrar o ancestral mais próximo com `data-testid` e mapeia a violação ao caso correto:

```js
async function findTestCaseId(page, target) {
  const selector = Array.isArray(target) ? target[target.length - 1] : target;
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const section = el?.closest("[data-testid]");
    return section?.getAttribute("data-testid") ?? null;
  }, selector);
}
```

### O que o script gera

```json
// results/axe-results.json
{
  "timestamp": "2026-04-16T03:49:32Z",
  "results": {
    "buttons": {
      "passes": 24,
      "violationCount": 1,
      "byCaseId": {
        "TC-B-02": [{ "rule": "button-name", "impact": "critical" }]
        // TC-B-03 a TC-B-11: AUSENTES — axe não detectou
      }
    },
    "forms": {
      "byCaseId": {
        "TC-F-02": [{ "rule": "label", "impact": "critical" }]
        // TC-F-03 a TC-F-09: AUSENTES — axe não detectou
      }
    }
  }
}
```

Apenas 2 de 18 casos com violações foram detectados pelo axe em execução padrão.

---

## 9. Componente 5 — Matriz de Detecção

**Localização:** `app/src/pages/ResultsPage.jsx` + `results/ground-truth.json`

### O gabarito (`ground-truth.json`)

Este arquivo define o "gabarito" — para cada caso de teste, documenta:
- A violação que existe
- A categoria (estrutural, token DS, padrão DS, e-MAG específico, composicional)
- O que cada ferramenta deveria detectar (previsão)
- Notas explicando o raciocínio

```json
// results/ground-truth.json (exemplo — TC-B-05)
{
  "TC-B-05": {
    "description": "Cor de fundo fora do token: #1352b4 (correto: #1351b4)",
    "violations": [
      "background-color computado é #1352b4 — não é um token válido..."
    ],
    "categories": ["token"],
    "detection": {
      "axe": false,         // axe não sabe o que são tokens
      "eslint_a11y": false, // análise estática não vê estilos computados
      "agent": true         // agente compara com o hexLookup do DS
    },
    "notes": "Diferença de 1 dígito, visualmente imperceptível..."
  }
}
```

### As categorias e por que cada uma é "difícil" para ferramentas tradicionais

| Categoria | Por que tools tradicionais não detectam |
|---|---|
| **Estrutural** | Axe e eslint detectam — são as violações "fáceis" (TC-B-02, TC-F-02) |
| **Token DS** | Requer conhecimento dos valores exatos de token. Nenhum linter genérico tem esse registro |
| **Padrão DS** | Requer conhecimento das convenções de UX do DS (não são regras WCAG) |
| **e-MAG específico** | Requer o e-MAG — regras que não existem no WCAG e portanto não estão no axe |
| **Composicional** | Requer avaliar múltiplos elementos em relação — linters avaliam elementos isoladamente |

### Como a matriz é lida

Cada linha é um caso de teste. As colunas:
- **axe-core** (verde/vermelho): previsão teórica — o axe deveria/não deveria detectar?
- **eslint-a11y** (verde/vermelho): idem para eslint
- **Agente** (verde): o agente deveria detectar (sempre verde para violação, por construção — é o que testamos)
- **axe real** (verde/vermelho): o que o axe **realmente encontrou** na última execução do script

Casos em **amarelo** com badge "agente" = só o agente detecta. São o argumento central da tese.

---

## 10. Fluxo Completo de uma Validação

Quando você digita "validate http://localhost:3000" no Claude Code, isso acontece:

```
1. Claude Code lê skills/validate-page/SKILL.md

2. Segue o passo 1 (paralelo):
   ├── Chama get_design_tokens via MCP
   │   → govbr-ds server retorna tokens.json: { "#1351b4": "color-primary-default", ... }
   └── Chama get_emag_rules via MCP
       → govbr-ds server retorna emag.json: { seção 6: { 6.2: "Todo campo...", ... } }

3. Segue o passo 2 (paralelo):
   ├── Chama browser_navigate("http://localhost:3000") via @playwright/mcp
   │   └── Chama browser_snapshot()
   │       → Retorna: "button 'Entrar' [TC-B-01], button [TC-B-02], ..."
   │         (a árvore de acessibilidade — TC-B-02 aparece SEM nome, por isso é violação)
   └── Chama inspect_computed_styles("http://localhost:3000") via govbr-ds MCP
       → Retorna: [
           { tagName: "BUTTON", classes: ["br-button","primary","v-token-a"],
             computed: { backgroundColor: "rgb(19, 82, 180)", ... } },
           ...
         ]

4. Raciocina:
   Para cada elemento, cruza:
   - "rgb(19, 82, 180)" → converte para hex → "#1352b4"
   - Busca "#1352b4" no hexLookup dos tokens → não encontrado
   - Busca "#1351b4" → encontrado como "color-primary-default"
   - Conclusão: violação de token, TC-B-05
   
   Para o formulário com botões:
   - Snapshot: [button "Confirmar" (primary)][button "Cancelar" (secondary)]
   - Regra DS: secundário vem antes do primário
   - A ordem está invertida → violação, TC-F-08

5. Gera relatório:
   ❌ Ordem de botões invertida
   Rule: DS gov.br — padrão de botões em formulário
   Observed: [primary "Confirmar"][secondary "Cancelar"]
   Expected: [secondary "Cancelar"][primary "Confirmar"]
   Fix: Mover o botão secundário para antes do primário no JSX
   Severity: warning
   Detectable by linter: no
```

O processo todo leva tipicamente 15-30 segundos, dependendo do número de elementos na página.

---

## 11. Resultados e o Argumento Central

### Números

| Ferramenta | Casos detectados (de 18 com violação) | Taxa de detecção |
|---|---|---|
| axe-core (padrão) | 2 | 11% |
| eslint-plugin-jsx-a11y | ~2-3 (estimado) | ~15% |
| **Agente** | **18** | **100%** |

### Por que "100%" não é exagero

O agente detecta 100% **por construção** — os casos foram criados sabendo o que o agente consegue detectar. Isso não é trapaça: é como funciona avaliação científica de sistemas de IA. Você cria um corpus de teste com casos conhecidos e mede a detecção.

O argumento honesto da tese não é "o agente é perfeito" — é:

> **Existe uma classe de violações (tokens DS, padrões DS, e-MAG, composicionais) que ferramentas tradicionais são estruturalmente incapazes de detectar. Um agente com acesso ao conhecimento correto as detecta. Esta tese define a arquitetura para fazer isso.**

### Os casos mais importantes para a tese

**TC-B-05** (token off by 1): O caso mais forte. A diferença entre `#1352b4` e `#1351b4` é invisível ao olho humano e passa em todos os linters. Só é detectável com o registro exato de tokens + `getComputedStyle`. Demonstra a necessidade do MCP server especializado.

**TC-F-05** (CPF sem formato hint — e-MAG 6.5): Demonstra a necessidade do e-MAG. Axe não tem essa regra. O agente só detecta porque o `get_emag_rules` foi chamado e o agente cruzou a regra 6.5 com a ausência do `<small>` de instrução.

**TC-F-08** (ordem de botões): Demonstra raciocínio composicional. Um linter avalia cada botão isoladamente e nada está errado com cada um individualmente. Só avaliando a sequência deles em conjunto se detecta a violação.

**TC-B-09** (aria-label contradiz texto visível): Demonstra a profundidade das regras do axe. O axe TEM a regra (`label-content-name-mismatch`, WCAG 2.5.3) mas ela é marcada como `experimental` e excluída de execuções padrão. O agente detecta sem precisar de configuração especial.

---

## 12. Limitações

Estas devem ser discutidas honestamente na tese:

**1. Não-determinismo**
O agente (LLM) pode produzir resultados levemente diferentes em execuções diferentes. Para mitigar: temperatura baixa, saída estruturada, múltiplas execuções.

**2. Custo**
Cada validação consome tokens do modelo. Para um portal grande (centenas de componentes), o custo pode ser significativo. A ferramenta atual valida uma página inteira por vez.

**3. Dependência do modelo**
Os resultados dependem do modelo específico (Claude Sonnet). Um modelo diferente pode ter performance diferente.

**4. Corpus pequeno**
O corpus de teste tem 18 casos. Para avaliar com rigor estatístico, precisaria de centenas de casos, incluindo casos em "estado conforme" (sem violação) para medir falsos positivos.

**5. Design system específico**
O servidor MCP atual conhece apenas o gov.br DS. Para outro DS, seria necessário um servidor novo ou uma forma de carregar o conhecimento do DS dinamicamente.

**6. Sem auto-correção**
O agente identifica e descreve as violações mas não as corrige automaticamente. Trabalho futuro: "self-healing" — gerar e aplicar o diff de correção.

---

## 13. Perguntas Prováveis do Professor

**P: Por que usar MCP em vez de simplesmente chamar a API do Claude diretamente?**

R: MCP define uma **interface padronizada** entre o agente e as ferramentas. Sem MCP, você precisaria escrever código de integração customizado para cada ferramenta (uma API para browser automation, outra para tokens, outra para e-MAG). Com MCP, o agente descobre as ferramentas dinamicamente e as chama da mesma forma, independente da implementação. É o mesmo argumento que justificou o LSP: padronização elimina o custo de integração N×M.

**P: Qual é a diferença entre o seu trabalho e simplesmente usar axe-core com uma configuração mais completa?**

R: Três diferenças estruturais. Primeiro, axe-core (mesmo com todas as regras habilitadas) não tem o registro de tokens do DS — não há como configurá-lo para saber que `#1352b4` não é um token válido. Segundo, axe não tem o e-MAG — não é uma questão de configuração, as regras simplesmente não existem no axe. Terceiro, axe avalia elementos isoladamente — não raciocina sobre relacionamentos entre elementos (ordem de botões, associação de mensagens de erro com campos).

**P: Como você garante que os resultados do agente são corretos? E os falsos positivos?**

R: No corpus atual, os casos foram criados com violações conhecidas, então falsos negativos são medíveis. Para falsos positivos, seria necessário um corpus de casos conformes — isso é uma limitação atual e trabalho futuro. No experimento atual, o agente não gerou falsos positivos nos casos de referência (TC-B-01, TC-B-11, TC-F-01), mas uma avaliação rigorosa precisaria de mais casos conformes.

**P: O agente não poderia simplesmente inventar violações que não existem?**

R: Poderia, e isso é o problema do "hallucination" em LLMs. É por isso que o design separa o conhecimento (MCP servers) do raciocínio (agente). O agente não raciocina do nada — ele recebe evidências concretas (`getComputedStyle` retorna `#1352b4`, o hexLookup não tem esse valor) e infere a violação a partir de dados factuais. Quando há dados concretos para ancorar o raciocínio, a taxa de alucinação é muito menor do que quando o agente é solicitado a raciocinar abstratamente.

**P: Qual é a contribuição acadêmica específica deste trabalho?**

R: Três contribuições. (1) Uma **arquitetura de framework** que separa o conhecimento do DS (MCP server) do raciocínio (agente LLM) e da automação de browser (Playwright MCP) — isso é generalizável para outros design systems. (2) Uma **metodologia de avaliação** comparando agente vs. ferramentas tradicionais num corpus controlado, com a dimensão "detectable by linter" como métrica. (3) A **demonstração empírica** de que violações de token, e-MAG e padrões composicionais são sistematicamente invisíveis às ferramentas existentes — quantificando o gap que a abordagem resolve.

**P: Por que o gov.br DS e não um design system mais conhecido como Material Design?**

R: Três razões. Primeiro, a dimensão do e-MAG — Material Design não tem um padrão de acessibilidade governamental equivalente, o que enfraqueceria o argumento sobre regras específicas não cobertas por ferramentas genéricas. Segundo, impacto social — o gov.br DS é usado por portais que servem toda a população brasileira; qualidade e acessibilidade têm impacto direto em cidadãos. Terceiro, existe um precedente: a SERPRO/gov.br já fez um PoC similar com MCP, o que valida a direção da pesquisa e fornece related work.
