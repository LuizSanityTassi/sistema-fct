-- Conciliação e quebra de caixa passam a contar só de 05/11/2026 em diante (decisão do Luiz): o que é anterior sai das telas, sem apagar
-- nada. A parte do contador (DRE, caixa contábil) e as retiradas não usam este corte. A mesma data está em src/lib/operacao.ts.
create or replace function private.operacao_inicio() returns date language sql immutable as $$ select date '2026-11-05' $$;
grant execute on function private.operacao_inicio() to authenticated;

-- A quebra na folha está desligada hoje, mas se for ligada conta só daqui em diante: as antigas não viram desconto.
create or replace function private.caixa_sincronizar_folha(p_employee uuid, p_competencia date) returns void
language plpgsql security definer set search_path to 'private', 'public' as $function$
declare
  v_evento uuid;
  v_branch uuid;
  v_origem text;
  v_soma numeric(12, 2);
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
     where employee_id = p_employee and competencia = p_competencia and classe = 'quebra' and andamento <> 'abonada' and dia >= private.operacao_inicio();
  end if;
  if v_soma > 0 then
    insert into public.folha_lancamentos (competencia, employee_id, branch_id, evento_id, valor, origem, created_by, updated_by)
    values (p_competencia, p_employee, v_branch, v_evento, v_soma, 'caixa', auth.uid(), auth.uid())
    on conflict (competencia, employee_id, evento_id) do update set valor = excluded.valor, updated_by = excluded.updated_by
    where public.folha_lancamentos.origem = 'caixa';
  else
    delete from public.folha_lancamentos where competencia = p_competencia and employee_id = p_employee and evento_id = v_evento and origem = 'caixa';
  end if;
end $function$;

-- Painel de filiais e busca do topo: só o trecho que lê essas tabelas muda.
do $$
declare
  v_def text := pg_get_functiondef('public.dashboard_filiais()'::regprocedure);
begin
  if position('from public.caixa_diferencas c' in v_def) = 0 or position('from public.conc_pendencias x' in v_def) = 0 then
    raise exception 'dashboard_filiais mudou: confira antes de trocar';
  end if;
  v_def := replace(v_def, 'from public.caixa_diferencas c', 'from (select * from public.caixa_diferencas where dia >= private.operacao_inicio()) c');
  v_def := replace(v_def, 'from public.conc_pendencias x', 'from (select * from public.conc_pendencias where vencimento >= private.operacao_inicio()) x');
  execute v_def;

  v_def := pg_get_functiondef('public.busca_global(text, integer)'::regprocedure);
  if position('from conc_pendencias p' in v_def) = 0 or position('from caixa_diferencas c' in v_def) = 0 then
    raise exception 'busca_global mudou: confira antes de trocar';
  end if;
  v_def := replace(v_def, 'from conc_pendencias p', 'from (select * from conc_pendencias where vencimento >= private.operacao_inicio()) p');
  v_def := replace(v_def, 'from caixa_diferencas c', 'from (select * from caixa_diferencas where dia >= private.operacao_inicio()) c');
  execute v_def;
end $$;

-- Números das abas e do topo da conciliação, só com o que vence de hoje em diante.
create or replace function public.conc_contagem_abas(p_conciliacao uuid) returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'exato', (select count(*) from public.conc_itens where conciliacao_id = p_conciliacao and enviado_em is null and grupo = 'exato' and vencimento >= private.operacao_inicio()),
    'aproximado', (select count(*) from public.conc_itens where conciliacao_id = p_conciliacao and enviado_em is null and grupo = 'aproximado' and vencimento >= private.operacao_inicio()),
    'so_trier', (select count(*) from public.conc_itens where conciliacao_id = p_conciliacao and enviado_em is null and grupo = 'so_trier' and vencimento >= private.operacao_inicio()),
    'so_dda', (select count(*) from public.conc_itens where conciliacao_id = p_conciliacao and enviado_em is null and grupo = 'so_dda' and vencimento >= private.operacao_inicio()),
    'descontos', (select count(*) from public.conc_itens where conciliacao_id = p_conciliacao and enviado_em is null and desconto is not null and vencimento >= private.operacao_inicio()),
    'enviados', (select count(*) from public.conc_itens where conciliacao_id = p_conciliacao and enviado_em is not null and vencimento >= private.operacao_inicio()));
$$;

create index if not exists conc_itens_resumo_idx on public.conc_itens (conciliacao_id, vencimento) include (grupo, filial, valor);
create index if not exists conc_itens_anomalias_idx on public.conc_itens (conciliacao_id, vencimento) where (dados -> 'anomalias') is not null;

create or replace function public.conc_resumo_periodo(p_conciliacao uuid) returns table (filial integer, grupo text, qtd bigint, valor numeric)
language sql stable security invoker set search_path = public as $$
  select i.filial, i.grupo, count(*), coalesce(sum(i.valor), 0)
    from public.conc_itens i
   where i.conciliacao_id = p_conciliacao and i.vencimento >= private.operacao_inicio()
   group by 1, 2;
$$;
revoke all on function public.conc_resumo_periodo(uuid) from public, anon;
grant execute on function public.conc_resumo_periodo(uuid) to authenticated;

analyze public.conc_itens;
