# Proveniência do corpus literal (2026-10-15)

- **Coletor:** `../govbr-ds-3.7.0-coletor/coletar_govbr_ds_3_7_0.py`, escrito pelo GPT a pedido da autora. Lido por
  inteiro antes de rodar: só faz GET na API de arquivos do GitLab (commits fixos) e na página oficial do e-MAG, e
  grava os arquivos aqui. Rodado em venv isolado, com `--access-date 2026-10-15`.
- **Resultado:** 126 `.md`. São 124 `ok` e 2 ausentes na fonte: a aba de acessibilidade do accordion e a do scrim.
  `MANIFEST.json` sha256 `f211b83f2a0c931a2a92ae7767999b3a1b4efd1af5c45cea546910bd5f8ff77c`.
- **O que os commits fixados são, de fato** (conferido na API do GitLab em 2026-10-15). Nenhum deles é uma tag
  `3.7.0` exata; são o conteúdo que o site v3 publica hoje:
  - **core** (projeto 34516385) `20173bf2…` = tag **v3.7.0 + 11 commits**, só de documentação (último em
    2026-01-05). A tag não tem nada além disso.
  - **design/diretrizes** (projeto 35215527) `107c64a4…` = tag **v3.6.1 + 10 commits** (correção de links, último
    em 2026-09-30). Esse repositório não tem tag 3.7.x: as diretrizes publicadas junto do core 3.7.0 são estas.
  - **site-content** (projeto 45285709) `953ea2f3…`, 2026-09-30.
- **Como citar:** "texto publicado em gov.br/ds (DS 3.7.0), fontes oficiais nos commits acima, acesso em
  15/10/2026". Não é "a tag 3.7.0".
- **Conferência pontual:** `componentes/input__acessibilidade.md` contém, literalmente, as recomendações coladas
  pela autora ("ajuda contextual", "feedback visual imediato"). `emag/…md` contém a 6.6 com "automaticamente
  detectado".
- **Próximo passo:** normalizar este corpus em regras, como versão nova da base (D-119). As campanhas antigas não
  são reanalisadas com ela.
