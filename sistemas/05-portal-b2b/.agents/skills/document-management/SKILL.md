---
name: document-management
description: Use ao tocar em upload, download, pastas, visibilidade, URLs assinadas ou trilha de acessos.
---

# Documentos

- Bucket privado; caminho `<org>/<empresa>/<uuid>`, nunca o nome do arquivo. Cliente não escolhe a empresa nem a visibilidade (sempre compartilhado).
- Envio: `POST /api/documents` confere sessão, limite, **tipo real pelos bytes** (`lib/portal/uploads.ts`), envia com a sessão do usuário e registra com `pt_document_register`; se falhar, remove o órfão.
- Download: `pt_document_access` autoriza E registra na trilha ANTES de existir a URL assinada de 60 s. Qualquer recusa = 404 igual.
- Tornar interno/arquivar tira o acesso na hora. A trilha é imutável.
- Limites: sem antivírus; lista fechada (pdf, docx, xlsx, png, jpeg, txt). Mudou a lista? Atualize `uploads.ts`, o `check` de `documents.mime_type`, o bucket e os testes.
- O limite de corpo do proxy está em `next.config.ts` (`proxyClientMaxBodySize`); sem ele, envios > 10 MB são truncados.
