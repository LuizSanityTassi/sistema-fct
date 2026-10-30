-- 1) Robô de vendas: relatório novo "ecommerce" (Rel_0027 Relação de Vendas, só vendas e-commerce, por filial) para
--    tirar do televendas o que a equipe vendeu pelo e-commerce (pedido do Luiz em 30/10/2026).
alter table public.vendas_coletas drop constraint vendas_coletas_relatorio_check;
alter table public.vendas_coletas add constraint vendas_coletas_relatorio_check check (relatorio in ('filiais', 'grupos', 'laboratorios', 'vendedores', 'atendimentos', 'tele_entrega', 'ecommerce'));

-- 2) Mix por grupo de cada vendedor do televendas no período (taxa de genérico, similar, G47…): do relatório vendedor ×
--    grupo do mês, na proporção da venda do vendedor no período (mês inteiro = exato). A RLS das tabelas vale.
create or replace function public.vendas_televendas_grupos(p_de date, p_ate date)
returns table (vendedor_codigo integer, grupo_codigo integer, grupo_nome text, venda numeric, unidades numeric, custo numeric)
language sql
stable
set search_path = ''
as $$
  with v as (
    select d.vendedor_codigo, date_trunc('month', d.data)::date mes, sum(d.venda) venda
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
revoke execute on function public.vendas_televendas_grupos(date, date) from public, anon;
grant execute on function public.vendas_televendas_grupos(date, date) to authenticated;
