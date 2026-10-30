-- Televendas fora das filiais (pedido do Luiz em 30/10/2026: "apaga das filiais o resultado deles, apenas deixe no
-- televendas"). O que a equipe de televendas vendeu sai da filial onde o Trier lançou e vira a linha "Televendas"
-- (regional 'Televendas'); o total da rede continua o mesmo.
-- Só dá para separar onde há relatório por vendedor (vendas_vendedor_dia: desde 01/09/2026); antes disso a venda da
-- equipe continua dentro das filiais.

-- Parte de cada filial que é da equipe, por dia, por mês ou no período todo ('total', periodo null).
-- Venda, atendimentos e custo: exatos, do relatório por vendedor (dia a dia). Grupos (premium, genérico, similar,
-- referência) e unidades: do relatório vendedor × grupo do mês, na proporção da venda do período (mês inteiro = exato).
-- security definer para ler a equipe (tabela restrita), com a mesma regra de quem vê cada filial nas tabelas de vendas.
create or replace function public.vendas_tele_por_filial(p_de date, p_ate date, p_por text default 'total')
returns table (periodo date, branch_id uuid, venda numeric, atendimentos bigint, custo numeric, unidades numeric, premium numeric, generico numeric, similares numeric, referencia numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with v as (
    select case p_por when 'dia' then d.data when 'mes' then date_trunc('month', d.data)::date end periodo,
      date_trunc('month', d.data)::date mes, d.branch_id,
      sum(d.venda) venda, sum(d.atendimentos) atendimentos, sum(d.custo) custo
    from public.vendas_vendedor_dia d
    join public.vendas_televendas_vendedores t on t.vendedor_codigo = d.vendedor_codigo
    where d.data between p_de and p_ate
      and ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'coordenador'))
        or ((select private.tem_papel('gerente')) and private.pode_ver_filial(d.branch_id)))
    group by 1, 2, 3
  ), m as (
    select g.branch_id, g.mes, sum(g.venda) venda, sum(g.quantidade) unidades,
      coalesce(sum(g.venda) filter (where g.grupo_codigo = 47), 0) premium,
      coalesce(sum(g.venda) filter (where g.grupo_codigo = 102), 0) generico,
      coalesce(sum(g.venda) filter (where g.grupo_codigo = 103), 0) similares,
      coalesce(sum(g.venda) filter (where g.grupo_codigo = 101), 0) referencia
    from public.vendas_vendedor_grupo_mes g
    join public.vendas_televendas_vendedores t on t.vendedor_codigo = g.vendedor_codigo
    where g.mes between date_trunc('month', p_de)::date and p_ate
    group by 1, 2
  )
  select v.periodo, v.branch_id, sum(v.venda), sum(v.atendimentos)::bigint, sum(v.custo),
    sum(coalesce(v.venda * m.unidades / nullif(m.venda, 0), 0)),
    sum(coalesce(v.venda * m.premium / nullif(m.venda, 0), 0)),
    sum(coalesce(v.venda * m.generico / nullif(m.venda, 0), 0)),
    sum(coalesce(v.venda * m.similares / nullif(m.venda, 0), 0)),
    sum(coalesce(v.venda * m.referencia / nullif(m.venda, 0), 0))
  from v
  left join m on m.branch_id = v.branch_id and m.mes = v.mes
  group by v.periodo, v.branch_id;
$$;
revoke execute on function public.vendas_tele_por_filial(date, date, text) from public, anon;
grant execute on function public.vendas_tele_por_filial(date, date, text) to authenticated;

-- Filiais sem a venda da equipe + a linha Televendas (só para quem vê a rede: admin, financeiro, coordenador).
create or replace function public.vendas_filiais(p_de date, p_ate date)
returns table(branch_id uuid, codigo text, nome text, regional text, venda numeric, atendimentos bigint, itens bigint, unidades numeric, dias bigint, venda_grupos numeric, custo numeric, premium numeric, generico numeric, similares numeric, referencia numeric, fortvigor numeric)
language sql
stable
set search_path to ''
as $function$
  with f as (
    select v.branch_id, sum(v.venda) venda, sum(v.atendimentos) atendimentos, sum(v.itens) itens, sum(v.unidades) unidades, count(*) dias
    from public.vendas_filial_dia v where v.data between p_de and p_ate group by v.branch_id
  ), g as (
    select v.branch_id, sum(v.venda) venda, sum(v.custo) custo,
      coalesce(sum(v.venda) filter (where v.grupo_codigo = 47), 0) premium,
      coalesce(sum(v.venda) filter (where v.grupo_codigo = 102), 0) generico,
      coalesce(sum(v.venda) filter (where v.grupo_codigo = 103), 0) similares,
      coalesce(sum(v.venda) filter (where v.grupo_codigo = 101), 0) referencia
    from public.vendas_grupo_dia v where v.data between p_de and p_ate group by v.branch_id
  ), l as (
    select v.branch_id, sum(v.quantidade) fortvigor from public.vendas_laboratorio_dia v where v.data between p_de and p_ate group by v.branch_id
  ), t as (
    select * from public.vendas_tele_por_filial(p_de, p_ate, 'total')
  )
  select b.id, b.codigo, b.nome, b.regional,
    coalesce(f.venda, g.venda, 0) - coalesce(t.venda, 0), coalesce(f.atendimentos, 0) - coalesce(t.atendimentos, 0), coalesce(f.itens, 0), coalesce(f.unidades, 0) - coalesce(t.unidades, 0), coalesce(f.dias, 0),
    coalesce(g.venda, 0) - coalesce(t.venda, 0), coalesce(g.custo, 0) - coalesce(t.custo, 0), coalesce(g.premium, 0) - coalesce(t.premium, 0), coalesce(g.generico, 0) - coalesce(t.generico, 0), coalesce(g.similares, 0) - coalesce(t.similares, 0), coalesce(g.referencia, 0) - coalesce(t.referencia, 0),
    coalesce(l.fortvigor, 0)
  from public.branches b
  left join f on f.branch_id = b.id
  left join g on g.branch_id = b.id
  left join l on l.branch_id = b.id
  left join t on t.branch_id = b.id
  where f.branch_id is not null or g.branch_id is not null
  union all
  select null::uuid, 'TELE', 'TELEVENDAS', 'Televendas', sum(t.venda), sum(t.atendimentos)::bigint, 0::bigint, sum(t.unidades),
    (select count(distinct d.data) from public.vendas_vendedor_dia d join public.vendas_televendas_vendedores x on x.vendedor_codigo = d.vendedor_codigo where d.data between p_de and p_ate)::bigint,
    sum(t.venda), sum(t.custo), sum(t.premium), sum(t.generico), sum(t.similares), sum(t.referencia), 0::numeric
  from t
  where (select private.sou_admin()) or (select private.tem_papel('financeiro', 'coordenador'))
  having coalesce(sum(t.venda), 0) <> 0;
$function$;

-- Série por dia/mês e regional, sem a venda da equipe nas filiais + a regional 'Televendas' (mesma regra acima).
create or replace function public.vendas_serie(p_de date, p_ate date, p_por text default 'dia'::text)
returns table(periodo date, regional text, venda numeric, atendimentos bigint, unidades numeric, venda_grupos numeric, custo numeric, premium numeric, generico numeric, similares numeric, referencia numeric)
language sql
stable
set search_path to ''
as $function$
  with f as (
    select case when p_por = 'mes' then date_trunc('month', v.data)::date else v.data end periodo, v.branch_id,
      sum(v.venda) venda, sum(v.atendimentos) atendimentos, sum(v.unidades) unidades
    from public.vendas_filial_dia v where v.data between p_de and p_ate group by 1, 2
  ), g as (
    select case when p_por = 'mes' then date_trunc('month', v.data)::date else v.data end periodo, v.branch_id,
      sum(v.venda) venda, sum(v.custo) custo,
      coalesce(sum(v.venda) filter (where v.grupo_codigo = 47), 0) premium,
      coalesce(sum(v.venda) filter (where v.grupo_codigo = 102), 0) generico,
      coalesce(sum(v.venda) filter (where v.grupo_codigo = 103), 0) similares,
      coalesce(sum(v.venda) filter (where v.grupo_codigo = 101), 0) referencia
    from public.vendas_grupo_dia v where v.data between p_de and p_ate group by 1, 2
  ), t as (
    select * from public.vendas_tele_por_filial(p_de, p_ate, case when p_por = 'mes' then 'mes' else 'dia' end)
  )
  select coalesce(f.periodo, g.periodo), coalesce(b.regional, 'Sem regional'),
    sum(coalesce(f.venda, g.venda, 0) - coalesce(t.venda, 0)), sum(coalesce(f.atendimentos, 0) - coalesce(t.atendimentos, 0))::bigint, sum(coalesce(f.unidades, 0) - coalesce(t.unidades, 0)),
    sum(coalesce(g.venda, 0) - coalesce(t.venda, 0)), sum(coalesce(g.custo, 0) - coalesce(t.custo, 0)), sum(coalesce(g.premium, 0) - coalesce(t.premium, 0)), sum(coalesce(g.generico, 0) - coalesce(t.generico, 0)), sum(coalesce(g.similares, 0) - coalesce(t.similares, 0)), sum(coalesce(g.referencia, 0) - coalesce(t.referencia, 0))
  from f
  full join g on g.periodo = f.periodo and g.branch_id = f.branch_id
  join public.branches b on b.id = coalesce(f.branch_id, g.branch_id)
  left join t on t.periodo = coalesce(f.periodo, g.periodo) and t.branch_id = b.id
  group by 1, 2
  union all
  select t.periodo, 'Televendas', sum(t.venda), sum(t.atendimentos)::bigint, sum(t.unidades), sum(t.venda), sum(t.custo), sum(t.premium), sum(t.generico), sum(t.similares), sum(t.referencia)
  from t
  where (select private.sou_admin()) or (select private.tem_papel('financeiro', 'coordenador'))
  group by 1
  order by 1, 2;
$function$;
