-- 0152 — Simulador de escala 5x2: a equipe segue o RH sozinha.
--   • Funcionário cadastrado no RH numa filial que está no simulador → entra na equipe da escala (função pelo cargo).
--   • Desligado no RH → sai da equipe da escala (de qualquer filial).
--   • Readmitido (desligado → outra situação) → volta para a equipe da filial dele.
--   • Mudou de filial no RH → sai da equipe das outras filiais e entra na da filial nova.
--   • Mudou nome/cargo no RH → acerta o nome e o cargo de origem na escala (a função escolhida na escala fica).
-- Não entra quem já parece estar na equipe sem ficha ligada (mesmo primeiro nome + outro nome igual com 4+ letras):
-- evita duplicar quem foi importado da planilha com o nome digitado diferente; esse é ligado à mão na tela.
-- As opções já geradas guardam a equipe do momento (jsonb) e não mudam. Toda mudança vai para audit_logs.

create or replace function private.esc_palavras(p text) returns text[]
language sql immutable set search_path = '' as $$
  select regexp_split_to_array(btrim(regexp_replace(upper(translate(coalesce(p, ''),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')), '\s+', ' ', 'g')), ' ')
$$;

-- mesmo primeiro nome e mais um nome (4+ letras) em comum
create or replace function private.esc_parece(a text[], b text[]) returns boolean
language sql immutable set search_path = '' as $$
  select a[1] = b[1] and exists (select 1 from unnest(a[2:]) x where length(x) >= 4 and x = any (b[2:]))
$$;

-- cargo do RH → função na escala (mesma regra de funcaoDoCargo em src/app/(app)/escalas/actions.ts)
create or replace function private.esc_funcao_do_cargo(p text) returns text
language sql immutable set search_path = '' as $$
  select case
    when c like '%farmaceut%' then 'farmaceutico'
    when c like '%gerente%' then 'gerente'
    when c like '%estoqu%' then 'estoquista'
    when c like '%caixa%' or c like '%operador%' then 'caixa'
    when c like '%motorista%' or c like '%entregador%' or c like '%motoboy%' then 'motorista'
    when c like '%auditor%' then 'auditor'
    when c like '%servicos gerais%' or c like '%limpeza%' or c like '%zelador%' then 'servicos_gerais'
    when c like '%atendente%' or c like '%balconista%' or c like '%vendedor%' or c like '%perfumista%' then 'atendente'
    else 'outros' end
  from (select lower(translate(coalesce(p, ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')) c) x
$$;

-- coloca o funcionário na equipe da escala da filial dele (se a filial está no simulador). Devolve true se entrou.
create or replace function private.esc_incluir_do_rh(p_employee uuid, p_motivo text) returns boolean
language plpgsql security definer set search_path = private, public as $$
declare
  e record;
  novo uuid;
begin
  select id, nome, cargo, status::text as status, branch_id into e from public.employees where id = p_employee;
  if not found or e.status = 'desligado' then return false; end if;
  if not exists (select 1 from public.esc_filiais f where f.branch_id = e.branch_id) then return false; end if;
  if exists (select 1 from public.esc_colaboradores c where c.branch_id = e.branch_id and c.employee_id = e.id) then return false; end if;
  if exists (select 1 from public.esc_colaboradores c
              where c.employee_id is null and private.esc_parece(private.esc_palavras(c.nome), private.esc_palavras(e.nome))) then
    return false;
  end if;
  insert into public.esc_colaboradores (branch_id, employee_id, nome, funcao, cargo_origem, situacao, origem, ordem)
  values (e.branch_id, e.id, e.nome, private.esc_funcao_do_cargo(e.cargo), left(e.cargo, 120),
          case when e.status = 'ativo' then 'ativo' else 'afastado' end, 'rh',
          coalesce((select max(ordem) from public.esc_colaboradores where branch_id = e.branch_id), 0) + 1)
  returning id into novo;
  insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_anterior, valor_novo)
  values (auth.uid(), 'criar', 'esc_colaboradores', novo, null,
          jsonb_build_object('nome', e.nome, 'employee_id', e.id, 'branch_id', e.branch_id, 'motivo', p_motivo));
  return true;
end $$;

-- tira o funcionário da equipe da escala (todas as filiais, ou todas menos a filial informada)
create or replace function private.esc_retirar_do_rh(p_employee uuid, p_menos_filial uuid, p_motivo text) returns integer
language plpgsql security definer set search_path = private, public as $$
declare n integer;
begin
  with apagados as (
    delete from public.esc_colaboradores c
     where c.employee_id = p_employee and (p_menos_filial is null or c.branch_id <> p_menos_filial)
    returning c.id, c.branch_id, c.nome, c.funcao, c.situacao
  ), log as (
    insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_anterior, valor_novo)
    select auth.uid(), 'excluir', 'esc_colaboradores', a.id,
           jsonb_build_object('nome', a.nome, 'employee_id', p_employee, 'branch_id', a.branch_id, 'funcao', a.funcao, 'situacao', a.situacao),
           jsonb_build_object('motivo', p_motivo)
      from apagados a
    returning 1
  )
  select count(*) into n from log;
  return n;
end $$;

create or replace function private.esc_sincronizar_rh() returns trigger
language plpgsql security definer set search_path = private, public as $$
begin
  if tg_op = 'INSERT' then
    if new.status::text <> 'desligado' then perform private.esc_incluir_do_rh(new.id, 'Cadastrado no RH (automático)'); end if;
    return null;
  end if;

  if new.status::text = 'desligado' and old.status::text <> 'desligado' then
    perform private.esc_retirar_do_rh(new.id, null, 'Desligado no RH (automático)');
    return null;
  end if;
  if new.status::text = 'desligado' then return null; end if;

  if old.status::text = 'desligado' then
    perform private.esc_incluir_do_rh(new.id, 'Readmitido no RH (automático)');
  elsif new.branch_id is distinct from old.branch_id then
    perform private.esc_retirar_do_rh(new.id, new.branch_id, 'Mudou de filial no RH (automático)');
    perform private.esc_incluir_do_rh(new.id, 'Mudou de filial no RH (automático)');
  end if;

  if new.nome is distinct from old.nome or new.cargo is distinct from old.cargo then
    update public.esc_colaboradores c set nome = new.nome, cargo_origem = left(new.cargo, 120)
     where c.employee_id = new.id and (c.nome is distinct from new.nome or c.cargo_origem is distinct from left(new.cargo, 120));
  end if;
  return null;
end $$;

revoke all on function private.esc_incluir_do_rh(uuid, text) from public, anon, authenticated;
revoke all on function private.esc_retirar_do_rh(uuid, uuid, text) from public, anon, authenticated;

drop trigger if exists t_employees_escala on public.employees;
create trigger t_employees_escala after insert or update of status, branch_id, nome, cargo on public.employees
  for each row execute function private.esc_sincronizar_rh();

-- ------------------------------------------------------------------------------------------------- acerto de hoje
-- 1) quem já está desligado sai da escala (cópia antes em private.esc_colaboradores_bkp_2026_11_18_desligados)
create table if not exists private.esc_colaboradores_bkp_2026_11_18_desligados as
select c.*, now() as copiado_em
  from public.esc_colaboradores c join public.employees e on e.id = c.employee_id
 where e.status = 'desligado';

select private.esc_retirar_do_rh(e.id, null, 'Já estava desligado no RH (acerto da migração 0152)')
  from public.employees e
 where e.status = 'desligado' and exists (select 1 from public.esc_colaboradores c where c.employee_id = e.id);

-- 2) quem está no RH numa filial do simulador e ainda não está em nenhuma equipe entra (os "parecidos" ficam de fora)
select private.esc_incluir_do_rh(e.id, 'Estava no RH e fora da escala (acerto da migração 0152)')
  from public.employees e
  join public.esc_filiais f on f.branch_id = e.branch_id
 where e.status <> 'desligado'
   and not exists (select 1 from public.esc_colaboradores c where c.employee_id = e.id)
 order by e.nome;
