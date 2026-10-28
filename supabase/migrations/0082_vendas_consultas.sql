-- Vendas: somas por filial e por período para as telas (security invoker: valem as regras de quem vê cada loja).
-- Grupos do Trier usados nas colunas: 47 PREMIUM, 101 REFERENCIAS, 102 GENERICOS, 103 SIMILARES.
-- venda = Rel_0056 (líquido, vendas menos devoluções); sem ele no dia, a soma dos grupos (Rel_0080) — é o mesmo valor.
-- CMV = custo ÷ venda dos grupos (as duas do Rel_0080).

create or replace function public.vendas_filiais(p_de date, p_ate date)
returns table (
  branch_id uuid, codigo text, nome text, regional text,
  venda numeric, atendimentos bigint, itens bigint, unidades numeric, dias bigint,
  venda_grupos numeric, custo numeric, premium numeric, generico numeric, similares numeric, referencia numeric,
  fortvigor numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
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
  )
  select b.id, b.codigo, b.nome, b.regional,
    coalesce(f.venda, g.venda, 0), coalesce(f.atendimentos, 0), coalesce(f.itens, 0), coalesce(f.unidades, 0), coalesce(f.dias, 0),
    coalesce(g.venda, 0), coalesce(g.custo, 0), coalesce(g.premium, 0), coalesce(g.generico, 0), coalesce(g.similares, 0), coalesce(g.referencia, 0),
    coalesce(l.fortvigor, 0)
  from public.branches b
  left join f on f.branch_id = b.id
  left join g on g.branch_id = b.id
  left join l on l.branch_id = b.id
  where f.branch_id is not null or g.branch_id is not null;
$$;

-- p_por: 'dia' ou 'mes' (periodo = 1º dia do mês)
create or replace function public.vendas_serie(p_de date, p_ate date, p_por text default 'dia')
returns table (
  periodo date, regional text,
  venda numeric, atendimentos bigint, unidades numeric,
  venda_grupos numeric, custo numeric, premium numeric, generico numeric, similares numeric, referencia numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
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
  )
  select coalesce(f.periodo, g.periodo), coalesce(b.regional, 'Sem regional'),
    sum(coalesce(f.venda, g.venda, 0)), sum(coalesce(f.atendimentos, 0))::bigint, sum(coalesce(f.unidades, 0)),
    sum(coalesce(g.venda, 0)), sum(coalesce(g.custo, 0)), sum(coalesce(g.premium, 0)), sum(coalesce(g.generico, 0)), sum(coalesce(g.similares, 0)), sum(coalesce(g.referencia, 0))
  from f
  full join g on g.periodo = f.periodo and g.branch_id = f.branch_id
  join public.branches b on b.id = coalesce(f.branch_id, g.branch_id)
  group by 1, 2
  order by 1, 2;
$$;

revoke all on function public.vendas_filiais(date, date) from public, anon;
revoke all on function public.vendas_serie(date, date, text) from public, anon;
grant execute on function public.vendas_filiais(date, date) to authenticated;
grant execute on function public.vendas_serie(date, date, text) to authenticated;
