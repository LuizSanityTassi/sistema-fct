-- 0010 — Folha de pagamento: detalhamento do cálculo (INSS, IRRF, FGTS, horas extras) e datas de fechamento/pagamento.
-- Aditiva. valor_liquido = salario_base + horas_extras + adicionais - (inss + irrf + outros_descontos);
-- descontos = inss + irrf + outros_descontos; beneficios é informativo (não entra no líquido).
alter table public.payroll_records
  add column if not exists qtd_horas_extras_50  numeric(6,2)  not null default 0,
  add column if not exists qtd_horas_extras_100 numeric(6,2)  not null default 0,
  add column if not exists inss                 numeric(14,2) not null default 0,
  add column if not exists irrf                 numeric(14,2) not null default 0,
  add column if not exists fgts                 numeric(14,2) not null default 0,
  add column if not exists outros_descontos     numeric(14,2) not null default 0,
  add column if not exists observacoes          text,
  add column if not exists fechada_em           timestamptz,
  add column if not exists paga_em              timestamptz;

create index if not exists payroll_records_competencia_idx on public.payroll_records (competencia);
