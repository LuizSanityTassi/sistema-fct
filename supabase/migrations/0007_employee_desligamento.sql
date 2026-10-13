-- 0007 — Data de desligamento do funcionário (preenchida quando status = 'desligado'). Aditiva.
alter table public.employees
  add column if not exists data_desligamento date;
