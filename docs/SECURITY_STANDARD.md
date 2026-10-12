# SECURITY_STANDARD — Padrão de segurança obrigatório

Referência de aceite: **OWASP ASVS 4.0 nível 2** (aplicações com dados pessoais). Cada sistema só é `VALIDADO` com este checklist cumprido ou com exceção justificada em `docs/DECISIONS.md`. Este documento não é certificação de segurança; é o piso de engenharia.

## 1. Princípios
Negar por padrão · menor privilégio · defesa em profundidade · segurança nunca só no frontend · falhar fechado · minimizar dados · tudo que é público é hostil.

## 2. Autenticação e sessão
- Supabase Auth; cookies de sessão via `@supabase/ssr`, `HttpOnly`, `Secure`, `SameSite=Lax` ou mais estrito.
- Senha mínima de 12 caracteres e checagem de vazamento quando disponível; recuperação com token de uso único e expiração curta.
- **MFA (TOTP) obrigatório para `owner` e `admin`** a partir do Core web.
- Mensagens de login/recuperação sem enumeração de usuário; rate limit por IP e por conta.
- Convite de membros por token único e expirável; revogação imediata ao remover membro.

## 3. Autorização (a regra mais importante)
- RLS em **toda** tabela de `public`; testes A/B (SELECT/INSERT/UPDATE/DELETE) obrigatórios por sistema.
- **Toda** Server Action e Route Handler valida sessão, papel e propriedade do recurso. Middleware é conveniência de UX, **nunca** a única barreira (cf. CVE-2025-29927, contorno de middleware no Next.js).
- IDOR: nunca confiar em `organization_id` enviado pelo cliente; derivar da sessão/associação.
- Chave `service_role` só no servidor, só em código que re-autoriza explicitamente; jamais com prefixo `NEXT_PUBLIC_`.
- Banco: `SECURITY DEFINER` sempre com `search_path` fixo; views com `security_invoker = true`; grants por coluna quando houver colunas sensíveis; `anon` sem privilégios salvo rota pública deliberada.

## 4. Entrada, saída e superfícies públicas
- Validação Zod no servidor para toda entrada; limites de tamanho; listas com paginação máxima.
- Formulários e rotas públicas (qualificador, agendamento, cardápio, NPS, check-in): rate limit, honeypot/CAPTCHA, tamanho de corpo limitado, resposta uniforme (anti-enumeração).
- Ingressos/QR e links rastreáveis: **tokens assinados (HMAC)** com expiração e uso único; verificação em tempo constante.
- Saída: escape padrão do React; proibido `dangerouslySetInnerHTML` sem sanitização revisada.
- CSV: neutralizar fórmulas (`=`, `+`, `-`, `@`, tab) na exportação e na importação (CSV injection).
- Redirecionamentos: apenas para destinos em allowlist.

## 5. Uploads e documentos
- Bucket **privado**; acesso por URL assinada de curta duração; allowlist de tipos por **conteúdo** (magic bytes), não só extensão; tamanho máximo; nome gerado pelo servidor (nunca o enviado); bloqueio de path traversal.
- Imagens reprocessadas quando exibidas publicamente; SVG enviado por usuário não é servido inline.
- Varredura de malware recomendada quando o sistema aceitar documentos de terceiros (ex.: portal, chamados).

## 6. Cabeçalhos e transporte
HTTPS apenas, HSTS · CSP restritiva com nonce (sem `unsafe-inline` em scripts) · `X-Content-Type-Options: nosniff` · `Referrer-Policy: strict-origin-when-cross-origin` · `Permissions-Policy` mínima · `frame-ancestors 'none'` salvo necessidade · CORS fechado por padrão. Server Actions: manter verificação de origem do Next.js ativa.

## 7. Segredos e configuração
- Nada no git; `.env.example` sem valores; segredos no cofre do host; rotação documentada; chaves de IA com orçamento e limite.
- GitHub secret scanning + push protection ligados; `scripts/check-no-secrets.mjs` como rede local.
- Variáveis validadas na inicialização (Zod); aplicação falha ao subir se faltar configuração crítica.

## 8. Cadeia de suprimentos
- `pnpm install --frozen-lockfile`; lockfile versionado; versões exatas das dependências críticas.
- Scripts de instalação de dependências desativados por padrão (allowlist explícita); `pnpm audit` e Dependabot no CI; revisão de licença (`THIRD_PARTY_NOTICES.md`).
- GitHub Actions fixadas por **SHA de commit**; permissões mínimas no `GITHUB_TOKEN`; sem `pull_request_target` com checkout de código externo.
- Skills e scripts de terceiros: leitura integral e fixação de commit antes do uso.
- Gerar SBOM (CycloneDX) na liberação.

## 9. Logs, auditoria e monitoramento
- Logs estruturados com `request_id`; **proibido** registrar senha, token, documento, e-mail completo, corpo de requisição; teste automatizado procura PII em logs.
- `audit_log` imutável, sem valores, com ator, ação e entidade.
- Erros ao usuário sem detalhes técnicos; stack apenas em log privado.

## 10. IA opcional
- Chamada só por ação explícita do usuário; timeout, limite de tokens e orçamento mensal; registro de custo.
- **Prompt injection:** conteúdo de usuário/terceiros entra como dado delimitado, nunca como instrução; saída do modelo é tratada como não confiável (escapada, validada por schema, sem execução).
- Provedor configurável **não** aceita URL arbitrária (SSRF): allowlist de hosts.
- Minimizar e mascarar dados pessoais antes do envio ao provedor; documentar o provedor como operador/suboperador no guia LGPD.
- O sistema funciona sem chave de IA.

## 11. Disponibilidade, backup e resposta a incidentes
- Backup automático do banco + **teste de restauração documentado** em `docs/DEPLOYMENT.md`.
- Plano de resposta a incidente (`docs/LGPD_GUIDE.md` §7) e canal de contato em `SECURITY.md`.

## 12. Modelagem de ameaças (STRIDE) — mínimo por sistema
Registrar em `docs/ARCHITECTURE.md` do sistema: ativos, fronteiras de confiança, e para cada fluxo crítico Spoofing, Tampering, Repudiation, Information disclosure, DoS e Elevation, com o controle e o teste correspondente.

## 13. Checklist de aceite de segurança (por sistema)
- [ ] Teste RLS A/B passa (SELECT/INSERT/UPDATE/DELETE negados) · [ ] Nenhuma tabela sem RLS · [ ] Todos os `SECURITY DEFINER` com `search_path`
- [ ] Server Actions/Route Handlers com sessão + papel + propriedade · [ ] Zod em toda entrada
- [ ] Rotas públicas com rate limit e anti-abuso · [ ] Uploads conforme §5 · [ ] CSV injection tratado
- [ ] Cabeçalhos §6 verificados · [ ] Sem segredos no git · [ ] `pnpm audit` sem críticas/altas sem tratamento
- [ ] Logs sem PII (teste) · [ ] Auditoria imutável · [ ] MFA para owner/admin · [ ] Backup e restauração testados
- [ ] Item de IA §10 (se aplicável) · [ ] STRIDE registrado
