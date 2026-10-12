---
name: domain-workflow
description: Modela estados, transições, auditoria e regras comerciais de um módulo do Pack (pipeline, OS, pedidos, parcelas). Use ao projetar qualquer fluxo com status.
---

# domain-workflow

1. Listar entidades, cardinalidades e o ciclo de vida de cada uma.
2. Definir a máquina de estados: estados, transições permitidas, quem pode executar cada uma (papel) e efeitos colaterais.
3. Impor transições no banco (constraint/trigger/função) além da Server Action; transição inválida deve falhar.
4. Onde houver valor ou saldo: lançamento imutável + estorno; operação composta em transação; chave de idempotência contra double-submit.
5. Registrar o que precisa de auditoria e o que NÃO pode ir ao log (PII).
6. Escrever testes: transição válida, inválida, concorrência/duplo envio, papel sem permissão.
Saída: diagrama de estados (texto) em `docs/DATA_MODEL.md` e casos de teste em `docs/FEATURES.md`.
