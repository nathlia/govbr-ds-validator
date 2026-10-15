<!--
URL: https://www.gov.br/ds/components/upload?tab=designer
Aba: designer
Data de acesso: 2026-10-15
Fonte oficial congelada: design
Commit: 107c64a4ca016b0e37e4d9d8d74de3377d3b8293
Caminho-fonte: ds/componentes/upload/upload.md
Status da coleta: ok
-->

# *Upload* (Envio de Arquivos)

*Upload* é um componente que permite ao usuário selecionar um ou mais arquivos e os enviar por meio de um servidor de aplicação.

## Uso

![Imagem ilustra o componente upload.](imagens/upload-diretriz.png)
*Exemplo do componente Upload.*

O componente *Upload* é geralmente usado dentro de formulários, mas pode eventualmente ser também utilizado como um componente isolado.

---

## Tom e voz

O texto do *placeholder* e o ícone ilustrativo (fa-upload) são únicos e não podem ser alterados. Já o texto do *label* deve ser claro, objetivo e informativo seguindo o seguinte padrão: "Envio de arquivos", "Envio de vídeos", "Envio de imagens", "Envio de documentos" e assim por diante. Se houver algum motivo especial que justifique a alteração desse padrão a equipe de design responsável pelo *Design System* deverá ser consultada.

---

## Anatomia

A seguir é ilustrada a relação de componentes utilizados na construção do componente *upload*.

| ID  | Nome                               |                          Referência                           | Uso         |
| --- | ---------------------------------- | :-----------------------------------------------------------: | ----------- |
| 1   | *Label* ou rótulo                  |  [Fundamento Tipografia](/ds/fundamentos-visuais/tipografia)  | Opcional    |
| 2   | Superfície (Área de Transferência) |  [Fundamento Superfície](/ds/fundamentos-visuais/superficie)  | Obrigatório |
| 3   | Ícone Subir Arquivo/*Upload*       | [Fundamento Iconografia](/ds/fundamentos-visuais/iconografia) | Opcional    |
| 4   | *Placeholder*                      |  [Fundamento Tipografia](/ds/fundamentos-visuais/tipografia)  | Opcional    |
| 5   | *Message*                          |   [Componente Message](/ds/components/message?tab=designer)   | Opcional    |
| 6   | *List*                             |      [Componente List](/ds/components/list?tab=designer)      | Opcional    |
| 7   | Texto auxiliar                     |  [Fundamento Tipografia](/ds/fundamentos-visuais/tipografia)  | Opcional    |
| 8   | *Loading*                          |   [Componente Loading](/ds/components/loading?tab=designer)   | Opcional    |

![Imagem de anatomia do componente upload.](imagens/upload-anatomia-upload.png)
*Anatomia do Upload.*

![Imagem que ilustra o uso do componente loading junto com o componente upload.](imagens/upload-anatomia-upload-loading.png)
*Anatomia do componente upload com componente Loading.*

---

## Comportamentos

### 1. Adição de Arquivos

O componente *upload* serve para o usuário enviar arquivos solicitados pelo sistema e isto pode ser realizado de duas maneiras distintas:

1. Clicando no componente para acessar a janela de arquivos do sistema operacional;

2. Arrastando os arquivos diretamente para a superfície (área de transferência) do componente.

Neste último caso, a cor da borda do componente muda para verde quando o usuário arrasta o *mouse* (*dragging*) com os arquivos selecionados corretamente para a área tracejada. Veja a figura a seguir:

![Imagem ilustrando a mudança da cor do componente para verde, ao se transferir arquivos para a área de transferência.](imagens/upload_transferencia.png)
*Uso do estado Dropzone.*

Se o usuário soltar os arquivos na área correta (ou se ele clicar na área tracejada e selecionar os arquivos desejados) o processo de transferência se inicia e o ícone de *loading* é mostrado durante o tempo de transferência dos arquivos.

![A imagem ilustra o processo de transferência de três arquivos.](imagens/upload_loading.png)
*Três arquivos estão sendo transferidos e mostrado um Loading por arquivo.*

Após a conclusão da transferência, uma lista com os nomes dos arquivos e seus respectivos tamanhos é disponibilizada logo abaixo do componente *upload*.

![A imagem mostra uma lista de aquivos transferidos. Para cada aquivos é mostrado o nome, o tamanho do arquivo e um ícone de lixeira para excluí-lo.](imagens/upload_arquivos_enviados.png)
*Lista de arquivos adicionados no upload.*

**Atenção:** a lista permite que o usuário possa excluir os arquivos que desejar antes que sejam submetidos para o servidor. O usuário pode ainda clicar no nome do arquivo para abri-lo no seu sistema operacional.

### 2. Selecionar ou Arrastar arquivos

O componente *upload* deve disponibilizar o recurso de arrastar arquivos. Esta funcionalidade deve ser informada ao usuário na mensagem abaixo do campo.

![Exemplo do uso do texto auxiliar para informar ao usuário quando o componente aceita que os arquivos possam ser arrastados para a área de transferência.](imagens/upload-comportamento-label.png)
*Exemplo de uso do texto auxiliar.*

### 3. Mensagem de erro

Nos casos em que os arquivos não atendam aos requisitos desejados uma mensagem de erro é apresentada ao usuário.

![Exemplo do uso do componente message.](imagens/upload_mensagem.png)
*Uso do componente message no upload.*

Se o usuário mover ou selecionar vários arquivos e um deles não estiver de acordo com o requisito, uma mensagem de erro é apresentada para este arquivo. Os arquivos que estiverem válidos serão aceitos normalmente.

![Exemplo de arquivo recusado pelo componente upload. Uma mensagem de erro é apresentada ao usuário.](imagens/upload_mensagem-1.png)
*Mensagem de erro para um arquivo específico.*

**Atenção:** qualquer tipo de erro como: formato inválido, tamanho excessivo, envio não concluído, etc, deverá ser tratado com *feedbacks* de mensagens do sistema (consultar diretrizes desse componente).

### 4. Truncamento de texto

Nos casos em que o nome do arquivo seja maior que o espaço destinado a ele, deve-se truncar a parte do nome que exceda o espaço definido.

Veja a imagem a seguir:

![Esta imagem apresenta exemplos de nomes de aquivos muito grandes e por isso, truncados.](imagens/upload-truncamento.png)
*Nomes dos arquivos são truncados quando forem maiores que o espaço disponível.*

**Atenção:** é recomendável o uso de *tooltips* para apresentar ao usuário o texto completo que foi truncado.

![Esta imagem apresenta um exemplo de uso de tooltip para mostrar ao usuário o nome completo do arquivo truncado.](imagens/upload-truncamento-tooltip.png)
*Use o componente tooltip para mostrar o nome completo do arquivo truncado.*

### 5. Envio de 1 arquivo

Se o *site*/sistema permitir o envio de apenas um único arquivo, o *label* do componente deverá ser alterado para *"Envio de arquivo"* e o *placeholder* para *"Selecione o arquivo"* (ou variações).

![Esta imagem ilustra a mudança do texto do placeholder para quando se é permitido o envio de apenas um arquivo para upload.](imagens/upload-comportamento-umarquivo.png)
*Textos do label e placeholder alterados.*

Nesse caso, o usuário não conseguirá selecionar mais de um arquivo para ser enviado. Se arrastar mais de um arquivo, o componente não aceitará a ação e retornará uma mensagem ao usuário deixando claro que só será permitido realizar *upload* de um único arquivo.

![Imagem coom exemplo de mensagem de erro.](imagens/upload_mensagem-2.png)
*Exemplo de erro.*

**Atenção:** se o usuário já enviou um arquivo para a lista e tentar enviar outro, o arquivo mais recente substituirá o mais antigo. Uma mensagem de alerta do sistema deve manter o usuário informado sobre este comportamento.

![Imagem coom exemplo de substituição de mensagem.](imagens/upload_mensagem-3.png)
*Neste exemplo o "arquivo_do_usuario_v01" foi substituído pelo "arquivo_do_usuario_v02" mais recente.*

### 6. Resolução de 4 colunas

Em resoluções maiores que 4 colunas o componente *Upload* não sofre qualquer transformação, mas ao se atingir a resolução de 4 colunas o componente *Upload* terá sua largura adequada para esta resolução de tela.

![A imagem mostra o componente upload com a largura ajustada para uma resolução de quatro colunas.](imagens/upload-anatomia-upload-4colunas.png)
*Largura do componente upload sendo ajustada.*

![A imagem ilustra o comportamento do componente upload em responsividades de oito e quatro colunas.](imagens/upload-comportamento-responsividade.png)
*Comparação da aplicação do upload em diferentes Grids.*

Nestes tipos de dispositivos, não há o recurso de arrastar arquivo, portanto, a única forma do usuário enviar arquivos é por meio do clique no componente *upload* (ou toque, nos casos de dispositivos *mobile*).

---

## Especificações

### Tipografia

| Name          | Size Token               | Weight Token              | Text-transform | Outros Estilos       |
| ------------- | ------------------------ | ------------------------- | -------------- | -------------------- |
| *Label*       | `--font-size-scale-base` | `--font-weight-semi-bold` | uppercase      | -                    |
| *Placeholder* | `--font-size-scale-base` | `--font-weight-regular`   | uppercase      | `font-style:` italic |

### Iconografia

| Name          | ícone                            | Size Token       | Class (Font Awesome) |
| ------------- | -------------------------------- | ---------------- | -------------------- |
| Ícone Upload  | <i class="fas fa-upload"></i>    | `--icon-size-lg` | fa-upload            |
| Ícone Excluir | <i class="fas fa-trash-alt"></i> | `--icon-size-sm` | fa-trash-alt         |

### Cor

| Name                        | Property         | Color Token             |
| --------------------------- | ---------------- | ----------------------- |
| *Label*                     | text color       | `--gray-80`             |
| *Placeholder*               | text color       | `--blue-warm-vivid-70`  |
| Ícone Upload                | icon             | `--blue-warm-vivid-70`  |
| Ícone Excluir               | icon             | `--blue-warm-vivid-70`  |
| *container*                 | background-color | `--pure-0`              |
| *container* (borda)         | background-color | `--blue-warm-vivid-70`  |
| *container* (borda-sucesso) | background-color | `--green-cool-vivid-50` |

### Dimensões

| Name       | Property | Value |
| ---------- | -------- | ----- |
| Superfície | width    | 550px |

### Espaçamento

| Name           | Property                     | Value                  |
| -------------- | ---------------------------- | ---------------------- |
| Superfície     | padding-left / padding-right | `--spacing-scale-2x`   |
| Superfície     | padding-top / padding-bottom | `--spacing-scale-base` |
| Superfície     | margin-bottom                | `--spacing-scale-base` |
| Message        | margin-bottom                | `--spacing-scale-base` |
| Texto Auxiliar | margin-bottom                | `--spacing-scale-base` |
| Ícone Upload   | margin-right                 | `--spacing-scale-2x`   |
| *Placeholder*  | margin-left                  | `--spacing-scale-half` |
| *Loading*      | margin-top                   | `--spacing-scale-base` |

### Superfície

| Name       | Property | Value                        |
| ---------- | -------- | ---------------------------- |
| Superfície | border   | `--surface-border-dashed-sm` |

![Imagem com algumas medidas para ajudar os desenvolvedores.](imagens/upload-detalhamento.png)
*Imagem de apoio para a especificação.*
