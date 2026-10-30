-- Televendas sem e-commerce (pedido do Luiz em 30/10/2026: "desconsidera do pessoal do tele tudo que a forma de
-- pagamento for ecommerce"). A venda e-commerce de cada vendedor vem do Rel_0027 (relatório 'ecommerce' do robô) e
-- fica em vendas_vendedor_dia.ecom_*; do televendas sai a parte e-commerce, que volta a contar na filial.
alter table public.vendas_vendedor_dia add column if not exists ecom_venda numeric not null default 0;
alter table public.vendas_vendedor_dia add column if not exists ecom_atendimentos integer not null default 0;

-- parte de cada filial que é da equipe (sem o e-commerce); custo na proporção da venda que fica
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
      sum(d.venda - d.ecom_venda) venda, sum(d.atendimentos - d.ecom_atendimentos) atendimentos,
      sum(case when d.venda <> 0 then d.custo * (d.venda - d.ecom_venda) / d.venda else d.custo end) custo
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

-- venda da equipe (sem e-commerce) + quanto foi e-commerce (fica fora)
drop function if exists public.vendas_televendas(date, date);
create function public.vendas_televendas(p_de date, p_ate date)
returns table (
  vendedor_codigo integer, vendedor_nome text, equipe text, funcao text,
  branch_id uuid, codigo text, loja text, regional text,
  venda numeric, atendimentos bigint, custo numeric, tele_venda numeric, tele_atendimentos bigint, dias bigint, ecom_venda numeric
)
language sql
stable
set search_path = ''
as $$
  select t.vendedor_codigo, t.nome, t.equipe, t.funcao,
    b.id, b.codigo, b.nome, b.regional,
    sum(v.venda - v.ecom_venda), sum(v.atendimentos - v.ecom_atendimentos)::bigint,
    sum(case when v.venda <> 0 then v.custo * (v.venda - v.ecom_venda) / v.venda else v.custo end),
    sum(v.tele_venda), sum(v.tele_atendimentos)::bigint, count(distinct v.data), sum(v.ecom_venda)
  from public.vendas_televendas_vendedores t
  join public.vendas_vendedor_dia v on v.vendedor_codigo = t.vendedor_codigo and v.data between p_de and p_ate
  join public.branches b on b.id = v.branch_id
  group by t.vendedor_codigo, t.nome, t.equipe, t.funcao, b.id, b.codigo, b.nome, b.regional;
$$;
revoke execute on function public.vendas_televendas(date, date) from public, anon;
grant execute on function public.vendas_televendas(date, date) to authenticated;

-- mix por grupo na proporção da venda sem e-commerce
create or replace function public.vendas_televendas_grupos(p_de date, p_ate date)
returns table (vendedor_codigo integer, grupo_codigo integer, grupo_nome text, venda numeric, unidades numeric, custo numeric)
language sql
stable
set search_path = ''
as $$
  with v as (
    select d.vendedor_codigo, date_trunc('month', d.data)::date mes, sum(d.venda - d.ecom_venda) venda
    from public.vendas_vendedor_dia d
    join public.vendas_televendas_vendedores t on t.vendedor_codigo = d.vendedor_codigo
    where d.data between p_de and p_ate
    group by 1, 2
  ), m as (
    select g.vendedor_codigo, g.mes, g.grupo_codigo, max(g.grupo_nome) grupo_nome, sum(g.venda) venda, sum(g.quantidade) unidades, sum(g.custo) custo,
      sum(sum(g.venda)) over (partition by g.vendedor_codigo, g.mes) total
    from public.vendas_vendedor_grupo_mes g
    join public.vendas_televendas_vendedores t on t.vendedor_codigo = g.vendedor_codigo
    where g.mes between date_trunc('month', p_de)::date and p_ate
    group by 1, 2, 3
  )
  select m.vendedor_codigo, m.grupo_codigo, max(m.grupo_nome),
    sum(m.venda * v.venda / nullif(m.total, 0)), sum(m.unidades * v.venda / nullif(m.total, 0)), sum(m.custo * v.venda / nullif(m.total, 0))
  from m
  join v on v.vendedor_codigo = m.vendedor_codigo and v.mes = m.mes
  group by 1, 2;
$$;
