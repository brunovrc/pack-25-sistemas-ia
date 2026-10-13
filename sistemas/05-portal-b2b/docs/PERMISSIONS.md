# PERMISSIONS — Portal de Clientes B2B

A matriz abaixo é implementada **no banco** (RLS + funções `pt_*`). A interface só esconde o que o papel não pode usar; quem decide é o Postgres. Cada linha tem teste em `supabase/tests/61_pt_access.sql` e/ou nos E2E de segurança.

## Quem é quem
| Camada | Papel | Onde mora | Observação |
|---|---|---|---|
| Prestadora | `owner`, `admin` (administrador) | `organization_members` | MFA (AAL2) obrigatório |
| Prestadora | `manager` (gestor) | `organization_members` | vê todas as empresas |
| Prestadora | `member` (colaborador) | `organization_members` | vê só as empresas em que é **gestor da conta** ou tem **solicitação atribuída** |
| Prestadora | `viewer` (leitor) | `organization_members` | só lê (todas as empresas) |
| Empresa cliente | `client_admin` | `client_members` | gerencia os usuários da própria empresa |
| Empresa cliente | `client_user` | `client_members` | abre e acompanha solicitações, recebe entregas |

Usuário de cliente **nunca** entra em `organization_members`: assim nenhuma política da equipe o alcança por engano. A conta do cliente só vale se `client_members.status = 'active'`, `client_accounts.status = 'active'` e a empresa não está arquivada; basta uma dessas condições falhar para o acesso cair **na hora** (a sessão não precisa expirar).

## O que cada um faz
| Ação | Admin | Gestor | Colaborador | Leitor | Cliente admin | Cliente usuário |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Ver empresas | todas | todas | só as suas | todas | a própria | a própria |
| Cadastrar/editar empresa | ✔ | ✔ | — | — | — | — |
| Arquivar/restaurar empresa | ✔ | ✔ | — | — | — | — |
| Observações internas da empresa | ler/gravar | ler/gravar | ler/gravar (suas) | ler | **nunca** | **nunca** |
| Abrir solicitação | ✔ | ✔ | ✔ (suas empresas) | — | ✔ (própria, sem «urgente») | ✔ (própria, sem «urgente») |
| Atribuir/editar solicitação | ✔ | ✔ | ✔ (só atribui a si mesmo se estiver sem responsável) | — | — | — |
| Definir prazo combinado/estimativa | ✔ | ✔ | — | — | — | — |
| Mudar situação | todas as transições | todas | todas | — | só cancelar (aberta/em análise) e reabrir (janela) | idem |
| Comentário compartilhado | ✔ | ✔ | ✔ | — | ✔ | ✔ |
| **Nota interna** | ✔ | ✔ | ✔ | — | **nunca** | **nunca** |
| Ver nota interna | ✔ | ✔ | ✔ | ✔ | **nunca** | **nunca** |
| Enviar documento | ✔ | ✔ | ✔ | — | ✔ (sempre compartilhado) | ✔ (idem) |
| Alterar visibilidade de documento | ✔ | ✔ | ✔ | — | — | — |
| Arquivar documento/pasta | ✔ | ✔ | — | — | — | — |
| Ver/baixar documento | todos | todos | os das suas empresas | todos | só **compartilhados** e não arquivados | idem |
| Ver trilha de acessos | ✔ | ✔ | — | — | — | — |
| Criar/publicar entrega | ✔ | ✔ | ✔ | — | — | — |
| Confirmar recebimento | — | — | — | — | ✔ | ✔ |
| Publicar comunicado | ✔ | ✔ | — | — | — | — |
| Convidar equipe | ✔ | — | — | — | — | — |
| Convidar usuário de empresa | ✔ | ✔ | — | — | ✔ (própria) | — |
| Ativar/desativar/mudar papel de usuário de empresa | ✔ | ✔ | — | — | ✔ (própria; nunca o último administrador) | — |
| Configurações do portal, SLA, categorias | ✔ | — | — | — | — | — |
| Painel e indicadores | por escopo | por escopo | por escopo | por escopo | só a própria empresa | idem |
| Exportar CSV (relatórios) | ✔ | ✔ | — | — | — | — |

## Camadas de defesa (da mais forte para a mais fraca)
1. **RLS em todas as tabelas** (`revoke all` + `grant select` mínimo; escrita por coluna ou só por função).
2. **Funções `SECURITY DEFINER`** com `set search_path = ''`: `private.pt_actor(client)` decide se quem chama é `staff` ou `client` e exige MFA onde cabe.
3. **Chaves compostas** `(id, organization_id, client_account_id)`: um comentário/anexo/entrega só pode apontar para a mesma empresa — o banco recusa a combinação cruzada.
4. **Storage**: bucket privado; políticas em `storage.objects` exigem caminho `<org>/<empresa>/<uuid>` e vínculo do usuário com a empresa.
5. **Aplicação**: `requireContext`/`requirePortalContext` revalidam sessão, MFA, conta ativa e papel em **toda** página, ação e rota; a conta ativa vem de cookie mas é sempre conferida.
6. **Interface**: esconde o que o papel não pode usar.

## Convites
Token de 32 bytes aleatórios (`base64url`); o banco guarda `sha256(token)` e a coluna do hash nem é legível pelo cliente da API. Vale 7 dias, uso único, **só para o e-mail convidado** (comparado ao e-mail da conta que aceita). Qualquer falha (token errado, expirado, revogado, já usado, e-mail diferente) devolve a **mesma mensagem**: «convite inválido ou expirado». Aceitar tem limite de tentativas por usuário.

## Mapa de ameaças e testes
| # | Ameaça | Defesa | Prova |
|---|---|---|---|
| 1 | Cliente A lê solicitação/comentário/documento do cliente B | RLS por empresa | E2E «1–3», SQL 61 |
| 2 | Cliente adivinha o ID de um documento da outra empresa | `pt_document_access` + 404 uniforme | E2E «8–10» |
| 3 | Cliente lê nota interna ou documento interno da própria empresa | RLS por visibilidade | E2E, SQL 61/63 |
| 4 | Cliente escreve direto nas tabelas / muda situação por fora | sem `grant` de escrita; só funções | E2E «4–7» |
| 5 | Cliente publica entrega, atribui, conclui, escreve nota interna | `pt_transition_ok` e `pt_actor` | SQL 62, E2E |
| 6 | Leitor da equipe escreve | funções exigem papel de escrita | SQL 61, E2E |
| 7 | Convite reutilizado, vencido, revogado ou de outro e-mail | hash + uso único + e-mail + mensagem uniforme | SQL 62, E2E convites |
| 8 | Arquivo malicioso com extensão/Content-Type falsos | assinatura (magic bytes) + lista fechada de tipos | unitário, E2E |
| 9 | Envio para a pasta de outra empresa / caminho forjado | política do bucket + `pt_document_register` valida o caminho | E2E, SQL 63 |
| 10 | Usuário desativado ou empresa arquivada continua com acesso | vínculo ativo conferido em cada consulta | SQL 61, E2E «11–14» |
| 11 | Sessão sem MFA acessa funções de administrador | `private.mfa_ok()` + políticas restritivas | SQL 61 |
| 12 | Vazamento de `service_role`/segredo | o app não usa a chave; varredura de pacotes JS | E2E (Core), `check-no-secrets` |

## Limites conhecidos
- Colaborador vê uma empresa por **vínculo** (gestor da conta ou solicitação atribuída). Se tirar a atribuição, perde o acesso a ela, inclusive aos documentos.
- O leitor (`viewer`) enxerga todas as empresas por desenho (papel de auditoria/consulta).
