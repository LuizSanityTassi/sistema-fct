-- 0140 — Crédito CMV com o custo das devoluções do Trier (pedido do Luiz em 10/11/2026): do mesmo relatório das
-- devoluções (0139), o "Total Vlr. Custo" de cada filial SOMA no "Crédito CMV" (ajuste_cmv, positivo) com o que o
-- contador já lançou. Para somar sem apagar a parte do contador e sem duplicar quando o robô relê, a parte do Trier fica
-- numa linha própria da mesma conta (origem 'trier_credito_devolucoes'); a DRE soma as duas.
--
-- dre_contabil.origem: null = contador / Omie / digitado; 'trier' = o robô substitui a conta (vendas, custo das
-- mercadorias, devoluções); 'trier_credito_devolucoes' = parte do Trier que soma no Crédito CMV.
-- Com isso: a importação da planilha e o "preencher pelo Omie" não apagam mais o que veio do Trier, e digitar o Crédito
-- CMV à mão troca só a parte do contador.

alter table public.dre_contabil add column if not exists origem text;
alter table public.dre_contabil drop constraint if exists dre_contabil_origem_check;
alter table public.dre_contabil add constraint dre_contabil_origem_check check (origem is null or origem in ('trier', 'trier_credito_devolucoes'));
comment on column public.dre_contabil.origem is 'null = contador/Omie/digitado; trier = robô do Trier substitui a conta; trier_credito_devolucoes = custo das devoluções do Trier somado no Crédito CMV.';

-- continua uma linha por empresa/filial/mês/conta; a parte do Trier no Crédito CMV é a única que pode ficar ao lado
-- (e também só uma por filial)
drop index if exists public.dre_contabil_unico;
create unique index dre_contabil_unico on public.dre_contabil (empresa, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), competencia, linha)
  where origem is distinct from 'trier_credito_devolucoes';
create unique index if not exists dre_contabil_unico_credito on public.dre_contabil (empresa, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), competencia, linha)
  where origem = 'trier_credito_devolucoes';

-- o que o robô já gravou nos meses não travados (todas as linhas dessas contas nesses meses vieram dele)
update public.dre_contabil d set origem = 'trier'
 where d.manual and d.origem is null
   and ((d.linha = 'vendas' and d.competencia >= date '2026-09-01') or (d.linha in ('custo_mercadoria', 'devolucoes') and d.competencia >= date '2026-10-01'))
   and not exists (select 1 from public.contabil_meses_travados t where t.competencia = d.competencia);

-- ---------- receita + CMV (0138) marcando a origem ----------
create or replace function public.dre_receita_trier_gravar(p_competencia date, p_valores jsonb, p_arquivo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_emp record;
  v_imp uuid;
  v_n integer;
  n integer := 0;
  v_total numeric := 0;
  v_custo_total numeric := 0;
  v_com_custo boolean;
  v_empresas jsonb := '[]'::jsonb;
begin
  if auth.uid() is not null and not ((select private.sou_admin()) or (select private.tem_papel('financeiro'))) then
    raise exception 'Só Administrador e Financeiro gravam a receita do Trier na DRE.' using errcode = 'P0001';
  end if;
  if p_competencia is null or extract(day from p_competencia) <> 1 then
    raise exception 'Mês inválido.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_valores) is distinct from 'array' or jsonb_array_length(p_valores) = 0 then
    raise exception 'Nenhuma filial com receita: nada foi gravado.' using errcode = 'P0001';
  end if;
  if exists (select 1
               from jsonb_array_elements(p_valores) x
               left join public.branches b on b.id = nullif(x ->> 'branch_id', '')::uuid
               left join public.organizations o on o.id = b.organization_id
              where o.id is null or x ->> 'valor' is null) then
    raise exception 'Há filial sem cadastro ou sem empresa no relatório: nada foi gravado.' using errcode = 'P0001';
  end if;
  v_com_custo := exists (select 1 from jsonb_array_elements(p_valores) x where x ? 'custo');
  if v_com_custo and exists (select 1 from jsonb_array_elements(p_valores) x where jsonb_typeof(x -> 'custo') is distinct from 'number') then
    raise exception 'Há filial sem o custo no relatório: nada foi gravado.' using errcode = 'P0001';
  end if;

  for v_emp in
    select upper(o.nome_fantasia) as empresa, count(distinct b.id) as filiais, round(sum((x ->> 'valor')::numeric), 2) as total,
           round(sum(coalesce((x ->> 'custo')::numeric, 0)), 2) as custo
      from jsonb_array_elements(p_valores) x
      join public.branches b on b.id = (x ->> 'branch_id')::uuid
      join public.organizations o on o.id = b.organization_id
     group by 1
  loop
    select importacao_id into v_imp from public.dre_contabil where empresa = v_emp.empresa and competencia = p_competencia limit 1;
    if v_imp is null then
      insert into public.dre_contabil_importacoes (empresa, arquivo, meses, filiais, valores, avisos)
      values (v_emp.empresa, left(p_arquivo, 200), array[p_competencia], v_emp.filiais, v_emp.filiais, null)
      returning id into v_imp;
    end if;
    delete from public.dre_contabil where empresa = v_emp.empresa and competencia = p_competencia and linha = 'vendas';
    insert into public.dre_contabil (empresa, branch_id, competencia, linha, valor, importacao_id, manual, origem)
    select v_emp.empresa, b.id, p_competencia, 'vendas', round(sum((x ->> 'valor')::numeric), 2), v_imp, true, 'trier'
      from jsonb_array_elements(p_valores) x
      join public.branches b on b.id = (x ->> 'branch_id')::uuid
      join public.organizations o on o.id = b.organization_id
     where upper(o.nome_fantasia) = v_emp.empresa
     group by b.id;
    get diagnostics v_n = row_count;
    if v_com_custo then
      delete from public.dre_contabil where empresa = v_emp.empresa and competencia = p_competencia and linha = 'custo_mercadoria';
      insert into public.dre_contabil (empresa, branch_id, competencia, linha, valor, importacao_id, manual, origem)
      select v_emp.empresa, b.id, p_competencia, 'custo_mercadoria', -round(sum((x ->> 'custo')::numeric), 2), v_imp, true, 'trier'
        from jsonb_array_elements(p_valores) x
        join public.branches b on b.id = (x ->> 'branch_id')::uuid
        join public.organizations o on o.id = b.organization_id
       where upper(o.nome_fantasia) = v_emp.empresa
       group by b.id;
      v_custo_total := v_custo_total + v_emp.custo;
    end if;
    n := n + v_n;
    v_total := v_total + v_emp.total;
    v_empresas := v_empresas || jsonb_build_object('empresa', v_emp.empresa, 'filiais', v_n, 'total', v_emp.total, 'custo', case when v_com_custo then v_emp.custo end);
  end loop;

  insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_novo)
  values (auth.uid(), 'editar', 'dre_contabil', null,
          jsonb_build_object('linha', case when v_com_custo then 'vendas + custo_mercadoria' else 'vendas' end, 'origem', 'Trier: Vendas Produtos',
                             'competencia', p_competencia, 'arquivo', left(p_arquivo, 200), 'filiais', n, 'total', v_total,
                             'custo', case when v_com_custo then v_custo_total end, 'empresas', v_empresas));
  return jsonb_build_object('linhas', n, 'total', v_total, 'custo', case when v_com_custo then v_custo_total end, 'empresas', v_empresas);
end $function$;

-- ---------- devoluções (0139) + custo das devoluções somado no Crédito CMV ----------
create or replace function public.dre_devolucoes_trier_gravar(p_competencia date, p_valores jsonb, p_arquivo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_emp record;
  v_imp uuid;
  v_n integer;
  n integer := 0;
  v_total numeric := 0;
  v_custo_total numeric := 0;
  v_com_custo boolean;
  v_empresas jsonb := '[]'::jsonb;
begin
  if auth.uid() is not null and not ((select private.sou_admin()) or (select private.tem_papel('financeiro'))) then
    raise exception 'Só Administrador e Financeiro gravam as devoluções do Trier na DRE.' using errcode = 'P0001';
  end if;
  if p_competencia is null or extract(day from p_competencia) <> 1 then
    raise exception 'Mês inválido.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_valores) is distinct from 'array' or jsonb_array_length(p_valores) = 0 then
    raise exception 'Nenhuma filial com devolução: nada foi gravado.' using errcode = 'P0001';
  end if;
  if exists (select 1
               from jsonb_array_elements(p_valores) x
               left join public.branches b on b.id = nullif(x ->> 'branch_id', '')::uuid
               left join public.organizations o on o.id = b.organization_id
              where o.id is null or jsonb_typeof(x -> 'valor') is distinct from 'number') then
    raise exception 'Há filial sem cadastro, sem empresa ou sem valor no relatório: nada foi gravado.' using errcode = 'P0001';
  end if;
  -- custo das devoluções: ou vem de todas as filiais ou de nenhuma
  v_com_custo := exists (select 1 from jsonb_array_elements(p_valores) x where x ? 'custo');
  if v_com_custo and exists (select 1 from jsonb_array_elements(p_valores) x where jsonb_typeof(x -> 'custo') is distinct from 'number') then
    raise exception 'Há filial sem o custo no relatório: nada foi gravado.' using errcode = 'P0001';
  end if;

  for v_emp in
    select upper(o.nome_fantasia) as empresa, count(distinct b.id) as filiais, round(sum(abs((x ->> 'valor')::numeric)), 2) as total,
           round(sum(abs(coalesce((x ->> 'custo')::numeric, 0))), 2) as custo
      from jsonb_array_elements(p_valores) x
      join public.branches b on b.id = (x ->> 'branch_id')::uuid
      join public.organizations o on o.id = b.organization_id
     group by 1
  loop
    select importacao_id into v_imp from public.dre_contabil where empresa = v_emp.empresa and competencia = p_competencia limit 1;
    if v_imp is null then
      insert into public.dre_contabil_importacoes (empresa, arquivo, meses, filiais, valores, avisos)
      values (v_emp.empresa, left(p_arquivo, 200), array[p_competencia], v_emp.filiais, v_emp.filiais, null)
      returning id into v_imp;
    end if;
    -- (-) Devoluções: negativo, uma linha por filial; o que havia no mês nessa empresa (Omie/planilha) é trocado
    delete from public.dre_contabil where empresa = v_emp.empresa and competencia = p_competencia and linha = 'devolucoes';
    insert into public.dre_contabil (empresa, branch_id, competencia, linha, valor, importacao_id, manual, origem)
    select v_emp.empresa, b.id, p_competencia, 'devolucoes', -round(sum(abs((x ->> 'valor')::numeric)), 2), v_imp, true, 'trier'
      from jsonb_array_elements(p_valores) x
      join public.branches b on b.id = (x ->> 'branch_id')::uuid
      join public.organizations o on o.id = b.organization_id
     where upper(o.nome_fantasia) = v_emp.empresa
     group by b.id;
    get diagnostics v_n = row_count;
    if v_com_custo then
      -- Crédito CMV: só a parte do Trier é trocada; a do contador fica e as duas somam na DRE
      delete from public.dre_contabil
       where empresa = v_emp.empresa and competencia = p_competencia and linha = 'ajuste_cmv' and origem = 'trier_credito_devolucoes';
      insert into public.dre_contabil (empresa, branch_id, competencia, linha, valor, importacao_id, manual, origem)
      select v_emp.empresa, b.id, p_competencia, 'ajuste_cmv', round(sum(abs((x ->> 'custo')::numeric)), 2), v_imp, false, 'trier_credito_devolucoes'
        from jsonb_array_elements(p_valores) x
        join public.branches b on b.id = (x ->> 'branch_id')::uuid
        join public.organizations o on o.id = b.organization_id
       where upper(o.nome_fantasia) = v_emp.empresa
       group by b.id
      having round(sum(abs((x ->> 'custo')::numeric)), 2) <> 0;
      v_custo_total := v_custo_total + v_emp.custo;
    end if;
    n := n + v_n;
    v_total := v_total + v_emp.total;
    v_empresas := v_empresas || jsonb_build_object('empresa', v_emp.empresa, 'filiais', v_n, 'total', v_emp.total, 'custo', case when v_com_custo then v_emp.custo end);
  end loop;

  insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_novo)
  values (auth.uid(), 'editar', 'dre_contabil', null,
          jsonb_build_object('linha', case when v_com_custo then 'devolucoes + ajuste_cmv (custo das devoluções)' else 'devolucoes' end,
                             'origem', 'Trier: Vendas Produtos (devoluções)', 'competencia', p_competencia, 'arquivo', left(p_arquivo, 200),
                             'filiais', n, 'total', v_total, 'custo', case when v_com_custo then v_custo_total end, 'empresas', v_empresas));
  return jsonb_build_object('linhas', n, 'total', v_total, 'custo', case when v_com_custo then v_custo_total end, 'empresas', v_empresas);
end $function$;

-- ---------- importação da planilha do contador: não apaga o que veio do Trier ----------
create or replace function public.dre_contabil_importar(p_empresa text, p_arquivo text, p_meses date[], p_valores jsonb, p_avisos jsonb default null::jsonb)
 returns uuid
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_filiais integer;
begin
  if not ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador'))) then
    raise exception 'Só Administrador, Financeiro e Contador importam a DRE.';
  end if;
  if coalesce(array_length(p_meses, 1), 0) = 0 then raise exception 'Nenhum mês para importar.'; end if;
  select count(distinct v ->> 'branch_id') into v_filiais from jsonb_array_elements(p_valores) v where v ->> 'branch_id' is not null;
  insert into public.dre_contabil_importacoes (empresa, arquivo, meses, filiais, valores, avisos)
  values (p_empresa, p_arquivo, p_meses, v_filiais, jsonb_array_length(p_valores), p_avisos)
  returning id into v_id;
  delete from public.dre_contabil
   where empresa = p_empresa and competencia = any (p_meses) and not manual and origem is null and not private.dre_manual(competencia, linha);
  insert into public.dre_contabil (empresa, branch_id, competencia, linha, valor, importacao_id)
  select p_empresa, nullif(v ->> 'branch_id', '')::uuid, (v ->> 'competencia')::date, v ->> 'linha', (v ->> 'valor')::numeric, v_id
    from jsonb_array_elements(p_valores) v
   where (v ->> 'competencia')::date = any (p_meses)
     and not private.dre_manual((v ->> 'competencia')::date, v ->> 'linha')
     and not exists (select 1 from public.dre_contabil m
                      where m.manual and m.empresa = p_empresa and m.competencia = (v ->> 'competencia')::date
                        and m.linha = v ->> 'linha' and m.branch_id is not distinct from nullif(v ->> 'branch_id', '')::uuid);
  return v_id;
end;
$function$;

-- ---------- digitar à mão: no Crédito CMV troca só a parte do contador ----------
create or replace function public.dre_contabil_lancar_manual(p_empresa text, p_competencia date, p_valores jsonb)
 returns integer
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v record;
  n integer := 0;
  v_imp uuid;
begin
  if not ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador'))) then
    raise exception 'Só Administrador, Financeiro e Contador lançam a DRE.';
  end if;
  if p_competencia is null or extract(day from p_competencia) <> 1 then raise exception 'Mês inválido.'; end if;
  select importacao_id into v_imp from public.dre_contabil where empresa = p_empresa and competencia = p_competencia limit 1;
  if v_imp is null then
    insert into public.dre_contabil_importacoes (empresa, arquivo, meses, filiais, valores, avisos)
    values (p_empresa, 'Digitado no sistema', array[p_competencia], 0, 0, null)
    returning id into v_imp;
  end if;
  for v in select nullif(x ->> 'branch_id', '')::uuid as branch_id, x ->> 'linha' as linha, (x ->> 'valor')::numeric as valor,
                  nullif(left(x ->> 'formula', 500), '') as formula
             from jsonb_array_elements(p_valores) x loop
    if v.linha not in ('vendas', 'outras_receitas_brutas', 'devolucoes', 'impostos_vendas', 'comissoes', 'custo_mercadoria', 'ajuste_cmv',
                       'despesas_pessoal', 'despesas_administrativas', 'despesas_comerciais', 'outras_despesas', 'depreciacao',
                       'receita_financeira', 'outras_receitas', 'despesas_financeiras', 'ir_csll') then
      raise exception 'Conta da DRE inválida: %', v.linha;
    end if;
    delete from public.dre_contabil
     where empresa = p_empresa and competencia = p_competencia and linha = v.linha and branch_id is not distinct from v.branch_id
       and origem is distinct from 'trier_credito_devolucoes';
    insert into public.dre_contabil (empresa, branch_id, competencia, linha, valor, importacao_id, manual, formula)
    values (p_empresa, v.branch_id, p_competencia, v.linha, round(v.valor, 2), v_imp, true, v.formula);
    n := n + 1;
  end loop;
  return n;
end;
$function$;

-- ---------- preencher pelo Omie: não apaga nem duplica o que veio do Trier ----------
create or replace function public.dre_contabil_preencher_omie(p_competencia date)
 returns integer
 language plpgsql
 set search_path to 'public'
as $function$
declare
  n integer;
  v_terc uuid := (select id from public.branches where codigo = 'TERC' limit 1);
begin
  if auth.uid() is not null and not ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador'))) then
    raise exception 'Só Administrador, Financeiro e Contador preenchem a DRE.';
  end if;
  if not private.dre_manual(p_competencia, 'despesas_administrativas') then
    raise exception 'Esse mês não está liberado para lançar à mão.';
  end if;
  create temporary table if not exists _dre_omie (empresa text, branch_id uuid, linha text, valor numeric) on commit drop;
  truncate _dre_omie;
  insert into _dre_omie
  select t.empresa, t.branch_id, t.linha, round(sum(t.v), 2)
    from (
      select upper(o.nome_fantasia) empresa,
             case when b.regional = 'Terceirizadas' and v_terc is not null then v_terc else b.id end branch_id,
             p.linha,
             case l.tipo when 'receber' then l.valor else -l.valor end v
        from public.fin_lancamentos l
        join public.fin_categorias c on c.id = l.categoria_id
        join public.dre_plano_contas p on p.categoria = lower(c.nome)
        join public.branches b on b.id = l.branch_id
        join public.organizations o on o.id = b.organization_id
       where l.competencia = to_char(p_competencia, 'YYYY-MM')
         and not exists (select 1 from public.dre_omie_extras s where s.competencia = p_competencia and s.substitui and lower(s.categoria) = lower(c.nome))
         and not (p_competencia = date '2026-09-01' and b.codigo ~ '^F[25][0-9]{2}$')
      union all
      select upper(o.nome_fantasia),
             case when b.regional = 'Terceirizadas' and v_terc is not null then v_terc else b.id end,
             p.linha,
             x.valor
        from public.dre_omie_extras x
        join public.dre_plano_contas p on p.categoria = lower(x.categoria)
        join public.branches b on b.id = x.branch_id
        join public.organizations o on o.id = b.organization_id
       where x.competencia = p_competencia
         and not (p_competencia = date '2026-09-01' and b.codigo ~ '^F[25][0-9]{2}$')
    ) t
   where t.empresa in (select distinct empresa from public.dre_contabil where competencia = p_competencia)
   group by 1, 2, 3;
  -- o que veio do Trier (devoluções) fica: nem é apagado nem ganha a versão do Omie por cima
  delete from public.dre_contabil d
   where d.competencia = p_competencia
     and d.linha in (select distinct linha from public.dre_plano_contas)
     and d.empresa in (select distinct empresa from _dre_omie)
     and d.origem is null;
  insert into public.dre_contabil (empresa, branch_id, competencia, linha, valor, importacao_id)
  select x.empresa, x.branch_id, p_competencia, x.linha, x.valor,
         (select importacao_id from public.dre_contabil i where i.empresa = x.empresa and i.competencia = p_competencia limit 1)
    from _dre_omie x
   where x.valor <> 0
     and not exists (select 1 from public.dre_contabil t
                      where t.origem = 'trier' and t.empresa = x.empresa and t.competencia = p_competencia and t.linha = x.linha);
  get diagnostics n = row_count;
  return n;
end;
$function$;

-- outubro/2026: depois do deploy, as devoluções de outubro são buscadas de novo pela tela Automações → Robô de vendas
-- (o robô grava as devoluções e o crédito do CMV juntos).
