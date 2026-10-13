# DOCUMENTS — compartilhamento seguro de arquivos

O ponto mais sensível do produto: **um arquivo de uma empresa nunca pode chegar a outra**, e o que é interno nunca chega ao cliente.

## Modelo
- Bucket **privado** `portal-documents`. Caminho do objeto: `<organização>/<empresa>/<uuid>` — **nunca** o nome do arquivo (o nome original fica só no banco, sem barras ou caracteres de controle).
- Cada documento tem `visibility`: **interno** (só equipe) ou **cliente** (compartilhado). Pastas também têm visibilidade: pasta interna força documentos internos. Documento enviado pelo cliente é **sempre** compartilhado (o servidor e o banco forçam).
- Arquivar esconde do cliente; o registro e a trilha ficam.

## Envio (`POST /api/documents`)
1. Sessão válida (equipe ou cliente), com a mesma checagem de MFA das páginas; limite de 30 envios por 10 min por usuário.
2. **Limite de tamanho** configurável (`doc_max_mb`, 1–50 MB; padrão 20): recusa cedo pelo cabeçalho e confere de novo o tamanho real.
3. **Tipo real pelos bytes** (`lib/portal/uploads.ts`): PDF, PNG, JPEG, texto UTF-8 sem bytes de controle, DOCX e XLSX (ZIP com a estrutura do Office). O `Content-Type` e a extensão **não** valem: executável renomeado para `.pdf`, HTML com extensão `.png` e Word com extensão `.xlsx` são recusados (HTTP 415).
4. O cliente **não escolhe a empresa**: o servidor usa a conta ativa dele (o campo enviado é ignorado).
5. O objeto vai ao Storage **com a sessão do usuário**, sob a política do bucket (caminho no formato correto e vínculo do usuário com a empresa).
6. `pt_document_register` valida de novo (caminho `<org>/<empresa>/<uuid>`, tamanho, lista de tipos, visibilidade, pasta e vínculos) e grava o registro e a primeira linha da trilha.
7. Se o registro falhar, o objeto recém-enviado é **removido** (política `portal_docs_delete_orphan`: só o próprio autor, só enquanto não registrado).

## Download e visualização (`GET /api/documents/<id>?action=download|view`)
1. O banco decide (`pt_document_access`): equipe com acesso à empresa, ou cliente com documento **compartilhado e não arquivado**. A função **registra o acesso** na trilha (quem, quando, ação) e devolve o caminho.
2. Só então o servidor emite uma **URL assinada de 60 segundos** e redireciona o navegador. A URL não é guardada, nem exibida, nem repetida.
3. Documento de outra empresa, interno, arquivado, inexistente ou ID malformado: **a mesma resposta 404** (sem revelar se existe).
4. Tornar interno ou arquivar **tira o acesso na hora**: o próximo pedido já recebe 404 (coberto por E2E).

## Trilha de acessos
`document_access_logs` é imutável (gatilho impede alterar/apagar) e registra envio, visualização, download, mudança de visibilidade e arquivamento. Administrador e gestor a veem em *Documentos* e no relatório `acessos-documentos`. Para o titular dos dados: a trilha mostra **quem** acessou e **quando**.

## Limites conhecidos (seja honesto com o seu cliente)
- **Sem antivírus/antimalware.** A conferência por assinatura recusa o que *finge ser* outro tipo, mas não detecta vírus dentro de um PDF ou Office válidos. Para uso com terceiros desconhecidos, adicione varredura (por exemplo ClamAV ou o serviço do seu provedor) antes do registro.
- DOCX/XLSX são conferidos pela estrutura do ZIP, não por abertura completa do arquivo (macros e conteúdo ativo não são analisados; `.docm`/`.xlsm` não são aceitos).
- Quem recebe uma URL assinada válida (60 s) pode baixar o arquivo: não a compartilhe.
- O bucket usa a criptografia em repouso do provedor; criptografia ponta a ponta não faz parte do MVP.
- Cota e retenção: o sistema não apaga arquivos sozinho; defina a política de retenção com seu jurídico.
