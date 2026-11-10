#!/usr/bin/env node
/** CLI determinístico para linhas de base: recebe PageScanRequest em base64 e imprime JSON puro. */
import { closeBrowser } from "../evidence/browser.js";
import { PageScanCache, scanPage, type PageScanRequest } from "../scan/pageScan.js";

const encoded = process.argv[2];
if (!encoded) {
  console.error("Uso: scan-page <PageScanRequest JSON em base64>");
  process.exit(2);
}

try {
  const request = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as PageScanRequest;
  // 2.5.2: a linha de base declara a janela do gabarito. Janela inválida é recusa, nunca o padrão.
  if (request.viewport !== undefined) {
    const { width, height } = request.viewport ?? {};
    if (![width, height].every((n) => Number.isInteger(n) && (n as number) > 0)) {
      console.error("viewport inválido: largura e altura inteiras positivas");
      process.exit(2);
    }
  }
  const result = await scanPage(request, new PageScanCache(1));
  // 3.5.0: as pendências (notJudged) são do ledger do MCP; a saída da linha de base fica com os mesmos campos.
  // 3.6.1: `document` (título/h1, para a sessão MCP) e `revisited` (só com sessão) também não saem.
  // 3.7.8: `componentLayout` (ordem do investigate do MCP) também não sai.
  const printed = result.status === "scanned" ? (({ notJudged: _pending, document: _document, revisited: _revisited, componentLayout: _layout, ...rest }) => rest)(result) : result;
  process.stdout.write(JSON.stringify(process.env.GOVBR_SCAN_CLI_NOT_JUDGED === "1" ? result : printed));
  // 2.10.0: até a 2.9.0 um passo que falhava lançava e o processo saía com erro. A linha de base
  // continua sem aceitar estado não alcançado como resultado: o JSON sai (com o motivo) e o código é 3.
  if (result.status === "state-not-reached") {
    console.error(`estado não alcançado: ${result.limitation.detail}`);
    process.exitCode = 3;
  }
} finally {
  await closeBrowser().catch(() => {});
}
