// Condições de regra em JSON: gramática fechada (fatos e operadores autorizados). Nada de código arbitrário, nada de eval.
// Decisão D-C2: avaliador próprio em vez de json-rules-engine — o domínio só precisa de AND/OR/NOT sobre ~10 fatos,
// a avaliação é síncrona e determinística, e evita dependência transitiva (ver docs/OPEN_SOURCE_AUDIT.md).
import { CommissionError, D } from './decimal';
import type { Condition, Dimension, Fact, Leaf, Op } from './types';

export type FactValues = Partial<Record<Fact, string | number | null>>;

const FACTS: readonly Fact[] = ['seller.id', 'seller.team_id', 'seller.type', 'product.id', 'product.category_id', 'sale.channel', 'customer.id', 'sale.net_cents', 'item.net_cents', 'item.quantity'];
const NUMERIC: ReadonlySet<Fact> = new Set<Fact>(['sale.net_cents', 'item.net_cents', 'item.quantity']);
const OPS: readonly Op[] = ['eq', 'ne', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'between'];
const MAX_DEPTH = 4;
const MAX_NODES = 30;
const MAX_LIST = 50;

const bad = (msg: string): never => {
  throw new CommissionError('INVALID_CONDITION', msg);
};

/** Valida a estrutura (rejeita chaves desconhecidas, fatos/operadores fora da lista, excesso de profundidade/tamanho). */
export function parseCondition(raw: unknown): Condition {
  let nodes = 0;
  const walk = (x: unknown, depth: number): Condition => {
    if (++nodes > MAX_NODES) bad('Condição grande demais.');
    if (depth > MAX_DEPTH) bad('Condição profunda demais.');
    if (typeof x !== 'object' || x === null || Array.isArray(x)) return bad('Condição deve ser um objeto.');
    const o = x as Record<string, unknown>;
    const keys = Object.keys(o);
    if ('all' in o || 'any' in o) {
      const k = 'all' in o ? 'all' : 'any';
      if (keys.length !== 1 || !Array.isArray(o[k]) || (o[k] as unknown[]).length === 0 || (o[k] as unknown[]).length > MAX_NODES) bad(`«${k}» inválido.`);
      const list = (o[k] as unknown[]).map((c) => walk(c, depth + 1));
      return k === 'all' ? { all: list } : { any: list };
    }
    if ('not' in o) {
      if (keys.length !== 1) bad('«not» inválido.');
      return { not: walk(o.not, depth + 1) };
    }
    if (keys.length !== 3 || !('fact' in o) || !('op' in o) || !('value' in o)) return bad('Condição deve ter fact, op e value.');
    if (!FACTS.includes(o.fact as Fact)) bad(`Fato não autorizado: ${String(o.fact)}`);
    if (!OPS.includes(o.op as Op)) bad(`Operador não autorizado: ${String(o.op)}`);
    const fact = o.fact as Fact;
    const op = o.op as Op;
    const v = o.value;
    const scalar = (s: unknown): string | number => {
      if (typeof s === 'string' && s.length <= 200) return s;
      if (typeof s === 'number' && Number.isFinite(s)) return s;
      return bad('Valor de condição inválido.');
    };
    if (op === 'in' || op === 'not_in' || op === 'between') {
      if (!Array.isArray(v) || v.length === 0 || v.length > MAX_LIST) bad('Lista de valores inválida.');
      const arr = (v as unknown[]).map(scalar);
      if (op === 'between' && arr.length !== 2) bad('«between» exige dois valores.');
      if (op === 'between' && !NUMERIC.has(fact)) bad('«between» só vale para fatos numéricos.');
      return { fact, op, value: arr } satisfies Leaf;
    }
    if (['gt', 'gte', 'lt', 'lte'].includes(op) && !NUMERIC.has(fact)) bad('Comparação numérica em fato não numérico.');
    return { fact, op, value: scalar(v) } satisfies Leaf;
  };
  return walk(raw, 1);
}

const isLeaf = (c: Condition): c is Leaf => 'fact' in c;

function num(v: unknown): InstanceType<typeof D> | null {
  if (v === null || v === undefined || v === '') return null;
  try {
    const d = new D(v as string | number);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

function evalLeaf(l: Leaf, facts: FactValues): boolean {
  const actual = facts[l.fact] ?? null;
  const numeric = NUMERIC.has(l.fact);
  const eq = (a: unknown, b: unknown): boolean => {
    if (numeric) {
      const x = num(a), y = num(b);
      return x !== null && y !== null && x.eq(y);
    }
    return a !== null && String(a) === String(b);
  };
  switch (l.op) {
    case 'eq': return eq(actual, l.value);
    case 'ne': return !eq(actual, l.value);
    case 'in': return (l.value as Array<string | number>).some((v) => eq(actual, v));
    case 'not_in': return !(l.value as Array<string | number>).some((v) => eq(actual, v));
    default: {
      const a = num(actual);
      if (a === null) return false;
      if (l.op === 'between') {
        const [lo, hi] = (l.value as Array<string | number>).map(num);
        return !!lo && !!hi && a.gte(lo) && a.lte(hi);
      }
      const b = num(l.value);
      if (b === null) return false;
      return l.op === 'gt' ? a.gt(b) : l.op === 'gte' ? a.gte(b) : l.op === 'lt' ? a.lt(b) : a.lte(b);
    }
  }
}

export function evalCondition(c: Condition | null, facts: FactValues): boolean {
  if (c === null) return true;
  if (isLeaf(c)) return evalLeaf(c, facts);
  if ('all' in c) return c.all.every((x) => evalCondition(x, facts));
  if ('any' in c) return c.any.some((x) => evalCondition(x, facts));
  return !evalCondition(c.not, facts);
}

const FACT_DIM: Partial<Record<Fact, Dimension>> = {
  'seller.id': 'seller', 'seller.team_id': 'team', 'product.id': 'product', 'product.category_id': 'category', 'sale.channel': 'channel',
};

/** Dimensões que a condição fixa por igualdade no nível superior (alimentam a especificidade da regra). */
export function conditionDimensions(c: Condition | null): Dimension[] {
  if (c === null) return [];
  const leaves: Condition[] = 'all' in c ? c.all : [c];
  const out = new Set<Dimension>();
  for (const l of leaves) {
    if (isLeaf(l) && (l.op === 'eq' || l.op === 'in')) {
      const d = FACT_DIM[l.fact];
      if (d) out.add(d);
    }
  }
  return [...out].sort();
}
