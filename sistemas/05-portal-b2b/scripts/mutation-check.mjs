#!/usr/bin/env node
// Teste de mutação das regras críticas do banco: quebra cada regra DE PROPÓSITO numa cópia das migrações
// e exige que a suíte (pnpm test:db) reprove. Se alguma mutação sobreviver, falta teste.
// Uso: node scripts/mutation-check.mjs [--only <trecho do nome>] [--jobs 3]
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const jobs = Number(args.includes('--jobs') ? args[args.indexOf('--jobs') + 1] : 3);

// { name, file (trecho do arquivo), find, replace, nth (1 = primeira ocorrência) }
// { name, file (trecho do arquivo), find, replace, nth (1 = primeira ocorrência) }
const M = [
  // --- RLS: o que o cliente e a equipe enxergam
  { name: 'RLS: cliente vê comentário interno', file: 'pt_schema', find: "or (visibility = 'shared' and private.pt_client_role(client_account_id) is not null));", replace: 'or (private.pt_client_role(client_account_id) is not null));' },
  { name: 'RLS: usuário desativado mantém acesso', file: 'pt_schema', nth: 1, find: "cm.user_id = (select auth.uid()) and cm.status = 'active' and ca.status = 'active' and ca.archived_at is null", replace: "cm.user_id = (select auth.uid()) and ca.status = 'active' and ca.archived_at is null" },
  { name: 'RLS: conta inativa ou arquivada mantém acesso', file: 'pt_schema', nth: 1, find: "cm.user_id = (select auth.uid()) and cm.status = 'active' and ca.status = 'active' and ca.archived_at is null", replace: "cm.user_id = (select auth.uid()) and cm.status = 'active'" },
  { name: 'RLS: colaborador vê todos os clientes', file: 'pt_schema', find: "in ('owner', 'admin', 'manager', 'viewer')", replace: "in ('owner', 'admin', 'manager', 'viewer', 'member')" },
  { name: 'RLS: observações internas visíveis ao cliente', file: 'pt_schema', find: 'create policy notes_select on public.client_internal_notes for select to authenticated using (private.pt_staff_sees_client(client_account_id));', replace: 'create policy notes_select on public.client_internal_notes for select to authenticated using (private.pt_sees_client(client_account_id));' },
  { name: 'RLS: notificações de outros usuários', file: 'pt_schema', find: 'create policy notifications_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));', replace: 'create policy notifications_select on public.notifications for select to authenticated using (true);' },
  { name: 'segurança: hash do token legível', file: 'pt_schema', find: 'grant select (id, organization_id, client_account_id, kind, invited_email,', replace: 'grant select (id, organization_id, client_account_id, kind, token_hash, invited_email,' },
  { name: 'histórico: comentários editáveis', file: 'pt_schema', find: 'create trigger comments_immutable before update or delete on public.request_comments for each row execute function private.pt_comment_immutable();', replace: '' },
  { name: 'histórico: mudanças de status editáveis', file: 'pt_schema', find: 'create trigger history_append_only before update or delete on public.request_status_history for each row execute function private.pt_append_only();', replace: '' },
  { name: 'histórico: trilha de acessos editável', file: 'pt_schema', find: 'create trigger doc_logs_append_only before update or delete on public.document_access_logs for each row execute function private.pt_append_only();', replace: '' },
  // --- solicitações: estados, prazos, comentários
  { name: 'estados: reabertura fora da janela', file: 'pt_workflow', find: 'make_interval(days => coalesce(win, 15))', replace: 'make_interval(days => 100000)' },
  { name: 'regras: cliente define prioridade urgente', file: 'pt_workflow', find: "if who = 'client' and p_priority = 'urgent' then", replace: 'if false then' },
  { name: 'regras: cliente escreve comentário interno', file: 'pt_workflow', find: "if who = 'client' and p_visibility <> 'shared' then", replace: 'if false then' },
  { name: 'regras: resposta do cliente não muda a situação', file: 'pt_workflow', find: "if who = 'client' and r.status = 'waiting_client' then", replace: 'if false then' },
  { name: 'prazo: prazo no passado aceito', file: 'pt_workflow', find: 'if p_due is null or p_due <= now() then', replace: 'if p_due is null then' },
  { name: 'horas úteis: fim de semana conta', file: 'pt_workflow', find: 'if extract(isodow from t)::int = any (p_days) then', replace: 'if true then' },
  { name: 'permissão: colaborador define prazo combinado', file: 'pt_workflow', find: "if not private.pt_is_manager(r.organization_id) then raise exception 'sem permissão' using errcode = '42501'; end if; -- prazo combinado: gestão", replace: '' },
  { name: 'permissão: colaborador cria categorias', file: 'pt_schema', find: 'create policy categories_write on public.service_categories for all to authenticated using (private.pt_is_admin(organization_id))', replace: 'create policy categories_write on public.service_categories for all to authenticated using (true)' },
  { name: 'permissão: colaborador arquiva documento', file: 'pt_content', find: "or not private.pt_is_manager(d.organization_id) then", replace: 'then' },
  { name: 'rotina: qualquer usuário roda pt_refresh', file: 'pt_workflow', find: "if (select auth.uid()) is null or not private.pt_is_manager(p_org) or not private.mfa_ok() then raise exception 'sem permissão' using errcode = '42501'; end if;", replace: 'null;' },
  // --- notificações
  { name: 'notificações: preferência de silenciar ignorada', file: 'pt_workflow', find: 'and p_type = any (np.muted_types)) then return; end if;', replace: 'and false) then return; end if;' },
  // --- documentos
  { name: 'documentos: tamanho sem limite', file: 'pt_content', find: 'p_size > coalesce(mb, 20)::bigint * 1048576', replace: 'false' },
  { name: 'documentos: acesso sem registro na trilha', file: 'pt_content', nth: 2, find: 'insert into public.document_access_logs', replace: 'select 1; -- ' },
  // --- convites e membros
  { name: 'convites: o token bruto é guardado', file: 'pt_content', find: "encode(sha256(convert_to(token, 'UTF8')), 'hex')", replace: 'token' },
  { name: 'membros: último administrador do cliente', file: 'pt_content', find: 'if admins = 0 then raise exception', replace: 'if false then raise exception' },
  // --- indicadores
  ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ name: `métricas: função ${n} sem isolamento (security definer)`, file: 'pt_metrics', nth: n, find: 'security invoker', replace: 'security definer' })),
];

const migDir = join(root, 'supabase', 'migrations');
const files = readdirSync(migDir).filter((f) => f.endsWith('.sql'));

function runSuite(dir) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [join(dir, 'scripts', 'test-db.mjs')], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ code, out }));
  });
}

function workspace(label, mutate) {
  const dir = mkdtempSync(join(tmpdir(), `pack25-mut-${label}-`));
  mkdirSync(join(dir, 'scripts'));
  cpSync(join(root, 'scripts', 'test-db.mjs'), join(dir, 'scripts', 'test-db.mjs'));
  cpSync(join(root, 'supabase'), join(dir, 'supabase'), { recursive: true });
  if (mutate) {
    const f = files.find((x) => x.includes(mutate.file));
    const path = join(dir, 'supabase', 'migrations', f);
    let text = readFileSync(path, 'utf8');
    const parts = text.split(mutate.find);
    const nth = mutate.nth ?? 1;
    if (parts.length < 2) throw new Error(`mutação sem alvo: ${mutate.name}`);
    if (parts.length > 2 && !mutate.nth) throw new Error(`mutação ambígua (${parts.length - 1} ocorrências): ${mutate.name}`);
    if (nth > parts.length - 1) throw new Error(`mutação sem a ocorrência ${nth}: ${mutate.name}`);
    text = parts.slice(0, nth).join(mutate.find) + mutate.replace + parts.slice(nth).join(mutate.find);
    writeFileSync(path, text);
  }
  return dir;
}

const base = workspace('base', null);
const baseline = await runSuite(base);
rmSync(base, { recursive: true, force: true });
if (baseline.code !== 0) {
  console.error('A suíte sem mutação já reprova; corrija antes.\n' + baseline.out.slice(-1500));
  process.exit(2);
}

const todo = M.filter((m) => !only || m.name.includes(only));
const survived = [];
const broken = [];
let next = 0;
async function worker() {
  while (next < todo.length) {
    const m = todo[next++];
    let dir;
    try {
      dir = workspace(String(next), m);
    } catch (e) {
      console.log(`SEM ALVO    ${m.name} — ${e.message}`);
      broken.push(m.name);
      continue;
    }
    const r = await runSuite(dir);
    rmSync(dir, { recursive: true, force: true });
    const killed = r.code !== 0;
    console.log(`${killed ? 'MORTA    ' : 'SOBREVIVEU'}  ${m.name}`);
    if (!killed) survived.push(m.name);
  }
}
await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));
console.log(`\n${todo.length - survived.length - broken.length}/${todo.length} mutações reprovadas pela suíte.`);
if (broken.length) console.error('Mutações sem alvo (o texto mudou):\n- ' + broken.join('\n- '));
if (survived.length) console.error('Sobreviveram:\n- ' + survived.join('\n- '));
if (survived.length || broken.length) process.exit(1);
