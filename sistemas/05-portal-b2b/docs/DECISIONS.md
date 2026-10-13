# DECISIONS — Portal de Clientes B2B

Registro de decisões do sistema (as do Pack estão em `docs/DECISIONS.md` do hub).

**D-1 Prestadora = organização do Core; empresa cliente = entidade própria.**
Reaproveita `organizations`/`organization_members` (equipe, MFA, auditoria) e cria `client_accounts` + `client_members`. Usuário de cliente **nunca** é `organization_member`: nenhuma política da equipe o alcança por engano, e nenhuma consulta de papel interno precisa excluí-lo.

**D-2 Regras de verdade no banco.**
Transições de estado, prazos, visibilidade, vínculos entre empresas, convites, arquivos e métricas ficam em funções SQL e RLS. A interface espelha só para esconder o que não cabe ao papel. É a única barreira que a API REST direta também respeita (os E2E atacam por ela).

**D-3 Colaborador vê uma empresa por vínculo.**
Gestor da conta ou solicitação atribuída. Equilibra «cada um vê o que trabalha» com simplicidade: sem tabela de carteiras. Contrapartida documentada: tirar a atribuição tira o acesso.

**D-4 Nota interna e observações internas ficam separadas do que o cliente lê.**
Comentário com `visibility = internal` e `client_internal_notes` (tabela própria sem política para o cliente). A tabela própria evita depender de uma coluna escondida por *grants*.

**D-5 SLA em horas úteis, sem feriados.**
`pt_add_business_hours` (dias e expediente configuráveis, fuso do portal) cobre o caso comum e é testável com valores à mão. Calendário de feriados exigiria dados regionais e manutenção; fica como limite documentado, e o prazo combinado resolve o caso pontual.

**D-6 Prazo tem tipo.**
`policy` (calculado), `agreed` (combinado) e `estimate` (estimativa) com motivo e histórico. Trocar a prioridade só recalcula o de política: não se desfaz um combinado por acidente.

**D-7 Convite: hash, e-mail, uso único, mensagem uniforme.**
O link é mostrado uma vez; o banco guarda `sha256(token)`. Aceitar exige conta com o mesmo e-mail. Toda falha responde igual (não revela se o convite existe). A página `/convite/<token>` é pública mas **não consulta o banco**.

**D-8 Arquivos: bucket privado, caminho opaco, URL assinada curta, trilha imutável.**
O nome nunca é caminho; o servidor confere o tipo pelos bytes; o banco autoriza e registra **antes** de a URL de 60 s existir; recusas são um 404 único. Sem antivírus no MVP (limite documentado).

**D-9 Envio por *route handler*, não Server Action.**
Server Actions têm limite de corpo pequeno e não dão controle fino de status/streaming. O handler valida, envia ao Storage com a **sessão do usuário** (a política do bucket vale) e registra; se falhar, remove o órfão. O limite de corpo do proxy (`proxyClientMaxBodySize`) foi elevado a 52 MB — sem isso o Next truncava envios acima de 10 MB (achado em teste).

**D-10 Painel único para equipe e cliente.**
As mesmas funções SQL (*security invoker*) servem os dois: o RLS restringe o que cada um soma. O cliente troca rótulos e perde os rankings internos. Um só código, uma só definição de cada número.

**D-11 White-label com folha de estilo do próprio domínio.**
Nome, mensagem e rodapé em `portal_settings`; cores via `/portal-theme.css` (validação `#RRGGBB`). Atende a CSP sem estilo em linha.

**D-12 Sem shadcn/ui.**
O Core já traz um kit de componentes próprio e acessível; adicionar shadcn criaria dois sistemas de componentes. Desvio justificado do prompt-mestre.

**D-13 Sem fila nem e-mail transacional no MVP.**
`pt_refresh` é idempotente e sob demanda (ou agendado pelo implantador); notificações são internas. Menos peças móveis e nenhum provedor de e-mail obrigatório.

**D-14 Exportações auditadas e só para a gestão.**
CSV com BOM, `;`, fórmulas neutralizadas; cada download grava quem, qual relatório e quantas linhas; sem a trilha gravada, o arquivo não sai.

**D-15 Menor privilégio verificado por mutação.**
Prazo combinado, arquivamento de documentos/pastas e categorias/SLA ficam com a gestão/administração **no banco**, não só na tela; há mutações que provam cada uma.
