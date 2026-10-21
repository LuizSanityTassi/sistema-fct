-- Troca de filial do funcionário leva a folha junto (pedido do usuário, 21/10/2026): quando employees.branch_id muda,
-- os lançamentos da folha (folha_lancamentos.branch_id = CNPJ da planilha da contabilidade) do mês atual em diante
-- passam para a filial nova — vale para qualquer caminho (tela, importação, SQL). Meses anteriores ficam como
-- estão: já foram para a contabilidade no CNPJ antigo. A quebra de caixa nova já entra pela filial atual.

create or replace function private.t_employee_folha_segue_filial()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
begin
  if new.branch_id is not null and new.branch_id is distinct from old.branch_id then
    update public.folha_lancamentos
       set branch_id = new.branch_id
     where employee_id = new.id
       and competencia >= date_trunc('month', now() at time zone 'America/Sao_Paulo')::date
       and branch_id is distinct from new.branch_id;
  end if;
  return null;
end;
$$;
revoke all on function private.t_employee_folha_segue_filial() from public, anon;
drop trigger if exists t_employee_folha_segue_filial on public.employees;
create trigger t_employee_folha_segue_filial after update of branch_id on public.employees
  for each row execute function private.t_employee_folha_segue_filial();
