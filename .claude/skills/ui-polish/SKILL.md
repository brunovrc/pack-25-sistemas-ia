---
name: ui-polish
description: Revisa e refina a interface B2B de um sistema do Pack (tokens, estados, acessibilidade, responsividade, screenshots). Use depois que o fluxo funciona e antes de marcar VALIDADO.
---

# ui-polish

Checklist, nesta ordem:
1. **Tokens:** cores, tipografia e espaçamento em variáveis CSS; white-label via `organization_settings`, sem alterar lógica.
2. **Estados:** vazio (com ação primária), carregando (skeleton), erro recuperável, sucesso, confirmação para ação destrutiva.
3. **Tabelas e formulários:** densidade legível, filtros, labels associados, mensagens de erro junto ao campo.
4. **Acessibilidade:** contraste WCAG AA, foco visível, navegação por teclado, `aria` onde necessário.
5. **Responsivo:** testar 360px e 1280px; mobile com navegação própria, não só encolhido.
6. **Dados de demonstração** identificados como fictícios. Capturar screenshots com Playwright e revisar.
Não copiar identidade visual de terceiros; registrar 1-2 referências em `docs/DECISIONS.md`.
