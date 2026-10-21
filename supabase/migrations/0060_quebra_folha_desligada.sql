-- Quebra de caixa do app fora da folha, por enquanto (pedido do usuário, 21/10/2026: "a gente não está usando a
-- quebra de caixa do app"). Interruptor sistema_config 'caixa_quebra_folha' {ligado}: desligado, o gatilho não lança
-- mais a quebra nos Lançamentos da folha e as que ele já lançou (origem 'caixa') saem. As quebras continuam
-- registradas em caixa_diferencas (justificativa, decisão…); ao religar, a folha é recalculada a partir delas.
-- Lançamentos do RH (importação/manual) não são tocados.

insert into public.sistema_config (chave, valor, atualizado_em)
values ('caixa_quebra_folha', '{"ligado": false}', now())
on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();

create or replace function private.quebra_vai_para_folha()
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select coalesce((select (valor ->> 'ligado')::boolean from public.sistema_config where chave = 'caixa_quebra_folha'), true);
$$;
revoke all on function private.quebra_vai_para_folha() from public, anon;
grant execute on function private.quebra_vai_para_folha() to authenticated;

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
  if not private.quebra_vai_para_folha() or private.sem_quebra_de_caixa(p_employee) then
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

-- para as telas (qualquer usuário logado — o gerente também vê o texto certo)
create or replace function public.caixa_quebra_folha_ligada()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.quebra_vai_para_folha();
$$;
revoke all on function public.caixa_quebra_folha_ligada() from public, anon;
grant execute on function public.caixa_quebra_folha_ligada() to authenticated;

-- liga/desliga (administrador e financeiro) e recalcula a folha de todas as quebras; devolve quantas ficaram na folha
create or replace function public.caixa_quebra_folha_definir(p_ligado boolean)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  n integer;
begin
  if not ((select private.sou_admin()) or (select private.tem_papel('financeiro'))) then
    raise exception 'Só o financeiro e o administrador ligam ou desligam a quebra na folha.';
  end if;
  insert into public.sistema_config (chave, valor, atualizado_em, atualizado_por)
  values ('caixa_quebra_folha', jsonb_build_object('ligado', p_ligado), now(), auth.uid())
  on conflict (chave) do update set valor = excluded.valor, atualizado_em = now(), atualizado_por = auth.uid();
  if not p_ligado then
    delete from public.folha_lancamentos l using public.folha_eventos e
     where e.id = l.evento_id and e.chave = 'quebra_caixa' and l.origem = 'caixa';
  else
    perform private.caixa_sincronizar_folha(x.employee_id, x.competencia)
       from (select distinct employee_id, competencia from public.caixa_diferencas where employee_id is not null) x;
  end if;
  select count(*) into n from public.folha_lancamentos l join public.folha_eventos e on e.id = l.evento_id
   where e.chave = 'quebra_caixa' and l.origem = 'caixa';
  return n;
end;
$$;
revoke all on function public.caixa_quebra_folha_definir(boolean) from public, anon;
grant execute on function public.caixa_quebra_folha_definir(boolean) to authenticated;

-- desliga agora: tira da folha as quebras que o gatilho já lançou
delete from public.folha_lancamentos l using public.folha_eventos e
 where e.id = l.evento_id and e.chave = 'quebra_caixa' and l.origem = 'caixa';
