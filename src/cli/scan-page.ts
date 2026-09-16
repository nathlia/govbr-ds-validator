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
  process.stdout.write(JSON.stringify(result));
} finally {
  await closeBrowser().catch(() => {});
}
