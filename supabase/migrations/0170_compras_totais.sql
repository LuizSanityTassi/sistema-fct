-- Compras: totais por situação dos pré-pedidos (cartões da tela), com os mesmos filtros da lista.
create or replace function public.cmp_pedidos_totais(
  p_de date,
  p_ate date,
  p_janela integer default 7,
  p_filial text default null,
  p_laboratorio text default null,
  p_hoje date default current_date
)
returns table (situacao text, pedidos bigint, itens bigint, qtd_pedida numeric, qtd_recebida numeric, qtd_excedente numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select r.situacao, count(*), sum(r.itens), sum(r.qtd_pedida), sum(r.qtd_recebida), sum(r.qtd_excedente)
    from public.cmp_pedidos_resumo(p_de, p_ate, p_janela, p_filial, p_laboratorio, p_hoje) r
   group by r.situacao;
$$;
revoke all on function public.cmp_pedidos_totais(date, date, integer, text, text, date) from public, anon;
grant execute on function public.cmp_pedidos_totais(date, date, integer, text, text, date) to authenticated;
