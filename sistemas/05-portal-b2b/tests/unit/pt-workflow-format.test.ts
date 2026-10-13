import { describe, expect, it } from 'vitest';
import { REQUEST_STATUSES } from '@/lib/portal/format';
import { bucketLabel, dueInfo, formatBytes, formatDate, formatDocument, formatHours, formatPct, requestCode, variationPct } from '@/lib/portal/format';
import { canReopen, needsReason, nextStatuses, transitionAllowed } from '@/lib/portal/workflow';

describe('máquina de estados (espelho da regra do banco)', () => {
  it('a equipe pode quase tudo, menos «aberta» como destino, sair de cancelada ou sair de concluída (só reabre)', () => {
    expect(nextStatuses('staff', 'open')).toEqual(['in_review', 'in_progress', 'waiting_client', 'waiting_provider', 'completed', 'cancelled']);
    expect(nextStatuses('staff', 'in_progress')).toEqual(['in_review', 'waiting_client', 'waiting_provider', 'completed', 'cancelled']);
    expect(nextStatuses('staff', 'completed')).toEqual(['open']);
    expect(nextStatuses('staff', 'cancelled')).toEqual([]);
    expect(transitionAllowed('staff', 'open', 'open')).toBe(false);
  });
  it('o cliente só cancela solicitação ainda não iniciada e só reabre concluída', () => {
    expect(nextStatuses('client', 'open')).toEqual(['cancelled']);
    expect(nextStatuses('client', 'in_review')).toEqual(['cancelled']);
    for (const s of ['in_progress', 'waiting_client', 'waiting_provider', 'cancelled'] as const) expect(nextStatuses('client', s), s).toEqual([]);
    expect(nextStatuses('client', 'completed')).toEqual(['open']);
    // o cliente nunca conclui nem muda para situações internas
    for (const to of REQUEST_STATUSES) if (to !== 'cancelled' && to !== 'open') for (const from of REQUEST_STATUSES) expect(transitionAllowed('client', from, to)).toBe(false);
  });
  it('motivo obrigatório ao cancelar e ao reabrir', () => {
    expect(needsReason('open', 'cancelled')).toBe(true);
    expect(needsReason('completed', 'open')).toBe(true);
    expect(needsReason('open', 'in_review')).toBe(false);
  });
  it('janela de reabertura: dentro e fora (borda inclusiva)', () => {
    const now = Date.parse('2026-10-13T12:00:00Z');
    expect(canReopen('2026-10-01T12:00:00Z', 15, now)).toBe(true);
    expect(canReopen('2026-09-28T12:00:00Z', 15, now)).toBe(true); // exatamente 15 dias
    expect(canReopen('2026-09-28T11:59:59Z', 15, now)).toBe(false);
    expect(canReopen('2026-10-13T11:00:00Z', 0, now)).toBe(false); // janela 0: o cliente nunca reabre
    expect(canReopen(null, 15, now)).toBe(false);
  });
});

describe('formatação pt-BR', () => {
  it('«sem dados» nunca vira zero', () => {
    expect(formatPct(null)).toBe('—');
    expect(formatPct(0)).toBe('0,0%');
    expect(formatPct(66.666)).toBe('66,7%');
    expect(formatHours(null)).toBe('—');
    expect(formatHours(3.55)).toBe('3,6 h');
    expect(formatHours(47.9)).toBe('47,9 h');
    expect(formatHours(48)).toBe('2 d');
    expect(formatHours(52)).toBe('2 d 4 h');
  });
  it('datas de calendário não sofrem deslocamento de fuso', () => {
    expect(formatDate('2026-10-13')).toBe('13/10/2026');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('lixo')).toBe('—');
  });
  it('código da solicitação, tamanho de arquivo, CPF/CNPJ e variação', () => {
    expect(requestCode(42)).toBe('SOL-0042');
    expect(requestCode(12345)).toBe('SOL-12345');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1,5 KB');
    expect(formatBytes(5 * 1048576)).toBe('5,0 MB');
    expect(formatDocument('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatDocument('52998224725')).toBe('529.982.247-25');
    expect(variationPct(150, 100)).toBe(50);
    expect(variationPct(5, 0)).toBeNull();
    expect(variationPct(null, 3)).toBeNull();
  });
  it('rótulo de série: dia/semana e mês', () => {
    expect(bucketLabel('2026-10-13', 'day')).toBe('13/10');
    expect(bucketLabel('2026-10-01', 'month')).toBe('out/26');
  });
});

describe('situação do prazo', () => {
  const now = Date.parse('2026-10-13T12:00:00Z');
  it('concluída/cancelada não tem prazo corrente; sem prazo, sem alarme', () => {
    expect(dueInfo({ status: 'completed', due_at: '2026-01-01T00:00:00Z' }, now).label).toBe('—');
    expect(dueInfo({ status: 'open', due_at: null }, now)).toMatchObject({ label: 'Sem prazo', late: false });
  });
  it('atrasada, vence em breve (janela configurável) e dentro do prazo', () => {
    expect(dueInfo({ status: 'open', due_at: '2026-10-13T11:59:59Z' }, now)).toMatchObject({ tone: 'danger', late: true });
    expect(dueInfo({ status: 'in_progress', due_at: '2026-10-13T20:00:00Z' }, now, 24).tone).toBe('warning');
    expect(dueInfo({ status: 'in_progress', due_at: '2026-10-13T20:00:00Z' }, now, 4).tone).toBe('neutral');
    expect(dueInfo({ status: 'waiting_client', due_at: '2026-10-20T12:00:00Z' }, now).tone).toBe('neutral');
  });
});
