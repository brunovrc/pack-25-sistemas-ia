---
name: b2b-portal-domain
description: Use ao tocar em empresas clientes, usuários de cliente, solicitações, entregas, comunicados ou no vocabulário do portal.
---

# Domínio do Portal B2B

- Dois níveis: **prestadora** (`organizations` do Core, equipe em `organization_members`) e **empresa cliente** (`client_accounts`, usuários em `client_members`). Usuário de cliente **nunca** vira `organization_member`.
- Vocabulário pt-BR fixo: solicitação (SOL-0001), situação (aberta, em análise, em andamento, aguardando cliente/prestadora, concluída, cancelada), entrega (rascunho → pronta → publicada → recebimento confirmado), comunicado, nota interna. O cliente vê «Aguardando você» / «Aguardando a equipe» (`CLIENT_STATUS_LABELS`).
- Prazo tem tipo: `policy` (SLA em horas úteis), `agreed`, `estimate`; toda mudança deixa evento e motivo.
- Fora do escopo (não implemente): ERP, fiscal, cobrança/gateway, assinatura certificada, chat omnichannel, WhatsApp automático, CRM comercial, RAG.
- Escreva em solicitações, comentários, documentos, entregas, comunicados e convites **só pelas funções `pt_*`**.
