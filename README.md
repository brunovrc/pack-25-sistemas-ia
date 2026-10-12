# Pack 25 Sistemas IA

25 sistemas MVP para pequenas e médias empresas, prontos para você personalizar com **Claude Code** ou **Codex**, conectar a um banco Supabase seu e publicar.

> ## Estado real (2026-10-11)
> **Nenhum dos 25 sistemas está disponível para uso ainda.** Esta é a fundação do projeto: catálogo, padrões de segurança e privacidade, estrutura das pastas e o núcleo de banco (organizações, papéis, RLS e auditoria), este último com testes executados. O status de cada sistema abaixo é lido de [catalogo/sistemas.json](catalogo/sistemas.json) e só muda após os gates de qualidade. Nada aqui promete renda ou vendas: o pack reduz tempo de desenvolvimento; implantar e vender depende de adequação, testes, hospedagem, suporte e prospecção.

## Catálogo

| # | Sistema | Categoria | Repositório individual | Status |
|---|---|---|---|---|
| 01 | CRM Comercial | Comercial | `pack25-01-crm-comercial` | PLANEJADO |
| 02 | Propostas Comerciais | Comercial | `pack25-02-propostas-comerciais` | PLANEJADO |
| 03 | Qualificador de Leads | Comercial | `pack25-03-qualificador-leads` | PLANEJADO |
| 04 | Pós-venda e Recompra | Comercial | `pack25-04-pos-venda` | PLANEJADO |
| 05 | Portal do Cliente B2B | Comercial | `pack25-05-portal-b2b` | PLANEJADO |
| 06 | Financeiro | Gestão | `pack25-06-financeiro` | PLANEJADO |
| 07 | Estoque | Gestão | `pack25-07-estoque` | PLANEJADO |
| 08 | Precificação | Gestão | `pack25-08-precificacao` | PLANEJADO |
| 09 | Dashboard Executivo | Gestão | `pack25-09-dashboard-executivo` | PLANEJADO |
| 10 | Comissões | Gestão | `pack25-10-comissoes` | PLANEJADO |
| 11 | Agendamentos | Operações | `pack25-11-agendamentos` | PLANEJADO |
| 12 | Chamados e Suporte | Operações | `pack25-12-chamados` | PLANEJADO |
| 13 | Ordens de Serviço | Operações | `pack25-13-ordens-servico` | PLANEJADO |
| 14 | Gestão de Projetos | Operações | `pack25-14-projetos` | PLANEJADO |
| 15 | Gestão de Contratos | Operações | `pack25-15-contratos` | PLANEJADO |
| 16 | Dashboard de Marketing | Marketing | `pack25-16-dashboard-marketing` | PLANEJADO |
| 17 | NPS e Satisfação | Marketing | `pack25-17-nps` | PLANEJADO |
| 18 | Programa de Fidelidade | Marketing | `pack25-18-fidelidade` | PLANEJADO |
| 19 | Conteúdo com IA | Marketing | `pack25-19-conteudo-ia` | PLANEJADO |
| 20 | Afiliados e Parceiros | Marketing | `pack25-20-afiliados` | PLANEJADO |
| 21 | CRM Imobiliário | Verticais | `pack25-21-crm-imobiliario` | PLANEJADO |
| 22 | Cardápio Digital e Pedidos | Verticais | `pack25-22-cardapio` | PLANEJADO |
| 23 | Gestão de Academias | Verticais | `pack25-23-academias` | PLANEJADO |
| 24 | Gestão Escolar | Verticais | `pack25-24-escolas` | PLANEJADO |
| 25 | Eventos e Credenciamento | Verticais | `pack25-25-eventos` | PLANEJADO |

## Como obter só o sistema que você quer

**Opção A — repositório do sistema (mais simples):** cada sistema validado é publicado em um repositório próprio.

```bash
git clone https://github.com/<ORG>/pack25-01-crm-comercial.git
```

**Opção B — só a pasta, a partir deste repositório (sparse checkout):**

```bash
git clone --filter=blob:none --no-checkout https://github.com/<ORG>/pack-25-sistemas-ia.git
cd pack-25-sistemas-ia
git sparse-checkout set --cone sistemas/01-crm-comercial
git checkout main
```

O GitHub **não** permite `git clone` de uma subpasta; use uma das opções acima. Repositórios privados exigem autenticação e permissão de leitura. Detalhes em [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md).

## Pilares

- **Seguro por padrão:** isolamento por empresa com RLS testado, auditoria imutável, validação no servidor. Veja [docs/SECURITY_STANDARD.md](docs/SECURITY_STANDARD.md).
- **LGPD desde o projeto:** solicitações de titulares, minimização, retenção e guia por risco. Veja [docs/LGPD_GUIDE.md](docs/LGPD_GUIDE.md). Não substitui assessoria jurídica.
- **Autônomo:** cada sistema é independente, com banco, testes e documentação próprios.

## Custos previstos de infraestrutura

Você precisará de um projeto **Supabase** (banco, autenticação, armazenamento) e de hospedagem para a aplicação Next.js. Os planos gratuitos têm limites e, em alguns provedores, **restrição a uso comercial**; confira preços e termos vigentes antes de implantar para um cliente. Recursos de IA têm custo por uso do provedor que você escolher e são opcionais.

## Limites comerciais

Os sistemas são MVPs. Não incluem: emissão fiscal, contabilidade, assinatura eletrônica certificada, pagamento integrado, envio em massa ou automação de WhatsApp (ver "fora do escopo" de cada sistema no catálogo). Valores de implantação no catálogo são ilustrativos.

## Perguntas frequentes

**Posso usar com dados reais de clientes?** Sim, depois de configurar seu Supabase, revisar a LGPD ([guia](docs/LGPD_GUIDE.md)) e testar. Nunca use dados reais em ambientes de demonstração.
**Preciso saber programar?** Ajuda. O pack foi desenhado para personalização guiada por Claude Code ou Codex ([guias](guias/)).
**E se eu achar uma falha de segurança?** Veja [SECURITY.md](SECURITY.md).

## Licença e suporte

[LICENSE.md](LICENSE.md) (rascunho em revisão) · [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) · Canal de suporte: a definir pelo titular antes do lançamento.
