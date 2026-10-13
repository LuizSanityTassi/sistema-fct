-- 0006 — Auditoria gravada pela aplicação + contagem de funcionários por unidade.

-- A aplicação registra alterações (valor anterior/novo) em nome do usuário logado.
-- Só pode inserir registros do próprio usuário; leitura continua restrita ao admin (0002).
create policy audit_ins on public.audit_logs for insert to authenticated
  with check (user_id = auth.uid());

-- Contagem de funcionários ativos por unidade. security_invoker: respeita o RLS de employees
-- (um gerente só "conta" a própria filial).
create or replace view public.branch_employee_counts
  with (security_invoker = true) as
  select branch_id, count(*)::int as total
  from public.employees
  where status <> 'desligado'
  group by branch_id;
