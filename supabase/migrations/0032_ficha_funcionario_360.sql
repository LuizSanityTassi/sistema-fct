-- 0032 — Ficha 360° do funcionário.
--   • checklist de desligamento: itens marcados à mão (os automáticos o sistema confere sozinho);
--   • o RH passa a ver as quebras de caixa (elas viram desconto na folha que o RH fecha);
--   • histórico de alterações do funcionário para admin e RH (a auditoria geral continua só do admin).
-- ADITIVA: uma tabela, uma regra de leitura a mais e uma função.

create table if not exists public.rh_desligamento_checklist (
  employee_id    uuid not null references public.employees(id) on delete cascade,
  item           text not null check (item in ('equipamentos', 'acessos', 'documentos', 'folha', 'gestor')),
  feito_por      uuid references public.profiles(id) on delete set null default auth.uid(),
  feito_por_nome text,
  feito_em       timestamptz not null default now(),
  primary key (employee_id, item)
);
alter table public.rh_desligamento_checklist enable row level security;
revoke all on public.rh_desligamento_checklist from anon;
create policy rhdc_sel on public.rh_desligamento_checklist for select to authenticated using (private.sou_admin() or private.tem_papel('rh'));
create policy rhdc_wr  on public.rh_desligamento_checklist for all    to authenticated using (private.sou_admin() or private.tem_papel('rh')) with check (private.sou_admin() or private.tem_papel('rh'));

-- RH vê as quebras de caixa (não a tolerância nem o caixa inteiro do Trier)
drop policy if exists cdif_sel on public.caixa_diferencas;
create policy cdif_sel on public.caixa_diferencas for select to authenticated
  using (
    private.sou_admin() or private.tem_papel('financeiro')
    or (classe = 'quebra' and (private.tem_papel('rh') or private.pode_ver_quebra(employee_id, gestor_id, branch_id)))
  );

-- histórico de alterações de um funcionário (cadastro, salários, documentos, ASO, folha)
create or replace function public.rh_historico_funcionario(p_employee uuid)
returns table (criado_em timestamptz, acao text, entidade text, autor text, valor_anterior jsonb, valor_novo jsonb)
language sql
stable
security definer
set search_path = private, public
as $$
  select a.created_at, a.acao, a.entidade, coalesce(nullif(trim(p.nome), ''), 'Sistema'), a.valor_anterior, a.valor_novo
    from public.audit_logs a
    left join public.profiles p on p.id = a.user_id
   where (private.sou_admin() or private.tem_papel('rh'))
     and (
          (a.entidade = 'employees' and a.registro_id = p_employee)
       or (a.entidade = 'employee_salaries' and (a.registro_id = p_employee or a.registro_id in (select s.id from public.employee_salaries s where s.employee_id = p_employee)))
       or (a.entidade = 'employee_documents' and a.registro_id in (select d.id from public.employee_documents d where d.employee_id = p_employee))
       or (a.entidade = 'employee_aso' and a.registro_id in (select x.id from public.employee_aso x where x.employee_id = p_employee))
       or (a.entidade = 'payroll_records' and a.registro_id in (select r.id from public.payroll_records r where r.employee_id = p_employee))
     )
   order by a.created_at desc
   limit 200;
$$;
revoke all on function public.rh_historico_funcionario(uuid) from public, anon;
grant execute on function public.rh_historico_funcionario(uuid) to authenticated;
