---
name: csv-import-validation
description: Use ao mexer em importação/exportação CSV.
---

# csv-import-validation

- Entrada: recusa binário/ZIP, limite de linhas e células, prévia antes de gravar, erro por linha, duplicidade nunca silenciosa. Arquivo não é retido (LGPD).
- Saída: `;` + BOM; células iniciadas por `= + - @` ganham apóstrofo; exportação auditada sem valores.
- Código: `lib/commissions/{csv,import-core,importer}.ts`; E2E: `tests/e2e/cm-import-security.spec.ts`.
