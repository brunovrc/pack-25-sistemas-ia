-- ARQUIVO GERADO por scripts/gen-seed.mjs — NÃO edite à mão. Dados de DEMONSTRAÇÃO, fictícios e determinísticos.
-- Prestadora: «Agência Horizonte Digital». Usuários (senha local: DemoLocal#2026), todos @demo.exemplo:
--   equipe: dono@ (proprietário), gerente@ (gestor), colaborador1@, colaborador2@ (colaboradores), leitor@ (leitor);
--   clientes: alfa.admin@, alfa.usuario@, beta.admin@, beta.usuario@, gama.admin@.
-- Só valem em ambiente local/demonstração; nunca use este seed em produção. Os arquivos dos documentos vão ao Storage por «pnpm seed:files».
create or replace function pg_temp.d(n int, t time default time '12:00') returns timestamptz language sql stable as $f$
  select (((now() at time zone 'America/Sao_Paulo')::date - n)::timestamp + t) at time zone 'America/Sao_Paulo' $f$;

create temp table seed_r (i int, client int, cat text, prio text, ago int, status text, resolve int, title text, assignee uuid, by_user uuid, reopened int, ncomments int, note text) on commit drop;
create temp table seed_c (i int, k int, who uuid, body text, vis text) on commit drop;
create temp table seed_f (i int, client int, name text, vis text) on commit drop;
create temp table seed_d (i int, client int, folder int, title text, ext text, mime text, vis text, by_user uuid, ago int, size int) on commit drop;
create temp table seed_l (i int, client int, req int, title text, status text, ago int, doc int) on commit drop;

insert into seed_r values
  (1, 1, 'Suporte', 'urgent', 2, 'open', 0, 'Pixel de rastreamento não dispara', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c1', 0, 1, null),
  (2, 1, 'Suporte', 'normal', 0, 'open', 0, 'Erro no formulário de contato', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c2', 0, 0, null),
  (3, 1, 'Outros', 'urgent', 3, 'in_review', 0, 'Sugestão de melhoria no atendimento', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c2', 0, 0, null),
  (4, 1, 'Outros', 'high', 21, 'completed', 52, 'Sugestão de melhoria no atendimento', 'a5a5a5a5-0000-4000-8000-0000000000a3', 'a5a5a5a5-0000-4000-8000-0000000000c2', 0, 3, null),
  (5, 1, 'Financeiro', 'normal', 21, 'completed', 198, 'Reajuste do contrato anual', 'a5a5a5a5-0000-4000-8000-0000000000a4', 'a5a5a5a5-0000-4000-8000-0000000000c1', 0, 4, null),
  (6, 1, 'Suporte', 'low', 9, 'waiting_client', 0, 'Pixel de rastreamento não dispara', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c2', 0, 5, null),
  (7, 1, 'Financeiro', 'normal', 12, 'in_progress', 0, 'Reajuste do contrato anual', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c2', 0, 3, null),
  (8, 1, 'Suporte', 'normal', 20, 'completed', 173, 'E-mail de boas-vindas com layout quebrado', 'a5a5a5a5-0000-4000-8000-0000000000a4', 'a5a5a5a5-0000-4000-8000-0000000000c2', 0, 0, null),
  (9, 1, 'Suporte', 'urgent', 12, 'waiting_client', 0, 'Ajuste no banner da home', 'a5a5a5a5-0000-4000-8000-0000000000a3', 'a5a5a5a5-0000-4000-8000-0000000000c1', 0, 1, null),
  (10, 1, 'Financeiro', 'low', 43, 'cancelled', 0, 'Reajuste do contrato anual', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c2', 0, 1, null),
  (11, 1, 'Financeiro', 'normal', 42, 'completed', 34, 'Dúvida sobre a nota de setembro', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c2', 0, 3, null),
  (12, 1, 'Dúvida', 'urgent', 70, 'completed', 9, 'Qual o prazo de publicação dos posts?', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c2', 0, 0, null),
  (13, 1, 'Outros', 'urgent', 74, 'completed', 7, 'Sugestão de melhoria no atendimento', 'a5a5a5a5-0000-4000-8000-0000000000a3', 'a5a5a5a5-0000-4000-8000-0000000000c2', 0, 0, null),
  (14, 1, 'Financeiro', 'urgent', 63, 'completed', 12, 'Dúvida sobre a nota de setembro', 'a5a5a5a5-0000-4000-8000-0000000000a3', 'a5a5a5a5-0000-4000-8000-0000000000c1', 0, 1, null),
  (15, 1, 'Documentos', 'normal', 32, 'completed', 50, 'Solicitar segunda via da proposta', 'a5a5a5a5-0000-4000-8000-0000000000a4', 'a5a5a5a5-0000-4000-8000-0000000000c2', 0, 4, null),
  (16, 1, 'Financeiro', 'high', 22, 'cancelled', 0, 'Alterar dados de cobrança', 'a5a5a5a5-0000-4000-8000-0000000000a3', 'a5a5a5a5-0000-4000-8000-0000000000c1', 0, 5, null),
  (17, 1, 'Suporte', 'normal', 93, 'completed', 73, 'E-mail de boas-vindas com layout quebrado', 'a5a5a5a5-0000-4000-8000-0000000000a4', 'a5a5a5a5-0000-4000-8000-0000000000c2', 0, 5, null),
  (18, 1, 'Documentos', 'high', 98, 'cancelled', 0, 'Atualizar cadastro da empresa', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c2', 0, 2, null),
  (19, 1, 'Financeiro', 'low', 109, 'completed', 118, 'Alterar dados de cobrança', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c2', 0, 2, null),
  (20, 1, 'Suporte', 'normal', 23, 'completed', 165, 'Erro no formulário de contato', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c2', 0, 1, null),
  (21, 1, 'Dúvida', 'normal', 45, 'completed', 44, 'Dúvida sobre o relatório mensal', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c2', 0, 5, null),
  (22, 1, 'Dúvida', 'normal', 113, 'completed', 76, 'Quais formatos de imagem vocês aceitam?', 'a5a5a5a5-0000-4000-8000-0000000000a4', 'a5a5a5a5-0000-4000-8000-0000000000c2', 0, 2, null),
  (23, 1, 'Outros', 'normal', 66, 'completed', 173, 'Sugestão de melhoria no atendimento', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c1', 0, 5, null),
  (24, 1, 'Financeiro', 'normal', 37, 'completed', 135, 'Alterar dados de cobrança', 'a5a5a5a5-0000-4000-8000-0000000000a4', 'a5a5a5a5-0000-4000-8000-0000000000c1', 0, 0, null),
  (25, 1, 'Outros', 'normal', 66, 'completed', 107, 'Sugestão de melhoria no atendimento', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c2', 0, 0, null),
  (26, 1, 'Financeiro', 'normal', 20, 'completed', 191, 'Reajuste do contrato anual', 'a5a5a5a5-0000-4000-8000-0000000000a3', 'a5a5a5a5-0000-4000-8000-0000000000c2', 0, 2, null),
  (27, 2, 'Outros', 'normal', 0, 'in_review', 0, 'Sugestão de melhoria no atendimento', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c4', 0, 5, null),
  (28, 2, 'Outros', 'high', 2, 'waiting_provider', 0, 'Reunião de alinhamento trimestral', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c3', 0, 2, null),
  (29, 2, 'Nova demanda', 'normal', 2, 'in_review', 0, 'Redesenho do cartão de visita', 'a5a5a5a5-0000-4000-8000-0000000000a3', 'a5a5a5a5-0000-4000-8000-0000000000c4', 0, 2, null),
  (30, 2, 'Outros', 'normal', 30, 'completed', 143, 'Reunião de alinhamento trimestral', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c4', 0, 5, null),
  (31, 2, 'Nova demanda', 'high', 22, 'completed', 38, 'Novo material institucional (PDF)', 'a5a5a5a5-0000-4000-8000-0000000000a4', 'a5a5a5a5-0000-4000-8000-0000000000c3', 0, 4, null),
  (32, 2, 'Nova demanda', 'urgent', 6, 'in_review', 0, 'Criar landing page da promoção de aniversário', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c4', 0, 4, null),
  (33, 2, 'Financeiro', 'low', 29, 'completed', 119, 'Reajuste do contrato anual', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c3', 0, 0, null),
  (34, 2, 'Financeiro', 'normal', 12, 'completed', 136, 'Alterar dados de cobrança', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c3', 0, 1, null),
  (35, 2, 'Documentos', 'normal', 20, 'completed', 37, 'Enviar contrato assinado', 'a5a5a5a5-0000-4000-8000-0000000000a3', 'a5a5a5a5-0000-4000-8000-0000000000c3', 0, 0, null),
  (36, 2, 'Financeiro', 'urgent', 111, 'completed', 10, 'Reajuste do contrato anual', 'a5a5a5a5-0000-4000-8000-0000000000a3', 'a5a5a5a5-0000-4000-8000-0000000000c4', 0, 4, null),
  (37, 2, 'Suporte', 'low', 33, 'completed', 244, 'E-mail de boas-vindas com layout quebrado', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c4', 0, 5, null),
  (38, 2, 'Dúvida', 'normal', 33, 'cancelled', 0, 'Qual o prazo de publicação dos posts?', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c3', 0, 0, null),
  (39, 2, 'Nova demanda', 'normal', 64, 'completed', 52, 'Vídeo curto para redes sociais', 'a5a5a5a5-0000-4000-8000-0000000000a3', 'a5a5a5a5-0000-4000-8000-0000000000c3', 0, 3, null),
  (40, 2, 'Dúvida', 'low', 24, 'completed', 252, 'Dúvida sobre o relatório mensal', 'a5a5a5a5-0000-4000-8000-0000000000a4', 'a5a5a5a5-0000-4000-8000-0000000000c4', 0, 1, null),
  (41, 2, 'Documentos', 'low', 90, 'completed', 310, 'Briefing da campanha de fim de ano', 'a5a5a5a5-0000-4000-8000-0000000000a3', 'a5a5a5a5-0000-4000-8000-0000000000c3', 0, 5, null),
  (42, 2, 'Financeiro', 'high', 87, 'completed', 60, 'Dúvida sobre a nota de setembro', 'a5a5a5a5-0000-4000-8000-0000000000a4', 'a5a5a5a5-0000-4000-8000-0000000000c4', 0, 0, null),
  (43, 2, 'Nova demanda', 'high', 27, 'completed', 19, 'Novo material institucional (PDF)', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c3', 0, 3, null),
  (44, 2, 'Financeiro', 'high', 112, 'completed', 46, 'Alterar dados de cobrança', 'a5a5a5a5-0000-4000-8000-0000000000a3', 'a5a5a5a5-0000-4000-8000-0000000000c3', 0, 2, null),
  (45, 3, 'Suporte', 'high', 4, 'open', 0, 'E-mail de boas-vindas com layout quebrado', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c5', 0, 5, null),
  (46, 3, 'Dúvida', 'high', 1, 'in_progress', 0, 'Como acompanhar o desempenho da campanha?', 'a5a5a5a5-0000-4000-8000-0000000000a3', 'a5a5a5a5-0000-4000-8000-0000000000c5', 0, 1, null),
  (47, 3, 'Suporte', 'normal', 1, 'open', 0, 'Site fora do ar em horário de pico', null, 'a5a5a5a5-0000-4000-8000-0000000000c5', 0, 0, null),
  (48, 3, 'Financeiro', 'high', 27, 'completed', 32, 'Dúvida sobre a nota de setembro', 'a5a5a5a5-0000-4000-8000-0000000000a3', 'a5a5a5a5-0000-4000-8000-0000000000c5', 0, 3, null),
  (49, 3, 'Financeiro', 'high', 11, 'waiting_provider', 0, 'Dúvida sobre a nota de setembro', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c5', 0, 2, null),
  (50, 3, 'Financeiro', 'high', 8, 'completed', 55, 'Dúvida sobre a nota de setembro', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c5', 1, 0, null),
  (51, 3, 'Documentos', 'high', 7, 'waiting_client', 0, 'Enviar contrato assinado', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c5', 0, 0, null),
  (52, 3, 'Dúvida', 'low', 19, 'completed', 208, 'Como acompanhar o desempenho da campanha?', 'a5a5a5a5-0000-4000-8000-0000000000a3', 'a5a5a5a5-0000-4000-8000-0000000000c5', 0, 4, null),
  (53, 3, 'Documentos', 'normal', 9, 'in_progress', 0, 'Solicitar segunda via da proposta', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c5', 0, 5, null),
  (54, 3, 'Outros', 'low', 38, 'completed', 216, 'Sugestão de melhoria no atendimento', 'a5a5a5a5-0000-4000-8000-0000000000a4', 'a5a5a5a5-0000-4000-8000-0000000000c5', 0, 4, null),
  (55, 1, 'Suporte', 'high', 14, 'in_progress', 0, 'Relatório mensal ainda não recebido', 'a5a5a5a5-0000-4000-8000-0000000000a3', 'a5a5a5a5-0000-4000-8000-0000000000c1', 0, 2, 'overdue'),
  (56, 2, 'Suporte', 'urgent', 1, 'waiting_provider', 0, 'Aprovar arte do outdoor', 'a5a5a5a5-0000-4000-8000-0000000000a4', 'a5a5a5a5-0000-4000-8000-0000000000c4', 0, 2, 'soon'),
  (57, 1, 'Suporte', 'normal', 16, 'in_review', 0, 'Cadastro de novos produtos no catálogo', 'a5a5a5a5-0000-4000-8000-0000000000a2', 'a5a5a5a5-0000-4000-8000-0000000000c1', 0, 1, 'stale'),
  (58, 3, 'Suporte', 'high', 0, 'open', 0, 'Preciso de ajuda com a campanha de Black Friday', null, 'a5a5a5a5-0000-4000-8000-0000000000c5', 0, 2, 'unassigned');
insert into seed_c values
  (1, 0, 'a5a5a5a5-0000-4000-8000-0000000000c1', 'Aprovado. Pode publicar.', 'shared'),
  (4, 0, 'a5a5a5a5-0000-4000-8000-0000000000c2', 'Podem verificar com urgência? Estamos com evento amanhã.', 'shared'),
  (4, 1, 'a5a5a5a5-0000-4000-8000-0000000000a3', 'Ajuste concluído. Pode conferir e nos dizer se está tudo certo?', 'shared'),
  (4, 2, 'a5a5a5a5-0000-4000-8000-0000000000c2', 'Enviei os arquivos pedidos em anexo.', 'shared'),
  (5, 0, 'a5a5a5a5-0000-4000-8000-0000000000c1', 'Obrigado pelo retorno! Fico no aguardo.', 'shared'),
  (5, 1, 'a5a5a5a5-0000-4000-8000-0000000000a4', 'Orçamento extra necessário, falar com o gestor da conta.', 'internal'),
  (5, 2, 'a5a5a5a5-0000-4000-8000-0000000000c1', 'Conseguem priorizar? Isso impacta nossas vendas desta semana.', 'shared'),
  (5, 3, 'a5a5a5a5-0000-4000-8000-0000000000a4', 'Enviamos uma primeira versão para sua avaliação.', 'shared'),
  (6, 0, 'a5a5a5a5-0000-4000-8000-0000000000c2', 'Perfeito, pode seguir com essa opção.', 'shared'),
  (6, 1, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Precisamos de mais uma informação: qual o público principal desta ação?', 'shared'),
  (6, 2, 'a5a5a5a5-0000-4000-8000-0000000000c2', 'Conseguem priorizar? Isso impacta nossas vendas desta semana.', 'shared'),
  (6, 3, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Ajuste concluído. Pode conferir e nos dizer se está tudo certo?', 'shared'),
  (6, 4, 'a5a5a5a5-0000-4000-8000-0000000000c2', 'Podem verificar com urgência? Estamos com evento amanhã.', 'shared'),
  (7, 0, 'a5a5a5a5-0000-4000-8000-0000000000c2', 'Aprovado. Pode publicar.', 'shared'),
  (7, 1, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Conferir com o time de design antes de responder.', 'internal'),
  (7, 2, 'a5a5a5a5-0000-4000-8000-0000000000c2', 'Aprovado. Pode publicar.', 'shared'),
  (9, 0, 'a5a5a5a5-0000-4000-8000-0000000000c1', 'Enviei os arquivos pedidos em anexo.', 'shared'),
  (10, 0, 'a5a5a5a5-0000-4000-8000-0000000000c2', 'Perfeito, pode seguir com essa opção.', 'shared'),
  (11, 0, 'a5a5a5a5-0000-4000-8000-0000000000c2', 'Podem verificar com urgência? Estamos com evento amanhã.', 'shared'),
  (11, 1, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Cliente sensível a prazo: priorizar.', 'internal'),
  (11, 2, 'a5a5a5a5-0000-4000-8000-0000000000c2', 'Conseguem priorizar? Isso impacta nossas vendas desta semana.', 'shared'),
  (14, 0, 'a5a5a5a5-0000-4000-8000-0000000000c1', 'Aprovado. Pode publicar.', 'shared'),
  (15, 0, 'a5a5a5a5-0000-4000-8000-0000000000c2', 'Podem verificar com urgência? Estamos com evento amanhã.', 'shared'),
  (15, 1, 'a5a5a5a5-0000-4000-8000-0000000000a4', 'Publicado conforme combinado. Qualquer ajuste, é só responder aqui.', 'shared'),
  (15, 2, 'a5a5a5a5-0000-4000-8000-0000000000c2', 'Perfeito, pode seguir com essa opção.', 'shared'),
  (15, 3, 'a5a5a5a5-0000-4000-8000-0000000000a4', 'Combinamos o prazo de entrega para o final da semana.', 'shared'),
  (16, 0, 'a5a5a5a5-0000-4000-8000-0000000000c1', 'Enviei os arquivos pedidos em anexo.', 'shared'),
  (16, 1, 'a5a5a5a5-0000-4000-8000-0000000000a3', 'Enviamos uma primeira versão para sua avaliação.', 'shared'),
  (16, 2, 'a5a5a5a5-0000-4000-8000-0000000000c1', 'Conseguem priorizar? Isso impacta nossas vendas desta semana.', 'shared'),
  (16, 3, 'a5a5a5a5-0000-4000-8000-0000000000a3', 'Ajuste concluído. Pode conferir e nos dizer se está tudo certo?', 'shared'),
  (16, 4, 'a5a5a5a5-0000-4000-8000-0000000000c1', 'Conseguem priorizar? Isso impacta nossas vendas desta semana.', 'shared'),
  (17, 0, 'a5a5a5a5-0000-4000-8000-0000000000c2', 'Aprovado. Pode publicar.', 'shared'),
  (17, 1, 'a5a5a5a5-0000-4000-8000-0000000000a4', 'Precisamos de mais uma informação: qual o público principal desta ação?', 'shared'),
  (17, 2, 'a5a5a5a5-0000-4000-8000-0000000000c2', 'Conseguem priorizar? Isso impacta nossas vendas desta semana.', 'shared'),
  (17, 3, 'a5a5a5a5-0000-4000-8000-0000000000a4', 'Ajuste concluído. Pode conferir e nos dizer se está tudo certo?', 'shared'),
  (17, 4, 'a5a5a5a5-0000-4000-8000-0000000000c2', 'Enviei os arquivos pedidos em anexo.', 'shared'),
  (18, 0, 'a5a5a5a5-0000-4000-8000-0000000000c2', 'Perfeito, pode seguir com essa opção.', 'shared'),
  (18, 1, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Precisamos de mais uma informação: qual o público principal desta ação?', 'shared'),
  (19, 0, 'a5a5a5a5-0000-4000-8000-0000000000c2', 'Enviei os arquivos pedidos em anexo.', 'shared'),
  (19, 1, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Enviamos uma primeira versão para sua avaliação.', 'shared'),
  (20, 0, 'a5a5a5a5-0000-4000-8000-0000000000c2', 'Enviei os arquivos pedidos em anexo.', 'shared'),
  (21, 0, 'a5a5a5a5-0000-4000-8000-0000000000c2', 'Podem verificar com urgência? Estamos com evento amanhã.', 'shared'),
  (21, 1, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Precisamos de mais uma informação: qual o público principal desta ação?', 'shared'),
  (21, 2, 'a5a5a5a5-0000-4000-8000-0000000000c2', 'Enviei os arquivos pedidos em anexo.', 'shared'),
  (21, 3, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Cliente sensível a prazo: priorizar.', 'internal'),
  (21, 4, 'a5a5a5a5-0000-4000-8000-0000000000c2', 'Conseguem priorizar? Isso impacta nossas vendas desta semana.', 'shared'),
  (22, 0, 'a5a5a5a5-0000-4000-8000-0000000000c2', 'Podem verificar com urgência? Estamos com evento amanhã.', 'shared'),
  (22, 1, 'a5a5a5a5-0000-4000-8000-0000000000a4', 'Ajuste concluído. Pode conferir e nos dizer se está tudo certo?', 'shared'),
  (23, 0, 'a5a5a5a5-0000-4000-8000-0000000000c1', 'Aprovado. Pode publicar.', 'shared'),
  (23, 1, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Ajuste concluído. Pode conferir e nos dizer se está tudo certo?', 'shared'),
  (23, 2, 'a5a5a5a5-0000-4000-8000-0000000000c1', 'Obrigado pelo retorno! Fico no aguardo.', 'shared'),
  (23, 3, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Conferir com o time de design antes de responder.', 'internal'),
  (23, 4, 'a5a5a5a5-0000-4000-8000-0000000000c1', 'Podem verificar com urgência? Estamos com evento amanhã.', 'shared'),
  (26, 0, 'a5a5a5a5-0000-4000-8000-0000000000c2', 'Aprovado. Pode publicar.', 'shared'),
  (26, 1, 'a5a5a5a5-0000-4000-8000-0000000000a3', 'Enviamos uma primeira versão para sua avaliação.', 'shared'),
  (27, 0, 'a5a5a5a5-0000-4000-8000-0000000000c4', 'Conseguem priorizar? Isso impacta nossas vendas desta semana.', 'shared'),
  (27, 1, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Orçamento extra necessário, falar com o gestor da conta.', 'internal'),
  (27, 2, 'a5a5a5a5-0000-4000-8000-0000000000c4', 'Conseguem priorizar? Isso impacta nossas vendas desta semana.', 'shared'),
  (27, 3, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Cliente sensível a prazo: priorizar.', 'internal'),
  (27, 4, 'a5a5a5a5-0000-4000-8000-0000000000c4', 'Obrigado pelo retorno! Fico no aguardo.', 'shared'),
  (28, 0, 'a5a5a5a5-0000-4000-8000-0000000000c3', 'Conseguem priorizar? Isso impacta nossas vendas desta semana.', 'shared'),
  (28, 1, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Recebemos sua solicitação e já estamos analisando.', 'shared'),
  (29, 0, 'a5a5a5a5-0000-4000-8000-0000000000c4', 'Podem verificar com urgência? Estamos com evento amanhã.', 'shared'),
  (29, 1, 'a5a5a5a5-0000-4000-8000-0000000000a3', 'Conferir com o time de design antes de responder.', 'internal'),
  (30, 0, 'a5a5a5a5-0000-4000-8000-0000000000c4', 'Perfeito, pode seguir com essa opção.', 'shared'),
  (30, 1, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Recebemos sua solicitação e já estamos analisando.', 'shared'),
  (30, 2, 'a5a5a5a5-0000-4000-8000-0000000000c4', 'Perfeito, pode seguir com essa opção.', 'shared'),
  (30, 3, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Publicado conforme combinado. Qualquer ajuste, é só responder aqui.', 'shared'),
  (30, 4, 'a5a5a5a5-0000-4000-8000-0000000000c4', 'Perfeito, pode seguir com essa opção.', 'shared'),
  (31, 0, 'a5a5a5a5-0000-4000-8000-0000000000c3', 'Podem verificar com urgência? Estamos com evento amanhã.', 'shared'),
  (31, 1, 'a5a5a5a5-0000-4000-8000-0000000000a4', 'Orçamento extra necessário, falar com o gestor da conta.', 'internal'),
  (31, 2, 'a5a5a5a5-0000-4000-8000-0000000000c3', 'Perfeito, pode seguir com essa opção.', 'shared'),
  (31, 3, 'a5a5a5a5-0000-4000-8000-0000000000a4', 'Precisamos de mais uma informação: qual o público principal desta ação?', 'shared'),
  (32, 0, 'a5a5a5a5-0000-4000-8000-0000000000c4', 'Conseguem priorizar? Isso impacta nossas vendas desta semana.', 'shared'),
  (32, 1, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Conferir com o time de design antes de responder.', 'internal'),
  (32, 2, 'a5a5a5a5-0000-4000-8000-0000000000c4', 'Obrigado pelo retorno! Fico no aguardo.', 'shared'),
  (32, 3, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Combinamos o prazo de entrega para o final da semana.', 'shared'),
  (34, 0, 'a5a5a5a5-0000-4000-8000-0000000000c3', 'Obrigado pelo retorno! Fico no aguardo.', 'shared'),
  (36, 0, 'a5a5a5a5-0000-4000-8000-0000000000c4', 'Enviei os arquivos pedidos em anexo.', 'shared'),
  (36, 1, 'a5a5a5a5-0000-4000-8000-0000000000a3', 'Recebemos sua solicitação e já estamos analisando.', 'shared'),
  (36, 2, 'a5a5a5a5-0000-4000-8000-0000000000c4', 'Enviei os arquivos pedidos em anexo.', 'shared'),
  (36, 3, 'a5a5a5a5-0000-4000-8000-0000000000a3', 'Combinamos o prazo de entrega para o final da semana.', 'shared'),
  (37, 0, 'a5a5a5a5-0000-4000-8000-0000000000c4', 'Conseguem priorizar? Isso impacta nossas vendas desta semana.', 'shared'),
  (37, 1, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Ajuste concluído. Pode conferir e nos dizer se está tudo certo?', 'shared'),
  (37, 2, 'a5a5a5a5-0000-4000-8000-0000000000c4', 'Podem verificar com urgência? Estamos com evento amanhã.', 'shared'),
  (37, 3, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Reincidência do mesmo problema: abrir tarefa interna.', 'internal'),
  (37, 4, 'a5a5a5a5-0000-4000-8000-0000000000c4', 'Conseguem priorizar? Isso impacta nossas vendas desta semana.', 'shared'),
  (39, 0, 'a5a5a5a5-0000-4000-8000-0000000000c3', 'Obrigado pelo retorno! Fico no aguardo.', 'shared'),
  (39, 1, 'a5a5a5a5-0000-4000-8000-0000000000a3', 'Ajuste concluído. Pode conferir e nos dizer se está tudo certo?', 'shared'),
  (39, 2, 'a5a5a5a5-0000-4000-8000-0000000000c3', 'Podem verificar com urgência? Estamos com evento amanhã.', 'shared'),
  (40, 0, 'a5a5a5a5-0000-4000-8000-0000000000c4', 'Podem verificar com urgência? Estamos com evento amanhã.', 'shared'),
  (41, 0, 'a5a5a5a5-0000-4000-8000-0000000000c3', 'Perfeito, pode seguir com essa opção.', 'shared'),
  (41, 1, 'a5a5a5a5-0000-4000-8000-0000000000a3', 'Combinamos o prazo de entrega para o final da semana.', 'shared'),
  (41, 2, 'a5a5a5a5-0000-4000-8000-0000000000c3', 'Obrigado pelo retorno! Fico no aguardo.', 'shared'),
  (41, 3, 'a5a5a5a5-0000-4000-8000-0000000000a3', 'Conferir com o time de design antes de responder.', 'internal'),
  (41, 4, 'a5a5a5a5-0000-4000-8000-0000000000c3', 'Perfeito, pode seguir com essa opção.', 'shared'),
  (43, 0, 'a5a5a5a5-0000-4000-8000-0000000000c3', 'Conseguem priorizar? Isso impacta nossas vendas desta semana.', 'shared'),
  (43, 1, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Cliente sensível a prazo: priorizar.', 'internal'),
  (43, 2, 'a5a5a5a5-0000-4000-8000-0000000000c3', 'Podem verificar com urgência? Estamos com evento amanhã.', 'shared'),
  (44, 0, 'a5a5a5a5-0000-4000-8000-0000000000c3', 'Perfeito, pode seguir com essa opção.', 'shared'),
  (44, 1, 'a5a5a5a5-0000-4000-8000-0000000000a3', 'Reincidência do mesmo problema: abrir tarefa interna.', 'internal'),
  (45, 0, 'a5a5a5a5-0000-4000-8000-0000000000c5', 'Conseguem priorizar? Isso impacta nossas vendas desta semana.', 'shared'),
  (45, 1, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Enviamos uma primeira versão para sua avaliação.', 'shared'),
  (45, 2, 'a5a5a5a5-0000-4000-8000-0000000000c5', 'Aprovado. Pode publicar.', 'shared'),
  (45, 3, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Precisamos de mais uma informação: qual o público principal desta ação?', 'shared'),
  (45, 4, 'a5a5a5a5-0000-4000-8000-0000000000c5', 'Aprovado. Pode publicar.', 'shared'),
  (46, 0, 'a5a5a5a5-0000-4000-8000-0000000000c5', 'Obrigado pelo retorno! Fico no aguardo.', 'shared'),
  (48, 0, 'a5a5a5a5-0000-4000-8000-0000000000c5', 'Aprovado. Pode publicar.', 'shared'),
  (48, 1, 'a5a5a5a5-0000-4000-8000-0000000000a3', 'Conferir com o time de design antes de responder.', 'internal'),
  (48, 2, 'a5a5a5a5-0000-4000-8000-0000000000c5', 'Obrigado pelo retorno! Fico no aguardo.', 'shared'),
  (49, 0, 'a5a5a5a5-0000-4000-8000-0000000000c5', 'Obrigado pelo retorno! Fico no aguardo.', 'shared'),
  (49, 1, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Combinamos o prazo de entrega para o final da semana.', 'shared'),
  (52, 0, 'a5a5a5a5-0000-4000-8000-0000000000c5', 'Aprovado. Pode publicar.', 'shared'),
  (52, 1, 'a5a5a5a5-0000-4000-8000-0000000000a3', 'Conferir com o time de design antes de responder.', 'internal'),
  (52, 2, 'a5a5a5a5-0000-4000-8000-0000000000c5', 'Aprovado. Pode publicar.', 'shared'),
  (52, 3, 'a5a5a5a5-0000-4000-8000-0000000000a3', 'Ajuste concluído. Pode conferir e nos dizer se está tudo certo?', 'shared'),
  (53, 0, 'a5a5a5a5-0000-4000-8000-0000000000c5', 'Aprovado. Pode publicar.', 'shared'),
  (53, 1, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Precisamos de mais uma informação: qual o público principal desta ação?', 'shared'),
  (53, 2, 'a5a5a5a5-0000-4000-8000-0000000000c5', 'Podem verificar com urgência? Estamos com evento amanhã.', 'shared'),
  (53, 3, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'Precisamos de mais uma informação: qual o público principal desta ação?', 'shared'),
  (53, 4, 'a5a5a5a5-0000-4000-8000-0000000000c5', 'Podem verificar com urgência? Estamos com evento amanhã.', 'shared'),
  (54, 0, 'a5a5a5a5-0000-4000-8000-0000000000c5', 'Perfeito, pode seguir com essa opção.', 'shared'),
  (54, 1, 'a5a5a5a5-0000-4000-8000-0000000000a4', 'Publicado conforme combinado. Qualquer ajuste, é só responder aqui.', 'shared'),
  (54, 2, 'a5a5a5a5-0000-4000-8000-0000000000c5', 'Aprovado. Pode publicar.', 'shared'),
  (54, 3, 'a5a5a5a5-0000-4000-8000-0000000000a4', 'Reincidência do mesmo problema: abrir tarefa interna.', 'internal'),
  (55, 0, 'a5a5a5a5-0000-4000-8000-0000000000c1', 'Aprovado. Pode publicar.', 'shared'),
  (55, 1, 'a5a5a5a5-0000-4000-8000-0000000000a3', 'Ajuste concluído. Pode conferir e nos dizer se está tudo certo?', 'shared'),
  (56, 0, 'a5a5a5a5-0000-4000-8000-0000000000c4', 'Conseguem priorizar? Isso impacta nossas vendas desta semana.', 'shared'),
  (56, 1, 'a5a5a5a5-0000-4000-8000-0000000000a4', 'Precisamos de mais uma informação: qual o público principal desta ação?', 'shared'),
  (57, 0, 'a5a5a5a5-0000-4000-8000-0000000000c1', 'Enviei os arquivos pedidos em anexo.', 'shared'),
  (58, 0, 'a5a5a5a5-0000-4000-8000-0000000000c5', 'Obrigado pelo retorno! Fico no aguardo.', 'shared'),
  (58, 1, 'a5a5a5a5-0000-4000-8000-0000000000a4', 'Combinamos o prazo de entrega para o final da semana.', 'shared');
insert into seed_f values
  (1, 1, 'Contratos e propostas', 'client'),
  (2, 1, 'Relatórios mensais', 'client'),
  (3, 1, 'Material interno da agência', 'internal'),
  (4, 2, 'Contratos e propostas', 'client'),
  (5, 2, 'Relatórios mensais', 'client'),
  (6, 2, 'Material interno da agência', 'internal'),
  (7, 3, 'Contratos e propostas', 'client'),
  (8, 3, 'Relatórios mensais', 'client'),
  (9, 3, 'Material interno da agência', 'internal');
insert into seed_d values
  (1, 1, 1, 'Contrato de prestação de serviços — Alfa', 'pdf', 'application/pdf', 'client', 'a5a5a5a5-0000-4000-8000-0000000000a3', 47, 685),
  (2, 1, 1, 'Proposta comercial — Alfa', 'pdf', 'application/pdf', 'client', 'a5a5a5a5-0000-4000-8000-0000000000a3', 20, 670),
  (3, 1, 2, 'Relatório mensal de desempenho — Alfa', 'xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'client', 'a5a5a5a5-0000-4000-8000-0000000000a3', 75, 2399),
  (4, 1, null, 'Briefing da campanha — Alfa', 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'client', 'a5a5a5a5-0000-4000-8000-0000000000c2', 78, 1385),
  (5, 1, null, 'Identidade visual (logotipo) — Alfa', 'png', 'image/png', 'client', 'a5a5a5a5-0000-4000-8000-0000000000c2', 34, 852),
  (6, 1, 3, 'Roteiro dos vídeos — Alfa', 'txt', 'text/plain', 'internal', 'a5a5a5a5-0000-4000-8000-0000000000a3', 41, 116),
  (7, 2, 4, 'Contrato de prestação de serviços — Beta', 'pdf', 'application/pdf', 'client', 'a5a5a5a5-0000-4000-8000-0000000000a3', 59, 685),
  (8, 2, 4, 'Proposta comercial — Beta', 'pdf', 'application/pdf', 'client', 'a5a5a5a5-0000-4000-8000-0000000000a3', 87, 670),
  (9, 2, 5, 'Relatório mensal de desempenho — Beta', 'xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'client', 'a5a5a5a5-0000-4000-8000-0000000000a3', 5, 2399),
  (10, 2, null, 'Briefing da campanha — Beta', 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'client', 'a5a5a5a5-0000-4000-8000-0000000000c3', 16, 1385),
  (11, 2, null, 'Identidade visual (logotipo) — Beta', 'png', 'image/png', 'client', 'a5a5a5a5-0000-4000-8000-0000000000c4', 83, 852),
  (12, 2, 6, 'Roteiro dos vídeos — Beta', 'txt', 'text/plain', 'internal', 'a5a5a5a5-0000-4000-8000-0000000000a3', 28, 116),
  (13, 3, 7, 'Contrato de prestação de serviços — Gama', 'pdf', 'application/pdf', 'client', 'a5a5a5a5-0000-4000-8000-0000000000a3', 16, 685),
  (14, 3, 7, 'Proposta comercial — Gama', 'pdf', 'application/pdf', 'client', 'a5a5a5a5-0000-4000-8000-0000000000a3', 51, 670),
  (15, 3, 8, 'Relatório mensal de desempenho — Gama', 'xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'client', 'a5a5a5a5-0000-4000-8000-0000000000a3', 18, 2399),
  (16, 3, null, 'Briefing da campanha — Gama', 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'client', 'a5a5a5a5-0000-4000-8000-0000000000c5', 35, 1385),
  (17, 3, null, 'Identidade visual (logotipo) — Gama', 'png', 'image/png', 'client', 'a5a5a5a5-0000-4000-8000-0000000000c5', 53, 852),
  (18, 3, 9, 'Roteiro dos vídeos — Gama', 'txt', 'text/plain', 'internal', 'a5a5a5a5-0000-4000-8000-0000000000a3', 44, 116);
insert into seed_l values
  (1, 1, 4, 'Entrega: Sugestão de melhoria no atendimento', 'acknowledged', 19, 1),
  (2, 1, 5, 'Entrega: Reajuste do contrato anual', 'published', 19, 2),
  (3, 1, 8, 'Entrega: E-mail de boas-vindas com layout quebrado', 'draft', 18, null),
  (4, 2, 30, 'Entrega: Reunião de alinhamento trimestral', 'acknowledged', 28, 7),
  (5, 2, 31, 'Entrega: Novo material institucional (PDF)', 'published', 20, 8),
  (6, 2, 33, 'Entrega: Reajuste do contrato anual', 'draft', 27, null),
  (7, 3, 48, 'Entrega: Dúvida sobre a nota de setembro', 'acknowledged', 25, 13),
  (8, 3, 50, 'Entrega: Dúvida sobre a nota de setembro', 'published', 6, 14),
  (9, 3, 52, 'Entrega: Como acompanhar o desempenho da campanha?', 'draft', 17, null);

do $seed$
declare
  org uuid := 'a5a5a5a5-0000-4000-8000-000000000001';
  pw text := extensions.crypt('DemoLocal#2026', extensions.gen_salt('bf'));
  tz text := 'America/Sao_Paulo';
begin
  if exists (select 1 from public.organizations where id = org) then
    return; -- já semeado
  end if;

  -- ---------------------------------------------------------------- usuários
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  select '00000000-0000-0000-0000-000000000000', v.id::uuid, 'authenticated', 'authenticated', v.email, pw, now(), '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', v.nome), now(), now(), '', '', '', ''
  from (values
    ('a5a5a5a5-0000-4000-8000-0000000000a1', 'dono@demo.exemplo', 'Helena Proprietária'), ('a5a5a5a5-0000-4000-8000-0000000000a2', 'gerente@demo.exemplo', 'Rafael Gestor'), ('a5a5a5a5-0000-4000-8000-0000000000a3', 'colaborador1@demo.exemplo', 'Camila Atendimento'),
    ('a5a5a5a5-0000-4000-8000-0000000000a4', 'colaborador2@demo.exemplo', 'Diego Criação'), ('a5a5a5a5-0000-4000-8000-0000000000a5', 'leitor@demo.exemplo', 'Lívia Leitora'),
    ('a5a5a5a5-0000-4000-8000-0000000000c1', 'alfa.admin@demo.exemplo', 'Ana Alfa'), ('a5a5a5a5-0000-4000-8000-0000000000c2', 'alfa.usuario@demo.exemplo', 'Alberto Alfa'),
    ('a5a5a5a5-0000-4000-8000-0000000000c3', 'beta.admin@demo.exemplo', 'Beatriz Beta'), ('a5a5a5a5-0000-4000-8000-0000000000c4', 'beta.usuario@demo.exemplo', 'Bernardo Beta'), ('a5a5a5a5-0000-4000-8000-0000000000c5', 'gama.admin@demo.exemplo', 'Gabriela Gama')
  ) as v(id, email, nome);
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), u.id, u.email, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
  from auth.users u where u.email like '%@demo.exemplo';
  update public.profiles p set full_name = u.raw_user_meta_data ->> 'full_name' from auth.users u where u.id = p.id and u.email like '%@demo.exemplo';

  -- ---------------------------------------------------------------- prestadora (configurações, categorias e SLAs nascem por gatilho)
  insert into public.organizations (id, name, slug) values (org, 'Agência Horizonte Digital (dados fictícios)', 'horizonte');
  insert into public.organization_settings (organization_id, display_name, theme) values (org, 'Agência Horizonte Digital', '{"primary":"#0f4c81"}'::jsonb);
  update public.portal_settings set portal_name = 'Portal Horizonte', welcome_message = 'Aqui você acompanha seus pedidos, recebe as entregas da agência e acessa seus documentos com segurança.',
    footer_text = 'Agência Horizonte Digital — atendimento de segunda a sexta, das 9h às 18h.', contact_email = 'atendimento@horizonte.exemplo', contact_phone = '(11) 4000-0000', primary_color = '#0F4C81', secondary_color = '#F59E0B'
   where organization_id = org;
  insert into public.organization_members (organization_id, user_id, role) values
    (org, 'a5a5a5a5-0000-4000-8000-0000000000a1', 'owner'), (org, 'a5a5a5a5-0000-4000-8000-0000000000a2', 'manager'), (org, 'a5a5a5a5-0000-4000-8000-0000000000a3', 'member'), (org, 'a5a5a5a5-0000-4000-8000-0000000000a4', 'member'), (org, 'a5a5a5a5-0000-4000-8000-0000000000a5', 'viewer');

  -- Carga em massa dos FATOS históricos sem acionar gatilhos de imutabilidade (a auditoria não registra a carga).
  set local session_replication_role = replica;

  insert into public.client_accounts (id, organization_id, name, legal_name, document_number, email, phone, status, assigned_manager_id, created_at, updated_at) values
    ('a5a5a5a5-1000-4000-8000-000000000001', org, 'Alfa Comércio de Alimentos', 'Alfa Comércio de Alimentos Ltda', '11222333000181', 'contato@alfa.exemplo', '(11) 4000-1001', 'active', 'a5a5a5a5-0000-4000-8000-0000000000a2', pg_temp.d(130), pg_temp.d(130)),
    ('a5a5a5a5-1000-4000-8000-000000000002', org, 'Beta Engenharia', 'Beta Engenharia e Projetos S.A.', '45723174000110', 'contato@beta.exemplo', '(21) 4000-2002', 'active', 'a5a5a5a5-0000-4000-8000-0000000000a3', pg_temp.d(130), pg_temp.d(130)),
    ('a5a5a5a5-1000-4000-8000-000000000003', org, 'Gama Clínica Odontológica', 'Gama Serviços Odontológicos Ltda', '11444777000161', 'contato@gama.exemplo', '(31) 4000-3003', 'active', null, pg_temp.d(130), pg_temp.d(130));
  insert into public.client_internal_notes (client_account_id, organization_id, notes, updated_by) values
    ('a5a5a5a5-1000-4000-8000-000000000001', org, 'Cliente estratégico. Prefere contato por e-mail. Renovação do contrato em dezembro.', 'a5a5a5a5-0000-4000-8000-0000000000a2'),
    ('a5a5a5a5-1000-4000-8000-000000000002', org, 'Costuma pedir ajustes de última hora; alinhar prazos com antecedência.', 'a5a5a5a5-0000-4000-8000-0000000000a3');
  insert into public.client_members (organization_id, client_account_id, user_id, role, status, invited_at, joined_at, created_at) values
    (org, 'a5a5a5a5-1000-4000-8000-000000000001', 'a5a5a5a5-0000-4000-8000-0000000000c1', 'client_admin', 'active', pg_temp.d(125), pg_temp.d(124), pg_temp.d(124)), (org, 'a5a5a5a5-1000-4000-8000-000000000001', 'a5a5a5a5-0000-4000-8000-0000000000c2', 'client_user', 'active', pg_temp.d(100), pg_temp.d(99), pg_temp.d(99)),
    (org, 'a5a5a5a5-1000-4000-8000-000000000002', 'a5a5a5a5-0000-4000-8000-0000000000c3', 'client_admin', 'active', pg_temp.d(120), pg_temp.d(119), pg_temp.d(119)), (org, 'a5a5a5a5-1000-4000-8000-000000000002', 'a5a5a5a5-0000-4000-8000-0000000000c4', 'client_user', 'active', pg_temp.d(90), pg_temp.d(89), pg_temp.d(89)),
    (org, 'a5a5a5a5-1000-4000-8000-000000000003', 'a5a5a5a5-0000-4000-8000-0000000000c5', 'client_admin', 'active', pg_temp.d(60), pg_temp.d(59), pg_temp.d(59));

  -- ---------------------------------------------------------------- solicitações, prazos (SLA em horas úteis), histórico e conversa
  insert into public.requests (id, organization_id, client_account_id, number, category_id, title, description, status, priority, created_by, assigned_to, due_at, due_kind, started_at, completed_at, closed_at, reopened_count, last_activity_at, created_at, updated_at)
  select ('a5a5a5a5-2000-4000-8000-' || lpad(r.i::text, 12, '0'))::uuid, org, ('a5a5a5a5-1000-4000-8000-' || lpad(r.client::text, 12, '0'))::uuid, r.i,
         (select id from public.service_categories sc where sc.organization_id = org and sc.name = r.cat), r.title,
         'Descrição de demonstração da solicitação «' || r.title || '». Contexto, resultado esperado e prazo desejado.', r.status::public.pt_request_status, r.prio::public.pt_priority, r.by_user, r.assignee,
         case when r.note = 'soon' then now() + interval '10 hours' else public.pt_add_business_hours(pg_temp.d(r.ago, time '10:00'), (select target_hours from public.service_level_policies p where p.organization_id = org and p.priority = r.prio::public.pt_priority), tz, '{1,2,3,4,5}', time '09:00', time '18:00') end,
         case when r.note = 'soon' then 'agreed' else 'policy' end,
         case when r.status in ('in_progress', 'waiting_client', 'waiting_provider', 'completed') then pg_temp.d(r.ago, time '14:00') end,
         case when r.status = 'completed' then least(now() - interval '1 hour', pg_temp.d(r.ago, time '10:00') + make_interval(hours => r.resolve)) end,
         case when r.status = 'cancelled' then pg_temp.d(greatest(r.ago - 1, 0), time '15:00') end, r.reopened,
         case when r.note = 'stale' then pg_temp.d(12) when r.status = 'completed' then least(now() - interval '1 hour', pg_temp.d(r.ago, time '10:00') + make_interval(hours => r.resolve)) else greatest(pg_temp.d(r.ago, time '10:00'), now() - make_interval(hours => (r.i * 7) % 60)) end,
         pg_temp.d(r.ago, time '10:00'), pg_temp.d(r.ago, time '10:00')
  from seed_r r;
  update public.request_counters set last_number = (select max(i) from seed_r) where organization_id = org;

  insert into public.request_deadline_events (organization_id, client_account_id, request_id, policy_id, due_kind, target_at, reason, breached_at, changed_by, calculated_at)
  select org, rq.client_account_id, rq.id, case when rq.due_kind = 'policy' then (select p.id from public.service_level_policies p where p.organization_id = org and p.priority = rq.priority) end, rq.due_kind::text, rq.due_at,
         case when rq.due_kind = 'agreed' then 'Prazo combinado por telefone com o cliente.' end, case when rq.status = 'completed' and rq.completed_at > rq.due_at then rq.due_at end, rq.assigned_to, rq.created_at
  from public.requests rq where rq.organization_id = org;

  -- histórico de situação: criação + etapas até a situação atual
  insert into public.request_status_history (organization_id, client_account_id, request_id, previous_status, new_status, changed_by, reason, changed_at)
  select org, rq.client_account_id, rq.id, null, 'open', rq.created_by, null, rq.created_at from public.requests rq where rq.organization_id = org;
  insert into public.request_status_history (organization_id, client_account_id, request_id, previous_status, new_status, changed_by, reason, changed_at)
  select org, rq.client_account_id, rq.id, 'open', 'in_review', coalesce(rq.assigned_to, 'a5a5a5a5-0000-4000-8000-0000000000a2'), null, rq.created_at + interval '2 hours'
  from public.requests rq where rq.organization_id = org and rq.status <> 'open';
  insert into public.request_status_history (organization_id, client_account_id, request_id, previous_status, new_status, changed_by, reason, changed_at)
  select org, rq.client_account_id, rq.id, 'in_review', 'in_progress', coalesce(rq.assigned_to, 'a5a5a5a5-0000-4000-8000-0000000000a2'), null, rq.created_at + interval '6 hours'
  from public.requests rq where rq.organization_id = org and rq.status in ('in_progress', 'waiting_client', 'waiting_provider', 'completed');
  insert into public.request_status_history (organization_id, client_account_id, request_id, previous_status, new_status, changed_by, reason, changed_at)
  select org, rq.client_account_id, rq.id, 'in_progress', rq.status, coalesce(rq.assigned_to, 'a5a5a5a5-0000-4000-8000-0000000000a2'), null, rq.last_activity_at
  from public.requests rq where rq.organization_id = org and rq.status in ('waiting_client', 'waiting_provider');
  insert into public.request_status_history (organization_id, client_account_id, request_id, previous_status, new_status, changed_by, reason, changed_at)
  select org, rq.client_account_id, rq.id, 'in_progress', 'completed', coalesce(rq.assigned_to, 'a5a5a5a5-0000-4000-8000-0000000000a2'), null, rq.completed_at from public.requests rq where rq.organization_id = org and rq.status = 'completed';
  insert into public.request_status_history (organization_id, client_account_id, request_id, previous_status, new_status, changed_by, reason, changed_at)
  select org, rq.client_account_id, rq.id, 'in_review', 'cancelled', rq.created_by, 'Não precisamos mais deste pedido.', rq.closed_at from public.requests rq where rq.organization_id = org and rq.status = 'cancelled';

  -- conversa: comentários compartilhados e notas internas
  insert into public.request_comments (organization_id, client_account_id, request_id, author_id, body, visibility, created_at)
  select org, rq.client_account_id, rq.id, c.who, c.body, c.vis::public.pt_comment_visibility, rq.created_at + (c.k + 1) * interval '5 hours'
  from seed_c c join public.requests rq on rq.id = ('a5a5a5a5-2000-4000-8000-' || lpad(c.i::text, 12, '0'))::uuid
  where rq.created_at + (c.k + 1) * interval '5 hours' < now();

  -- ---------------------------------------------------------------- documentos e pastas (os arquivos reais são enviados por «pnpm seed:files»)
  insert into public.document_folders (id, organization_id, client_account_id, parent_folder_id, name, visibility, created_by, created_at)
  select ('a5a5a5a5-3000-4000-8000-' || lpad(f.i::text, 12, '0'))::uuid, org, ('a5a5a5a5-1000-4000-8000-' || lpad(f.client::text, 12, '0'))::uuid, null, f.name, f.vis::public.pt_visibility, 'a5a5a5a5-0000-4000-8000-0000000000a2', pg_temp.d(120) from seed_f f;
  insert into public.documents (id, organization_id, client_account_id, folder_id, title, description, original_file_name, storage_path, mime_type, size_bytes, visibility, uploaded_by, created_at)
  select ('a5a5a5a5-4000-4000-8000-' || lpad(d.i::text, 12, '0'))::uuid, org, ('a5a5a5a5-1000-4000-8000-' || lpad(d.client::text, 12, '0'))::uuid,
         case when d.folder is null then null else ('a5a5a5a5-3000-4000-8000-' || lpad(d.folder::text, 12, '0'))::uuid end, d.title, 'Documento de demonstração (conteúdo fictício).',
         lower(regexp_replace(translate(d.title, 'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ', 'aaaaeeiooouc' || 'AAAAEEIOOOUC'), '[^A-Za-z0-9]+', '-', 'g')) || '.' || d.ext,
         org::text || '/a5a5a5a5-1000-4000-8000-' || lpad(d.client::text, 12, '0') || '/a5a5a5a5-4000-4000-8000-' || lpad(d.i::text, 12, '0'), d.mime, d.size, d.vis::public.pt_visibility, d.by_user, pg_temp.d(d.ago)
  from seed_d d;
  insert into public.document_access_logs (organization_id, client_account_id, document_id, user_id, action, occurred_at)
  select org, dc.client_account_id, dc.id, dc.uploaded_by, 'upload', dc.created_at from public.documents dc where dc.organization_id = org;
  insert into public.document_access_logs (organization_id, client_account_id, document_id, user_id, action, occurred_at)
  select org, dc.client_account_id, dc.id, case when dc.client_account_id = 'a5a5a5a5-1000-4000-8000-000000000001' then 'a5a5a5a5-0000-4000-8000-0000000000c1'::uuid when dc.client_account_id = 'a5a5a5a5-1000-4000-8000-000000000002' then 'a5a5a5a5-0000-4000-8000-0000000000c3'::uuid else 'a5a5a5a5-0000-4000-8000-0000000000c5'::uuid end, 'download', dc.created_at + interval '1 day'
  from public.documents dc where dc.organization_id = org and dc.visibility = 'client' and dc.created_at + interval '1 day' < now();
  -- alguns anexos de solicitações
  insert into public.request_attachments (organization_id, client_account_id, request_id, document_id)
  select org, d.client_account_id, rq.id, d.id
  from (select dd.*, row_number() over (partition by dd.client_account_id order by dd.created_at) as n from public.documents dd where dd.organization_id = org and dd.visibility = 'client') d
  join lateral (select r2.id from public.requests r2 where r2.client_account_id = d.client_account_id order by r2.number offset (d.n::int) limit 1) rq on true where d.n <= 3;

  -- ---------------------------------------------------------------- entregas
  insert into public.deliverables (id, organization_id, client_account_id, request_id, title, description, status, delivered_at, published_by, acknowledged_at, acknowledged_by, created_by, created_at, updated_at)
  select ('a5a5a5a5-5000-4000-8000-' || lpad(l.i::text, 12, '0'))::uuid, org, ('a5a5a5a5-1000-4000-8000-' || lpad(l.client::text, 12, '0'))::uuid, ('a5a5a5a5-2000-4000-8000-' || lpad(l.req::text, 12, '0'))::uuid,
         l.title, 'Material pronto para uso. Confira os arquivos e confirme o recebimento.', l.status::public.pt_deliverable_status,
         case when l.status in ('published', 'acknowledged') then pg_temp.d(l.ago) end, case when l.status in ('published', 'acknowledged') then 'a5a5a5a5-0000-4000-8000-0000000000a3'::uuid end,
         case when l.status = 'acknowledged' then pg_temp.d(greatest(l.ago - 1, 0)) end,
         case when l.status = 'acknowledged' then (select m.user_id from public.client_members m where m.client_account_id = ('a5a5a5a5-1000-4000-8000-' || lpad(l.client::text, 12, '0'))::uuid and m.role = 'client_admin' limit 1) end,
         'a5a5a5a5-0000-4000-8000-0000000000a3', pg_temp.d(l.ago + 1), pg_temp.d(l.ago)
  from seed_l l;
  insert into public.deliverable_files (organization_id, client_account_id, deliverable_id, document_id)
  select org, dv.client_account_id, dv.id, ('a5a5a5a5-4000-4000-8000-' || lpad(l.doc::text, 12, '0'))::uuid
  from seed_l l join public.deliverables dv on dv.id = ('a5a5a5a5-5000-4000-8000-' || lpad(l.i::text, 12, '0'))::uuid where l.doc is not null;

  -- ---------------------------------------------------------------- comunicados
  insert into public.announcements (id, organization_id, title, body, audience, published_at, expires_at, notified_at, created_by, created_at, updated_at) values
    ('a5a5a5a5-6000-4000-8000-000000000001', org, 'Recesso de fim de ano', 'Entre 24/12 e 02/01 o atendimento funciona em horário reduzido. Pedidos urgentes continuam sendo atendidos pelo portal.', 'all', pg_temp.d(10), null, pg_temp.d(10), 'a5a5a5a5-0000-4000-8000-0000000000a2', pg_temp.d(10), pg_temp.d(10)),
    ('a5a5a5a5-6000-4000-8000-000000000002', org, 'Nova ferramenta de relatórios para Alfa e Beta', 'A partir deste mês os relatórios mensais passam a ser publicados como entregas no portal. Você é avisado a cada publicação.', 'selected', pg_temp.d(4), null, pg_temp.d(4), 'a5a5a5a5-0000-4000-8000-0000000000a2', pg_temp.d(4), pg_temp.d(4)),
    ('a5a5a5a5-6000-4000-8000-000000000003', org, 'Pesquisa de satisfação (encerrada)', 'Obrigado a todos que responderam! Os resultados serão compartilhados em breve.', 'all', pg_temp.d(60), pg_temp.d(30), pg_temp.d(60), 'a5a5a5a5-0000-4000-8000-0000000000a2', pg_temp.d(60), pg_temp.d(60));
  insert into public.announcement_recipients (announcement_id, client_account_id, organization_id) values
    ('a5a5a5a5-6000-4000-8000-000000000002', 'a5a5a5a5-1000-4000-8000-000000000001', org), ('a5a5a5a5-6000-4000-8000-000000000002', 'a5a5a5a5-1000-4000-8000-000000000002', org);

  set local session_replication_role = origin;

  -- ---------------------------------------------------------------- avisos: rotina do sistema (prazos próximos/vencidos) + alguns avisos de conversa
  perform set_config('request.jwt.claims', jsonb_build_object('sub', 'a5a5a5a5-0000-4000-8000-0000000000a1', 'aal', 'aal2')::text, true);
  perform public.pt_refresh(org);
  perform set_config('request.jwt.claims', '', true);
  insert into public.notifications (organization_id, client_account_id, user_id, type, title, body, resource_type, resource_id, dedup_key, created_at)
  select org, rq.client_account_id, m.user_id, 'request_comment', 'Nova resposta na solicitação #' || rq.number, rq.title, 'request', rq.id, 'seed:' || rq.id || ':' || m.user_id, now() - interval '3 hours'
  from public.requests rq join public.client_members m on m.client_account_id = rq.client_account_id and m.role = 'client_admin'
  where rq.organization_id = org and rq.status = 'waiting_client' limit 6;
end
$seed$;
