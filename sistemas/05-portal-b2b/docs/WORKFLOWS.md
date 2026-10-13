# WORKFLOWS — Portal de Clientes B2B

## Solicitação
```
            ┌─────────────── cliente cancela (só aberta/em análise) ───────────────┐
            ▼                                                                      │
 aberta ──► em análise ──► em andamento ──► concluída ──► (reabrir) ──► aberta     │
   │            │              │  ▲   ▲                                              │
   │            │              ▼  │   │                                              │
   └────────────┴────► aguardando cliente ◄──► aguardando prestadora ───────────────┘
                              (qualquer situação aberta ──► cancelada: definitivo)
```
**Fonte única:** `private.pt_transition_ok(quem, de, para)` no banco; `lib/portal/workflow.ts` é só o espelho da interface e `62_pt_workflow.sql` prova a regra.

| Quem | Pode |
|---|---|
| Equipe (escrita) | qualquer mudança, **exceto**: voltar a «aberta» (só a reabertura de uma concluída), sair de «cancelada» (final) |
| Cliente | **cancelar** enquanto estiver «aberta» ou «em análise»; **reabrir** uma concluída dentro da janela (`reopen_window_days`, padrão 15 dias, contada da conclusão) |

Regras: **cancelar exige motivo**; **reabrir exige motivo**; cada mudança grava uma linha **imutável** no histórico (de, para, quem, motivo, quando). Quando o cliente **responde** numa solicitação «aguardando cliente», ela passa sozinha a «aguardando prestadora» (a bola volta para a equipe) e a equipe é avisada.

## Prazo (SLA em horas úteis)
- Cada prioridade tem uma política (padrão: baixa 80 h, normal 40 h, alta 16 h, urgente 4 h — **horas úteis**, editáveis em *Configurações do portal*).
- O prazo da política = abertura + N horas úteis, calculado por `pt_add_business_hours` no **fuso** do portal, nos **dias** e **horário de expediente** configurados (padrão: segunda a sexta, 9h–18h). Fora do expediente, a contagem começa na próxima abertura.
- **Prazo combinado** ou **estimativa** (só gestão) substituem o da política, exigem **motivo** e não podem estar no passado. Trocar a prioridade **recalcula** apenas prazos de política; combinados não mudam.
- Cada mudança de prazo grava um evento (`request_deadline_events`): tipo, alvo, motivo, quem, e se o prazo foi **estourado** ao concluir.
- **Feriados não são considerados** (limite conhecido): para um feriado, use um prazo combinado.
- Avisos de prazo próximo e vencido: rotina `pt_refresh`, **idempotente** (uma notificação por solicitação e prazo), disparada ao abrir o painel pela gestão. Em produção, agende `select private.pt_refresh_all()` com pg_cron (ex.: a cada 15 min): roda como dono do banco, sem usuário, para todas as organizações.

## Entrega
`rascunho ⇄ em preparação ⇄ pronta ──► publicada ──► recebimento confirmado` (e «cancelada» a partir de qualquer uma, exceto a confirmada). **Só se publica a partir de «pronta».** Publicar exige ao menos um arquivo ou uma descrição, **libera os arquivos vinculados** ao cliente, grava quem publicou e quando, e avisa a empresa. Só o **cliente** confirma o recebimento (grava quem e quando; a equipe é avisada). Rascunho é invisível ao cliente.

## Comentários
Compartilhado (cliente e equipe veem) ou **interno** (só equipe). Imutáveis: não se edita nem apaga comentário. Anexos herdam a visibilidade do comentário: arquivo anexado a nota interna fica interno.

## Comunicados
Para todos os clientes ou só os escolhidos. Publicação imediata ou **agendada**, com **expiração**. Quem entra no público é fixado na publicação; os avisos saem uma vez por empresa (`pt_refresh` envia os agendados quando chega a hora). Comunicado expirado ou arquivado some do portal.

## Convites
Equipe: só administrador convida colega. Empresa: administrador e gestor da prestadora, ou o administrador da própria empresa. Fluxo: gerar → copiar o link **uma vez** → o convidado entra (ou cria conta) com o **mesmo e-mail** → abre o link → aceita. Detalhes e ameaças em `PERMISSIONS.md`.

## Notificações internas
Tipos: nova solicitação, atribuição, mudança de situação, novo comentário, reabertura, prazo próximo/vencido, entrega publicada/confirmada, documento compartilhado, comunicado, convite aceito. **Deduplicadas** por chave; cada usuário pode **silenciar tipos**; **nunca** vão para usuário desativado. Não há e-mail transacional neste MVP: o aviso é interno.
