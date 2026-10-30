-- Responsável do televendas (pedido do Luiz em 30/10/2026: "quebra de caixa, sangria, tudo do tele coloca como
-- responsabilidade do Artur para notificar para ele"). sistema_config 'televendas' = {"responsavel": "<profile_id>"}.
-- Quebra de caixa de quem é da equipe (operador = código do vendedor no Trier) nasce com ele como gestor: é ele que
-- justifica e recebe o aviso da manhã; as sangrias lançadas pela equipe aparecem nas pendências dele.

-- qualquer um lê essa chave (não é sensível): a central de pendências confere se a pessoa é o responsável
drop policy if exists scfg_sel on public.sistema_config;
create policy scfg_sel on public.sistema_config for select to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro'))
    or (chave = 'dre_lembrete' and (select private.tem_papel('contador')))
    or chave = 'televendas');

create or replace function private.responsavel_televendas()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.sistema_config c
  join public.profiles p on p.id = (c.valor ->> 'responsavel')::uuid and p.ativo
  where c.chave = 'televendas' and c.valor ? 'responsavel';
$$;

-- a quebra é do televendas? (operador com o código de alguém da equipe, ou o funcionário ligado a esse operador)
create or replace function private.quebra_do_televendas(p_operador integer, p_employee uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.vendas_televendas_vendedores t
    left join public.caixa_operadores o on o.cod_operador = t.vendedor_codigo
    where t.vendedor_codigo = p_operador or (p_employee is not null and o.employee_id = p_employee)
  );
$$;

-- gestor padrão da quebra nova: responsável do televendas para a equipe; senão o gestor da loja
create or replace function private.t_caixa_gestor_padrao()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'private', 'public'
as $function$
begin
  if new.gestor_id is null and private.quebra_do_televendas(new.cod_operador, new.employee_id) then
    new.gestor_id := private.responsavel_televendas();
  end if;
  if new.gestor_id is null then
    select g.profile_id into new.gestor_id from public.caixa_gestores g where g.branch_id = new.branch_id;
  end if;
  return new;
end;
$function$;

-- sangrias lançadas pela equipe do televendas e ainda não conferidas (só o responsável recebe o número)
create or replace function public.televendas_sangrias_abertas()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.caixa_sangrias s
  where s.situacao = 'pendente'
    and (select auth.uid()) = private.responsavel_televendas()
    and exists (
      select 1 from public.profiles p
      join public.caixa_operadores o on o.employee_id = p.employee_id
      join public.vendas_televendas_vendedores t on t.vendedor_codigo = o.cod_operador
      where p.id = s.criada_por
    );
$$;
revoke execute on function public.televendas_sangrias_abertas() from public, anon;
grant execute on function public.televendas_sangrias_abertas() to authenticated;

-- troca o responsável do televendas (só admin) e, se pedir, leva junto as quebras em aberto da equipe
create or replace function public.televendas_definir_responsavel(p_profile uuid, p_mover boolean default true)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer := 0;
begin
  if not (select private.sou_admin()) then
    raise exception 'Só o administrador define o responsável do televendas.';
  end if;
  if p_profile is null then
    delete from public.sistema_config where chave = 'televendas';
  else
    if not exists (select 1 from public.profiles where id = p_profile and ativo) then
      raise exception 'Usuário inativo ou inexistente.';
    end if;
    insert into public.sistema_config (chave, valor, atualizado_em, atualizado_por)
    values ('televendas', jsonb_build_object('responsavel', p_profile), now(), auth.uid())
    on conflict (chave) do update set valor = excluded.valor, atualizado_em = now(), atualizado_por = auth.uid();
  end if;
  if p_mover then
    update public.caixa_diferencas d
       set gestor_id = coalesce(p_profile, (select g.profile_id from public.caixa_gestores g where g.branch_id = d.branch_id))
     where d.classe = 'quebra' and d.andamento in ('pendente', 'justificada')
       and private.quebra_do_televendas(d.cod_operador, d.employee_id);
    get diagnostics n = row_count;
  end if;
  return n;
end;
$$;
revoke execute on function public.televendas_definir_responsavel(uuid, boolean) from public, anon;
grant execute on function public.televendas_definir_responsavel(uuid, boolean) to authenticated;

-- Dado inicial (aplicado à parte): responsável = Artur (comercialinternofct@gmail.com) e as 5 quebras em aberto da
-- equipe passadas para ele.
