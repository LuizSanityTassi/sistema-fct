-- Coordenador e televendas (complemento da 0180, 25/11/2026): as centrais de televendas são da regional (TELE CRICIÚMA =
-- Sul, TELE LAGES = Serra, TELE CONCÓRDIA = Oeste). O coordenador via as três em vendas_filiais/vendas_serie e
-- vendas_tele_por_filial devolvia a tele de todas as filiais. Agora:
--  * vendas_tele_por_filial: o coordenador recebe só as linhas da filial dele OU da central dele;
--  * vendas_filiais / vendas_serie: a linha da central só sai para o coordenador se a central for da regional dele.
-- O total da rede (vendas_rede_resumo / vendas_serie_rede, SECURITY DEFINER) não muda: lá dentro current_user é o dono
-- da função (não "authenticated"), as lojas vêm todas e a tele que sai de uma loja entra na central (a soma é a mesma).
-- Só troca funções; nenhuma tabela muda.

create or replace function public.vendas_tele_por_filial(p_de date, p_ate date, p_por text default 'total')
returns table (periodo date, branch_id uuid, central_id uuid, venda numeric, atendimentos bigint, custo numeric, unidades numeric,
               premium numeric, generico numeric, similares numeric, referencia numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with eq as (
    select t.vendedor_codigo, c.id central_id
    from public.vendas_televendas_vendedores t
    left join lateral (
      select b.id from public.branches b where b.codigo like 'TLV-%' and b.cidade = t.equipe and b.ativo order by b.codigo limit 1
    ) c on true
  ), v as (
    select case p_por when 'dia' then d.data when 'mes' then date_trunc('month', d.data)::date end periodo,
      date_trunc('month', d.data)::date mes, d.branch_id, eq.central_id,
      sum(d.venda - d.ecom_venda) venda, sum(d.atendimentos - d.ecom_atendimentos) atendimentos,
      sum(case when d.venda <> 0 then d.custo * (d.venda - d.ecom_venda) / d.venda else d.custo end) custo
    from public.vendas_vendedor_dia d
    join eq on eq.vendedor_codigo = d.vendedor_codigo
    where d.data between p_de and p_ate
      and ((select private.sou_admin()) or (select private.tem_papel('financeiro'))
        or d.branch_id = any ((select private.filiais_da_coordenacao())::uuid[])
        or eq.central_id = any ((select private.filiais_da_coordenacao())::uuid[])
        or ((select private.tem_papel('gerente')) and d.branch_id = any ((select private.filiais_visiveis())::uuid[])))
    group by 1, 2, 3, 4
  ), m as (
    select g.branch_id, eq.central_id, g.mes, sum(g.venda) venda, sum(g.quantidade) unidades,
      coalesce(sum(g.venda) filter (where g.grupo_codigo in (47, 113)), 0) premium,
      coalesce(sum(g.venda) filter (where g.grupo_codigo = 102), 0) generico,
      coalesce(sum(g.venda) filter (where g.grupo_codigo = 103), 0) similares,
      coalesce(sum(g.venda) filter (where g.grupo_codigo = 101), 0) referencia
    from public.vendas_vendedor_grupo_mes g
    join eq on eq.vendedor_codigo = g.vendedor_codigo
    where g.mes between date_trunc('month', p_de)::date and p_ate
    group by 1, 2, 3
  )
  select v.periodo, v.branch_id, v.central_id, sum(v.venda), sum(v.atendimentos)::bigint, sum(v.custo),
    sum(coalesce(v.venda * m.unidades / nullif(m.venda, 0), 0)),
    sum(coalesce(v.venda * m.premium / nullif(m.venda, 0), 0)),
    sum(coalesce(v.venda * m.generico / nullif(m.venda, 0), 0)),
    sum(coalesce(v.venda * m.similares / nullif(m.venda, 0), 0)),
    sum(coalesce(v.venda * m.referencia / nullif(m.venda, 0), 0))
  from v
  left join m on m.branch_id = v.branch_id and m.mes = v.mes and m.central_id is not distinct from v.central_id
  group by v.periodo, v.branch_id, v.central_id;
$$;

create or replace function public.vendas_filiais(p_de date, p_ate date)
returns table (branch_id uuid, codigo text, nome text, regional text, venda numeric, atendimentos bigint, itens bigint, unidades numeric,
               dias bigint, venda_grupos numeric, custo numeric, premium numeric, generico numeric, similares numeric, referencia numeric, fortvigor numeric)
language sql
stable
set search_path = ''
as $$
  with f as (
    select v.branch_id, sum(v.venda) venda, sum(v.atendimentos) atendimentos, sum(v.itens) itens, sum(v.unidades) unidades, count(*) dias
    from public.vendas_filial_dia v where v.data between p_de and p_ate group by v.branch_id
  ), g as (
    select v.branch_id, sum(v.venda) venda, sum(v.custo) custo,
      coalesce(sum(v.venda) filter (where v.grupo_codigo in (47, 113)), 0) premium,
      coalesce(sum(v.venda) filter (where v.grupo_codigo = 102), 0) generico,
      coalesce(sum(v.venda) filter (where v.grupo_codigo = 103), 0) similares,
      coalesce(sum(v.venda) filter (where v.grupo_codigo = 101), 0) referencia
    from public.vendas_grupo_dia v where v.data between p_de and p_ate group by v.branch_id
  ), l as (
    select v.branch_id, sum(v.quantidade) fortvigor from public.vendas_laboratorio_dia v where v.data between p_de and p_ate group by v.branch_id
  ), tc as (
    select * from public.vendas_tele_por_filial(p_de, p_ate, 'total')
  ), t as (
    select tc.branch_id, sum(tc.venda) venda, sum(tc.atendimentos) atendimentos, sum(tc.custo) custo, sum(tc.unidades) unidades,
      sum(tc.premium) premium, sum(tc.generico) generico, sum(tc.similares) similares, sum(tc.referencia) referencia
    from tc group by tc.branch_id
  ), dias_tele as (
    select count(distinct d.data) dias from public.vendas_vendedor_dia d join public.vendas_televendas_vendedores x on x.vendedor_codigo = d.vendedor_codigo where d.data between p_de and p_ate
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
  select c.id, coalesce(c.codigo, 'TELE'), coalesce(c.nome, 'TELEVENDAS'), coalesce(c.regional, 'Televendas'), sum(tc.venda), sum(tc.atendimentos)::bigint, 0::bigint, sum(tc.unidades),
    (select dias from dias_tele)::bigint,
    sum(tc.venda), sum(tc.custo), sum(tc.premium), sum(tc.generico), sum(tc.similares), sum(tc.referencia), 0::numeric
  from tc
  left join public.branches c on c.id = tc.central_id
  where (select private.sou_admin()) or (select private.tem_papel('financeiro'))
     or tc.central_id = any ((select private.filiais_da_coordenacao())::uuid[])
     or current_user not in ('authenticated', 'anon')
  group by c.id, c.codigo, c.nome, c.regional
  having coalesce(sum(tc.venda), 0) <> 0;
$$;

create or replace function public.vendas_serie(p_de date, p_ate date, p_por text default 'dia')
returns table (periodo date, regional text, venda numeric, atendimentos bigint, unidades numeric, venda_grupos numeric, custo numeric,
               premium numeric, generico numeric, similares numeric, referencia numeric)
language sql
stable
set search_path = ''
as $$
  with f as (
    select case when p_por = 'mes' then date_trunc('month', v.data)::date else v.data end periodo, v.branch_id,
      sum(v.venda) venda, sum(v.atendimentos) atendimentos, sum(v.unidades) unidades
    from public.vendas_filial_dia v where v.data between p_de and p_ate group by 1, 2
  ), g as (
    select case when p_por = 'mes' then date_trunc('month', v.data)::date else v.data end periodo, v.branch_id,
      sum(v.venda) venda, sum(v.custo) custo,
      coalesce(sum(v.venda) filter (where v.grupo_codigo in (47, 113)), 0) premium,
      coalesce(sum(v.venda) filter (where v.grupo_codigo = 102), 0) generico,
      coalesce(sum(v.venda) filter (where v.grupo_codigo = 103), 0) similares,
      coalesce(sum(v.venda) filter (where v.grupo_codigo = 101), 0) referencia
    from public.vendas_grupo_dia v where v.data between p_de and p_ate group by 1, 2
  ), tc as (
    select * from public.vendas_tele_por_filial(p_de, p_ate, case when p_por = 'mes' then 'mes' else 'dia' end)
  ), t as (
    select tc.periodo, tc.branch_id, sum(tc.venda) venda, sum(tc.atendimentos) atendimentos, sum(tc.custo) custo, sum(tc.unidades) unidades,
      sum(tc.premium) premium, sum(tc.generico) generico, sum(tc.similares) similares, sum(tc.referencia) referencia
    from tc group by 1, 2
  ), lojas as (
    select coalesce(f.periodo, g.periodo) periodo, coalesce(b.regional, 'Sem regional') regional,
      sum(coalesce(f.venda, g.venda, 0) - coalesce(t.venda, 0)) venda, sum(coalesce(f.atendimentos, 0) - coalesce(t.atendimentos, 0)) atendimentos, sum(coalesce(f.unidades, 0) - coalesce(t.unidades, 0)) unidades,
      sum(coalesce(g.venda, 0) - coalesce(t.venda, 0)) venda_grupos, sum(coalesce(g.custo, 0) - coalesce(t.custo, 0)) custo, sum(coalesce(g.premium, 0) - coalesce(t.premium, 0)) premium, sum(coalesce(g.generico, 0) - coalesce(t.generico, 0)) generico, sum(coalesce(g.similares, 0) - coalesce(t.similares, 0)) similares, sum(coalesce(g.referencia, 0) - coalesce(t.referencia, 0)) referencia
    from f
    full join g on g.periodo = f.periodo and g.branch_id = f.branch_id
    join public.branches b on b.id = coalesce(f.branch_id, g.branch_id)
    left join t on t.periodo = coalesce(f.periodo, g.periodo) and t.branch_id = b.id
    group by 1, 2
  ), tele as (
    select tc.periodo, coalesce(c.regional, 'Televendas') regional, sum(tc.venda) venda, sum(tc.atendimentos) atendimentos, sum(tc.unidades) unidades,
      sum(tc.venda) venda_grupos, sum(tc.custo) custo, sum(tc.premium) premium, sum(tc.generico) generico, sum(tc.similares) similares, sum(tc.referencia) referencia
    from tc
    left join public.branches c on c.id = tc.central_id
    where (select private.sou_admin()) or (select private.tem_papel('financeiro'))
       or tc.central_id = any ((select private.filiais_da_coordenacao())::uuid[])
       or current_user not in ('authenticated', 'anon')
    group by 1, 2
  )
  select x.periodo, x.regional, sum(x.venda), sum(x.atendimentos)::bigint, sum(x.unidades), sum(x.venda_grupos), sum(x.custo), sum(x.premium), sum(x.generico), sum(x.similares), sum(x.referencia)
  from (select * from lojas union all select * from tele) x
  group by 1, 2
  order by 1, 2;
$$;
