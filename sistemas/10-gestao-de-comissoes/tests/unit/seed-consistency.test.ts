// Integração (só com Supabase local semeado): o que o motor produz a partir dos FATOS LIDOS DO BANCO por produção deve coincidir com o livro semeado.
// Prova que o seed (ids simbólicos) e a leitura de produção (lib/commissions/facts.ts) concordam: recalcular não gera NENHUM lançamento novo.
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { Context } from '@/lib/auth/session';
import { computeCommissions, evaluateGoals } from '@/lib/commissions/engine';
import { loadFacts } from '@/lib/commissions/facts';
import { loadGoalContext } from '@/lib/commissions/run';

const URL = process.env.E2E_SUPABASE_URL;
const KEY = process.env.E2E_SUPABASE_ANON_KEY;

describe.skipIf(!URL || !KEY)('seed × leitura de produção', () => {
  it('recalcular o seed não gera lançamentos novos nem pendências críticas', async () => {
    const supabase = createClient(URL!, KEY!, { auth: { persistSession: false } });
    const { error } = await supabase.auth.signInWithPassword({ email: 'financeiro@demo.exemplo', password: 'DemoLocal#2026' });
    expect(error).toBeNull();
    const { data } = await supabase.from('sales').select('id').neq('status', 'draft');
    const ctx = { supabase } as unknown as Context;
    const facts = await loadFacts(ctx, (data ?? []).map((r: { id: string }) => r.id));
    expect(facts.sales.length).toBeGreaterThan(10);
    const out = computeCommissions({ sales: facts.sales, booked: facts.booked });
    expect(out.pendencies.filter((p) => p.severity === 'critical')).toEqual([]);
    expect(out.entries).toEqual([]);
  });
  it('metas: os bônus lançados no seed já estão no livro', async () => {
    const supabase = createClient(URL!, KEY!, { auth: { persistSession: false } });
    await supabase.auth.signInWithPassword({ email: 'financeiro@demo.exemplo', password: 'DemoLocal#2026' });
    const gc = await loadGoalContext({ supabase } as unknown as Context);
    expect(gc.goals.length).toBeGreaterThan(0);
    const today = new Date().toISOString().slice(0, 10);
    const out = evaluateGoals(gc.goals, gc.sales, gc.booked, today);
    expect(out.entries).toEqual([]);
  });
});
