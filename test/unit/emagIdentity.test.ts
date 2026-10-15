import { describe, it, expect } from "vitest";
import { filterRules } from "../../src/data/knowledge.js";
import { getEmag } from "../../src/data/load.js";

/**
 * O `data/emag.json` é mantido à mão; a KB é derivada da fonte oficial. Quando os dois discordam,
 * quem está errado é o servido — e discordar em silêncio já custou caro duas vezes.
 *
 * 2026-07-12: o arquivo servia 42 das 45 recomendações, e a 5.5, a 6.7 e a 6.8 sumiram sem aviso.
 * O diff da época comparou IDS, achou as três ausentes, e parou ali.
 *
 * 2026-09-14: as 45 estavam presentes, e DUAS carregavam a identidade errada — a 5.3 servia o
 * conteúdo da 5.4, a 6.3 servia indicação de campo obrigatório, que é território da 6.5. Os
 * `checks` de ambas vinham certos da KB, então o registro servido ficava internamente incoerente,
 * e foi essa incoerência que denunciou o caso — por leitura humana, não por teste.
 *
 * Este teste compara TÍTULOS, que é a camada onde o segundo caso morava. Ver D-14.
 */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** A KB guarda "Recomendação 6.3 – Estabelecer…"; o servido guarda só o título. */
function semPrefixo(titulo: string): string {
  // `\w` não cobre "ç"/"ã", então o prefixo é consumido por ausência de dígito, não por letra.
  return titulo.replace(/^Recomenda[^\d]*[\d.]+\s*[–—-]\s*/u, "");
}

describe("identidade das recomendações e-MAG servidas (D-14)", () => {
  const kb = filterRules({ standard: "eMAG" });
  const porRecomendacao = new Map<string, string>();
  for (const regra of kb) {
    // 2.12.0: a versão literal tem, além do título de cada recomendação, as frases do corpo dela
    // (mesma emagReference). A identidade mora no título.
    if (!/^Recomendação \d/u.test(regra.title)) continue;
    for (const ref of regra.emagReferences ?? []) {
      porRecomendacao.set(String(ref), semPrefixo(regra.title));
    }
  }

  const servidas = Object.values(getEmag().sections).flatMap((secao) => secao.rules);

  it("serve as 45 recomendações do e-MAG 3.1", () => {
    expect(servidas).toHaveLength(45);
  });

  it("nenhuma recomendação servida contradiz o título da KB", () => {
    const divergentes = servidas
      .filter((r) => {
        const daKb = porRecomendacao.get(String(r.id));
        if (!daKb) return false;
        // Prefixo generoso: a KB normaliza pontuação e artigos, e o ponto aqui é a IDENTIDADE
        // da recomendação, não a igualdade literal do título.
        return !normalizar(daKb).startsWith(normalizar(r.title).slice(0, 16));
      })
      .map((r) => `${r.id}: servido "${r.title}" vs KB "${porRecomendacao.get(String(r.id))}"`);

    expect(divergentes).toEqual([]);
  });

  it("toda recomendação servida tem correspondente na KB", () => {
    const orfas = servidas.filter((r) => !porRecomendacao.has(String(r.id))).map((r) => r.id);
    expect(orfas).toEqual([]);
  });
});
