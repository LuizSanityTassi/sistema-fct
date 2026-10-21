-- Troca de filial: TODOS os lançamentos da folha da pessoa vão junto para a filial nova, de qualquer mês (pedido do
-- usuário, 21/10/2026 — antes, na 0058, só o mês atual em diante). Se uma planilha de mês anterior for baixada de
-- novo, ela sai no CNPJ novo.
-- Também alinha quem já estava com lançamento em filial diferente da do cadastro (1 caso: set/2026, F301 → F309).

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
       and branch_id is distinct from new.branch_id;
  end if;
  return null;
end;
$$;

update public.folha_lancamentos l
   set branch_id = e.branch_id
  from public.employees e
 where e.id = l.employee_id
   and e.branch_id is not null
   and l.branch_id is distinct from e.branch_id;
