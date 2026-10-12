'use client';

import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Alert, Button, Select, Textarea } from '@/components/ui/primitives';
import { moveOpportunity } from '@/lib/crm/actions';
import { formatBRL, formatDate } from '@/lib/crm/format';
import { cn } from '@/lib/utils';
import { Modal } from './modal';

export type KStage = { id: string; name: string; kind: 'open' | 'won' | 'lost'; color: string | null; probability: number };
export type KOpp = { id: string; title: string; value: number; stage_id: string; owner_label: string | null; company_name: string | null; expected_close_date: string | null; can_move: boolean };
type Reason = { value: string; label: string };

function Card({ opp, stages, onMove, overlay = false }: { opp: KOpp; stages: KStage[]; onMove: (opp: KOpp, stageId: string) => void; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: opp.id, disabled: !opp.can_move || overlay, data: { opp } });
  return (
    <li ref={setNodeRef} className={cn('rounded-md border border-border bg-card p-3 text-sm shadow-sm', isDragging && 'opacity-40', overlay && 'shadow-lg')}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/opportunities/${opp.id}`} className="font-medium hover:underline">{opp.title}</Link>
        {opp.can_move ? (
          <button type="button" aria-label={`Arrastar ${opp.title}`} className="cursor-grab touch-none rounded px-1 text-muted hover:bg-black/5 dark:hover:bg-white/10" {...listeners} {...attributes}>⠿</button>
        ) : null}
      </div>
      <p className="mt-1 tabular-nums">{formatBRL(opp.value)}</p>
      <p className="mt-1 text-xs text-muted">{[opp.company_name, opp.owner_label].filter(Boolean).join(' · ') || 'Sem empresa'}</p>
      {opp.expected_close_date ? <p className="text-xs text-muted">Previsão: {formatDate(opp.expected_close_date)}</p> : null}
      {opp.can_move && !overlay ? (
        <div className="mt-2">
          <label className="sr-only" htmlFor={`mv-${opp.id}`}>Mover {opp.title} para</label>
          <Select id={`mv-${opp.id}`} value="" onChange={(e) => e.target.value && onMove(opp, e.target.value)} className="min-h-8 text-xs">
            <option value="">Mover para…</option>
            {stages.filter((s) => s.id !== opp.stage_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
      ) : null}
    </li>
  );
}

function Column({ stage, opps, stages, onMove }: { stage: KStage; opps: KOpp[]; stages: KStage[]; onMove: (opp: KOpp, stageId: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = opps.reduce((s, o) => s + o.value, 0);
  return (
    <section aria-label={`Etapa ${stage.name}`} className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-black/[0.02] dark:bg-white/[0.03]">
      <header className="border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{stage.name}</h2>
          <span className="rounded-full border border-border px-2 text-xs tabular-nums">{opps.length}</span>
        </div>
        <p className="text-xs text-muted tabular-nums">{formatBRL(total)}{stage.kind === 'open' ? ` · ${stage.probability}%` : ''}</p>
      </header>
      <ul ref={setNodeRef} className={cn('flex min-h-24 flex-1 flex-col gap-2 p-2', isOver && 'bg-accent/10')}>
        {opps.map((o) => <Card key={o.id} opp={o} stages={stages} onMove={onMove} />)}
        {opps.length === 0 ? <li className="px-2 py-4 text-center text-xs text-muted">Solte aqui</li> : null}
      </ul>
    </section>
  );
}

export function KanbanBoard({ stages, opportunities, reasons }: { stages: KStage[]; opportunities: KOpp[]; reasons: Reason[] }) {
  const router = useRouter();
  const [items, setItems] = useState(opportunities);
  const [dragging, setDragging] = useState<KOpp | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingLoss, setPendingLoss] = useState<{ opp: KOpp; stageId: string } | null>(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  function persist(opp: KOpp, stageId: string, lossReason = '', lossNotes = '') {
    const previous = items;
    setItems((cur) => cur.map((o) => (o.id === opp.id ? { ...o, stage_id: stageId } : o)));
    setMessage(null);
    startTransition(async () => {
      const result = await moveOpportunity({ id: opp.id, stage_id: stageId, loss_reason_id: lossReason, loss_notes: lossNotes });
      if (!result.ok) {
        setItems(previous);
        setMessage(result.message ?? 'Não foi possível mover a oportunidade.');
      } else {
        router.refresh();
      }
    });
  }

  function requestMove(opp: KOpp, stageId: string) {
    if (stageId === opp.stage_id) return;
    const target = stages.find((s) => s.id === stageId);
    if (!target) return;
    if (target.kind === 'lost') {
      setReason('');
      setNotes('');
      setPendingLoss({ opp, stageId });
      return;
    }
    persist(opp, stageId);
  }

  function onDragStart(e: DragStartEvent) {
    setDragging((e.active.data.current as { opp: KOpp } | undefined)?.opp ?? null);
  }
  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const opp = (e.active.data.current as { opp: KOpp } | undefined)?.opp;
    if (opp && e.over) requestMove(items.find((o) => o.id === opp.id) ?? opp, String(e.over.id));
  }

  return (
    <>
      {message ? <div className="mb-3"><Alert tone="error">{message}</Alert></div> : null}
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        {/* relative: sem isso os rótulos sr-only (position:absolute) escapam do recorte e alargam a página no celular */}
        <div className="relative flex gap-4 overflow-x-auto pb-4" aria-busy={busy}>
          {stages.map((s) => <Column key={s.id} stage={s} stages={stages} opps={items.filter((o) => o.stage_id === s.id)} onMove={requestMove} />)}
        </div>
        <DragOverlay>{dragging ? <div className="w-72"><ul><Card opp={dragging} stages={stages} onMove={() => {}} overlay /></ul></div> : null}</DragOverlay>
      </DndContext>

      <Modal open={pendingLoss !== null} onClose={() => setPendingLoss(null)} title="Motivo da perda">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pendingLoss || !reason) return;
            persist(pendingLoss.opp, pendingLoss.stageId, reason, notes);
            setPendingLoss(null);
          }}
        >
          <p className="text-sm text-muted">Informe por que <strong>{pendingLoss?.opp.title}</strong> foi perdida. Isso alimenta o relatório de perdas.</p>
          <div>
            <label htmlFor="loss-reason" className="mb-1 block text-sm font-medium">Motivo</label>
            <Select id="loss-reason" value={reason} onChange={(e) => setReason(e.target.value)} required>
              <option value="">Selecione…</option>
              {reasons.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="loss-notes" className="mb-1 block text-sm font-medium">Detalhes (opcional)</label>
            <Textarea id="loss-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="danger" disabled={!reason}>Marcar como perdida</Button>
            <Button type="button" variant="secondary" onClick={() => setPendingLoss(null)}>Cancelar</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
