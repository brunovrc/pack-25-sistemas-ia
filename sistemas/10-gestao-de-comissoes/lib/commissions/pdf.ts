import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { brl, dateBR, pctBR } from './format';
import type { Col, Row } from './csv';

// PDF gerado no servidor (pdf-lib, MIT, sem dependências nativas). Fonte padrão Helvetica (WinAnsi): acentos do português funcionam.
const A4: [number, number] = [595.28, 841.89];
const M = 40;
const INK = rgb(0.043, 0.071, 0.125);
const MUTED = rgb(0.4, 0.45, 0.52);
const LINE = rgb(0.8, 0.84, 0.88);

/** Remove caracteres fora do WinAnsi (que quebrariam a fonte padrão). */
export const winAnsi = (s: string): string => s.replace(/[\u0000-\u001f]/g, ' ').replace(/[^ -ÿ–—‘’“”•€]/g, '?');

type Ctx = { doc: PDFDocument; font: PDFFont; bold: PDFFont; page: PDFPage; y: number; title: string; footer: string; n: number };

function newPage(c: Ctx): void {
  c.page = c.doc.addPage(A4);
  c.n += 1;
  c.y = A4[1] - M;
  c.page.drawText(winAnsi(c.title), { x: M, y: c.y, size: 9, font: c.font, color: MUTED });
  c.y -= 22;
}
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = winAnsi(text).split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(t, size) <= width) cur = t;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

export async function startDoc(title: string, footer: string): Promise<Ctx> {
  const doc = await PDFDocument.create();
  doc.setTitle(winAnsi(title));
  doc.setProducer('Gestão de Comissões');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const c = { doc, font, bold, title, footer, n: 0, y: 0 } as Ctx;
  newPage(c);
  return c;
}
export function heading(c: Ctx, text: string, size = 16): void {
  if (c.y < M + 60) newPage(c);
  c.page.drawText(winAnsi(text), { x: M, y: c.y, size, font: c.bold, color: INK });
  c.y -= size + 8;
}
export function para(c: Ctx, text: string, size = 9, color = INK): void {
  for (const l of wrap(text, c.font, size, A4[0] - 2 * M)) {
    if (c.y < M + 30) newPage(c);
    c.page.drawText(l, { x: M, y: c.y, size, font: c.font, color });
    c.y -= size + 3;
  }
  c.y -= 3;
}
export function kv(c: Ctx, pairs: Array<[string, string]>): void {
  for (const [k, v] of pairs) {
    if (c.y < M + 30) newPage(c);
    c.page.drawText(winAnsi(k), { x: M, y: c.y, size: 9, font: c.font, color: MUTED });
    c.page.drawText(winAnsi(v), { x: M + 170, y: c.y, size: 9, font: c.bold, color: INK });
    c.y -= 13;
  }
  c.y -= 6;
}

const cell = (col: Col, v: string | number | null | undefined): string => {
  if (v === null || v === undefined || v === '') return '';
  if (col.kind === 'money') return brl(Number(v));
  if (col.kind === 'pct') return pctBR(Number(v), 2);
  if (col.kind === 'date') return dateBR(String(v));
  if (col.kind === 'int') return String(Math.trunc(Number(v)));
  return String(v);
};

/** Tabela com quebra de página; colunas de dinheiro/percentual alinhadas à direita. */
export function table(c: Ctx, cols: Col[], rows: Row[], opts: { totals?: Row } = {}): void {
  const width = A4[0] - 2 * M;
  const weights = cols.map((k) => (k.kind === 'text' ? 2.2 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => (w / total) * width);
  const size = 8;
  const head = () => {
    let x = M;
    cols.forEach((k, i) => {
      const right = k.kind !== 'text' && k.kind !== 'date';
      const t = wrap(k.label, c.bold, size, widths[i]! - 4)[0] ?? '';
      c.page.drawText(t, { x: right ? x + widths[i]! - 2 - c.bold.widthOfTextAtSize(t, size) : x, y: c.y, size, font: c.bold, color: INK });
      x += widths[i]!;
    });
    c.y -= 4;
    c.page.drawLine({ start: { x: M, y: c.y }, end: { x: M + width, y: c.y }, thickness: 0.6, color: LINE });
    c.y -= 10;
  };
  head();
  const draw = (r: Row, bold = false) => {
    const lines = cols.map((k, i) => wrap(cell(k, r[k.key]), bold ? c.bold : c.font, size, widths[i]! - 4));
    const h = Math.max(...lines.map((l) => l.length)) * (size + 2);
    if (c.y - h < M + 20) { newPage(c); head(); }
    let x = M;
    cols.forEach((k, i) => {
      const right = k.kind !== 'text' && k.kind !== 'date';
      lines[i]!.forEach((l, j) => {
        const f = bold ? c.bold : c.font;
        c.page.drawText(l, { x: right ? x + widths[i]! - 2 - f.widthOfTextAtSize(l, size) : x, y: c.y - j * (size + 2), size, font: f, color: INK });
      });
      x += widths[i]!;
    });
    c.y -= h + 2;
  };
  for (const r of rows) draw(r);
  if (opts.totals) { c.page.drawLine({ start: { x: M, y: c.y + 6 }, end: { x: M + width, y: c.y + 6 }, thickness: 0.6, color: LINE }); draw(opts.totals, true); }
  c.y -= 6;
}

export async function finish(c: Ctx): Promise<Uint8Array> {
  const pages = c.doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(winAnsi(`${c.footer} · página ${i + 1} de ${pages.length}`), { x: M, y: 22, size: 7.5, font: c.font, color: MUTED });
  });
  return c.doc.save();
}
