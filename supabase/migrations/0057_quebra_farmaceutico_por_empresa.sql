-- Quebra de caixa do farmacêutico (pedido do usuário, 21/10/2026): só o farmacêutico da VARELA fica sem; o da
-- NAZÁRIO tem quebra como qualquer colaborador. A empresa é a do cadastro da filial do funcionário
-- (branches.organization_id); sem empresa no cadastro vale a regra antiga (sem quebra).
-- Depois da troca, ressincroniza a folha de quem passou a ter quebra (farmacêuticos da NAZÁRIO com quebra lançada).

create or replace function private.sem_quebra_de_caixa(p_employee uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select coalesce((
    select upper(coalesce(e.cargo, '')) ~ 'FARMAC[EÊ]UTIC' and coalesce(o.nome_fantasia, 'VARELA') = 'VARELA'
      from public.employees e
      left join public.branches b on b.id = e.branch_id
      left join public.organizations o on o.id = b.organization_id
     where e.id = p_employee
  ), false);
$$;
revoke all on function private.sem_quebra_de_caixa(uuid) from public, anon;
grant execute on function private.sem_quebra_de_caixa(uuid) to authenticated;

create or replace function private.caixa_sincronizar_folha(p_employee uuid, p_competencia date)
returns void
language plpgsql
security definer
set search_path = private, public
as $function$
declare
  v_evento uuid;
  v_branch uuid;
  v_origem text;
  v_soma   numeric(12, 2);
begin
  if p_employee is null or p_competencia is null then return; end if;
  select id into v_evento from public.folha_eventos where chave = 'quebra_caixa';
  select branch_id into v_branch from public.employees where id = p_employee;
  if v_evento is null or v_branch is null then return; end if;
  select origem into v_origem from public.folha_lancamentos where competencia = p_competencia and employee_id = p_employee and evento_id = v_evento;
  if v_origem is not null and v_origem <> 'caixa' then return; end if;
  if private.sem_quebra_de_caixa(p_employee) then
    v_soma := 0;
  else
    select coalesce(sum(valor_quebra), 0) into v_soma from public.caixa_diferencas
     where employee_id = p_employee and competencia = p_competencia and classe = 'quebra' and andamento <> 'abonada';
  end if;
  if v_soma > 0 then
    insert into public.folha_lancamentos (competencia, employee_id, branch_id, evento_id, valor, origem, created_by, updated_by)
    values (p_competencia, p_employee, v_branch, v_evento, v_soma, 'caixa', auth.uid(), auth.uid())
    on conflict (competencia, employee_id, evento_id)
      do update set valor = excluded.valor, updated_by = excluded.updated_by where public.folha_lancamentos.origem = 'caixa';
  else
    delete from public.folha_lancamentos where competencia = p_competencia and employee_id = p_employee and evento_id = v_evento and origem = 'caixa';
  end if;
end;
$function$;

select private.caixa_sincronizar_folha(x.employee_id, x.competencia)
  from (
    select distinct d.employee_id, d.competencia
      from public.caixa_diferencas d
      join public.employees e on e.id = d.employee_id
     where d.classe = 'quebra' and upper(coalesce(e.cargo, '')) ~ 'FARMAC[EÊ]UTIC'
  ) x;
