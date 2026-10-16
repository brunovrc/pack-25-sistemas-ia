---
name: commission-domain
description: Use ao mexer em qualquer regra de comissão: vocabulário, estados e invariantes do domínio.
---

# commission-domain

- Estados separados: **calculado ≠ aprovado ≠ pago**. O motor só calcula; aprovação, fechamento e pagamento são RPCs próprias.
- Livro imutável (`commission_entries`): corrija com estorno/ajuste que referencia o original. Nunca `update`/`delete`.
- Plano fixado por participante na confirmação da venda (`sale_participants.plan_version_id`). Versão publicada é imutável.
- Sem folha, encargos nem pagamento bancário: pagamento é só **registro**.
- Leia `docs/COMMISSION_ENGINE.md` e `docs/DECISIONS.md` antes de propor mudança.
