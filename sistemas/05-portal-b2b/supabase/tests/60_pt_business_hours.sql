-- Horas úteis: cada resultado foi calculado à mão. 2026-10-12 é SEGUNDA-FEIRA. Expediente 09:00–18:00 (9 h/dia), seg–sex, America/Sao_Paulo (UTC−3, sem horário de verão).
begin;

create function pg_temp.loc(t text) returns timestamptz language sql immutable as $$ select (t::timestamp) at time zone 'America/Sao_Paulo' $$;
create function pg_temp.add(start text, hrs numeric, days int[] default '{1,2,3,4,5}', o time default '09:00', c time default '18:00') returns text language sql immutable as $$
  select to_char(public.pt_add_business_hours(pg_temp.loc(start), hrs, 'America/Sao_Paulo', days, o, c) at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') $$;

do $$
begin
  -- dentro do mesmo dia
  assert pg_temp.add('2026-10-12 09:00', 8) = '2026-10-12 17:00', 'seg 09:00 + 8 h = seg 17:00';
  assert pg_temp.add('2026-10-12 09:00', 9) = '2026-10-12 18:00', 'o dia útil tem 9 h: seg 09:00 + 9 h = seg 18:00 (fechamento exato)';
  assert pg_temp.add('2026-10-12 13:30', 1.5) = '2026-10-12 15:00', 'frações de hora: 13:30 + 1,5 h';
  -- atravessa a noite e o fim de semana
  assert pg_temp.add('2026-10-12 17:00', 2) = '2026-10-13 10:00', 'seg 17:00 + 2 h = 1 h hoje + 1 h amanhã às 09:00 = ter 10:00';
  assert pg_temp.add('2026-10-16 17:00', 2) = '2026-10-19 10:00', 'sex 17:00 + 2 h = seg 10:00 (o fim de semana não conta)';
  assert pg_temp.add('2026-10-17 10:00', 1) = '2026-10-19 10:00', 'sábado 10:00 + 1 h: o relógio só corre a partir de segunda 09:00';
  assert pg_temp.add('2026-10-18 23:00', 1) = '2026-10-19 10:00', 'domingo à noite + 1 h = segunda 10:00';
  -- antes da abertura e depois do fechamento
  assert pg_temp.add('2026-10-12 07:00', 1) = '2026-10-12 10:00', 'antes da abertura: conta a partir das 09:00';
  assert pg_temp.add('2026-10-12 19:00', 1) = '2026-10-13 10:00', 'depois do fechamento: conta a partir do próximo dia útil';
  -- vários dias: 40 h = 4 dias de 9 h (36 h) + 4 h
  assert pg_temp.add('2026-10-12 09:00', 40) = '2026-10-16 13:00', '40 h úteis a partir de seg 09:00 = sex 13:00';
  assert pg_temp.add('2026-10-12 09:00', 45) = '2026-10-16 18:00', '45 h úteis = 5 dias exatos: sex 18:00';
  assert pg_temp.add('2026-10-12 09:00', 46) = '2026-10-19 10:00', '46 h úteis = sex 18:00 + 1 h → seg 10:00';
  -- zero horas devolve o próprio instante (dentro do expediente) e o próximo expediente (fora dele)
  assert pg_temp.add('2026-10-12 12:00', 0) = '2026-10-12 12:00', '0 h dentro do expediente';
  assert pg_temp.add('2026-10-17 12:00', 0) = '2026-10-19 09:00', '0 h num sábado: segunda 09:00';
  -- dias e janela configuráveis: seg–sáb, 08:00–12:00 (4 h/dia)
  assert pg_temp.add('2026-10-16 11:00', 2, '{1,2,3,4,5,6}', '08:00', '12:00') = '2026-10-17 09:00', 'sex 11:00 + 2 h = 1 h hoje + 1 h sábado às 08:00 = sáb 09:00';
  assert pg_temp.add('2026-10-17 11:00', 5, '{1,2,3,4,5,6}', '08:00', '12:00') = '2026-10-19 12:00', 'sáb 11:00 + 5 h = 1 h + 4 h de segunda (fecha 12:00)';
  -- só quarta-feira é útil
  assert pg_temp.add('2026-10-12 09:00', 1, '{3}') = '2026-10-14 10:00', 'só quartas: seg 09:00 + 1 h = quarta 10:00';
  -- entradas inválidas são recusadas
  assert test.throws($q$select public.pt_add_business_hours(now(), -1, 'America/Sao_Paulo', '{1}', '09:00', '18:00')$q$), 'horas negativas';
  assert test.throws($q$select public.pt_add_business_hours(now(), 1, 'America/Sao_Paulo', '{1}', '18:00', '09:00')$q$), 'abertura depois do fechamento';
  assert test.throws($q$select public.pt_add_business_hours(now(), 1, 'America/Sao_Paulo', '{}', '09:00', '18:00')$q$), 'sem dias úteis';
  assert test.throws($q$select public.pt_add_business_hours(null, 1, 'America/Sao_Paulo', '{1}', '09:00', '18:00')$q$), 'início nulo';
  assert test.throws($q$select public.pt_add_business_hours(now(), 1, 'Fuso/Inexistente', '{1}', '09:00', '18:00')$q$), 'fuso inexistente';
  raise notice 'PASS: horas úteis (20 casos calculados à mão)';
end $$;

rollback;
select 'PASS 60_pt_business_hours' as result;
