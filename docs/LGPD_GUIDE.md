# LGPD_GUIDE — Privacidade por projeto (Lei nº 13.709/2018)

> **Aviso:** este guia orienta a engenharia e a implantação. **Não é parecer jurídico.** Antes de comercializar o pack e antes de cada implantação, revise com advogado/encarregado. Normas e prazos da ANPD mudam: confira a versão vigente.

## 1. Papéis
- **Controlador:** a empresa que implanta o sistema e decide as finalidades (o comprador do pack ou o cliente dele).
- **Operador:** quem trata dados em nome do controlador (ex.: o implantador que hospeda para o cliente; provedores de nuvem e de IA como suboperadores).
- **O pack é software**: o vendedor do pack não acessa dados dos sistemas implantados. Deixar isso explícito em `LICENSE.md`.
- **Encarregado (DPO, art. 41):** o controlador designa e divulga o contato.

## 2. O que o software entrega (engenharia)
| Obrigação | Recurso no produto |
|---|---|
| Direitos do titular (art. 18) | Tabela `privacy_requests` (tipos: confirmação, acesso, correção, anonimização/eliminação, portabilidade, informação de compartilhamento, revogação de consentimento) com prazo padrão de 15 dias (art. 19, II), status e auditoria. Interface no Core web. |
| Minimização (art. 6º, III) | Campos pessoais só quando necessários; auditoria registra nomes de colunas, não valores; logs sem PII. |
| Segurança (art. 46) | `docs/SECURITY_STANDARD.md`. |
| Registro das operações (art. 37) | Modelo `ROPA` por sistema (a produzir com cada sistema). |
| Relatório de impacto (art. 38) | Modelo `RIPD` para sistemas de risco **alto**. |
| Retenção e eliminação (art. 15–16) | Política configurável por entidade + rotina de eliminação/anonimização documentada. |
| Incidentes (art. 48) | Plano de resposta (§7) e trilha de auditoria. |

## 3. Bases legais (art. 7º) — o controlador escolhe por finalidade
Execução de contrato · legítimo interesse (exige teste de balanceamento documentado) · consentimento (específico, destacado, revogável, com registro de data e texto aceito) · obrigação legal. **Não** usar consentimento como atalho genérico. Marketing e disparo: consentimento ou legítimo interesse bem justificado; os sistemas do pack não fazem disparo em massa.

## 4. Dados sensíveis e de crianças
- **Sensíveis (art. 11):** saúde, biometria, origem racial etc. Sistema `23-academias` (medidas, condições de saúde) exige base legal específica, acesso restrito por papel, criptografia de campo para dados de saúde e RIPD.
- **Crianças e adolescentes (art. 14):** sistema `24-escolas` — tratamento no melhor interesse do menor, consentimento específico de um dos pais/responsável, linguagem clara, mínimo necessário.
- Documentos de identidade e renda (`21-crm-imobiliario`, `15-contratos`, `06-financeiro`): armazenar o mínimo, bucket privado, acesso auditado, retenção definida.

## 5. Risco LGPD por sistema (do catálogo)
**Alto:** 06 financeiro, 15 contratos, 21 crm-imobiliario, 23 academias, 24 escolas → RIPD + criptografia de campos críticos + revisão jurídica obrigatória antes do uso.
**Médio:** 01, 02, 03, 04, 05, 09, 10, 11, 12, 13, 17, 18, 20, 22, 25 → ROPA e bases legais documentadas.
**Baixo:** 07, 08, 14, 16, 19 → dados pessoais mínimos (contatos de equipe/fornecedores).

## 6. Transferência internacional (art. 33) e hospedagem
Preferir região **Brasil (ex.: São Paulo)** para banco e Storage quando o provedor oferecer. Provedores de hospedagem, e-mail e IA podem tratar dados fora do país: o controlador precisa de base para a transferência (ex.: cláusulas contratuais) e deve listar os suboperadores. Para IA, enviar apenas o necessário e mascarar dados pessoais (ver `SECURITY_STANDARD.md` §10).

## 7. Incidente de segurança (art. 48)
1. Conter e preservar evidências (logs, `audit_log`). 2. Avaliar risco ou dano relevante aos titulares. 3. Comunicar **ANPD e titulares** em prazo razoável — a regulamentação vigente da ANPD (Resolução CD/ANPD nº 15/2024) fixa **3 dias úteis** para a comunicação em casos de risco relevante; **confirme a norma atual**. 4. Registrar causa, impacto e correção. 5. Revisar controles.

## 8. Retenção (modelo)
Definir por entidade: finalidade → prazo → ação ao fim (eliminar ou anonimizar). Exemplos de ponto de partida a validar juridicamente: leads sem interação (eliminar após período definido), logs técnicos (curto), registros financeiros e contratuais (prazos legais fiscais/civis aplicáveis).

## 9. Checklist de implantação (comprador)
- [ ] Controlador, encarregado e canal do titular definidos e publicados · [ ] Bases legais por finalidade · [ ] ROPA/RIPD conforme risco
- [ ] Política de privacidade e aviso de cookies/analytics ajustados ao uso real · [ ] Contratos com operadores/suboperadores
- [ ] Região de hospedagem e transferência internacional avaliadas · [ ] Backup e restauração testados · [ ] Plano de incidentes
- [ ] Dados reais **nunca** em ambiente de demonstração · [ ] Retenção e eliminação configuradas
