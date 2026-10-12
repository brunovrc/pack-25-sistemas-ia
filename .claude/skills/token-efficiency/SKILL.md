---
name: token-efficiency
description: Reduz custo por tarefa concluída com testes por leitura seletiva e execução determinística, sem cortar testes, autorização ou revisão de licença. Use em sessões longas ou em repositórios grandes.
---

# token-efficiency

- Meta: menor custo por tarefa **concluída e testada**, não menos tokens por interação.
- Localizar antes de ler: buscar nomes/símbolos, abrir só intervalos úteis; resumir logs ao erro decisivo.
- Trabalhar por sistema e feature; varrer as 25 pastas só ao mudar contrato global.
- Preferir script determinístico a pedir ao modelo repetir operação (ex.: `generate-systems`, `validate-catalog`).
- Depurar com hipótese: executar primeiro o teste afetado; suíte completa na liberação.
- Sessão nova por feature longa, com `memory-handoff`.
- Nunca cortar: teste RLS, autorização, revisão de licença, checagem de segurança.
- Registrar em `docs/DEVELOPMENT_METRICS.md` somente o que foi medido; senão "não medido".
