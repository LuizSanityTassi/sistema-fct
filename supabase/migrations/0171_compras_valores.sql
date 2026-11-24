-- Compras: valores em R$ no cruzamento. O pré-pedido não traz preço: o preço vem das notas (valor total do item ÷
-- quantidade, o que soma o "Total Mercadorias"). Recebido e a mais usam o preço médio das notas que atenderam o item;
-- o que falta usa o mesmo preço ou, se nada chegou, o último preço pago pelo produto em qualquer filial (referência).
-- Troca as três funções do cruzamento (mudam as colunas devolvidas); nenhum dado muda.

drop function if exists public.cmp_pedidos_totais(date, date, integer, text, text, date);
drop function if exists public.cmp_pedidos_resumo(date, date, integer, text, text, date);
drop function if exists public.cmp_cruzamento(date, date, integer, text, text, uuid);

create function public.cmp_cruzamento(
  p_de date,
  p_ate date,
  p_janela integer default 7,
  p_filial text default null,
  p_laboratorio text default null,
  p_pedido uuid default null
)
returns table (
  item_id bigint, pedido_id uuid, numero bigint, filial_codigo text, laboratorio text, data_pedido date,
  produto_codigo integer, produto text, barras text, pedido numeric, recebido numeric, excedente numeric,
  ultima_entrada date, notas text, prazo date,
  preco numeric, preco_referencia boolean, valor_recebido numeric, valor_faltando numeric, valor_excedente numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with cadeia as (
    select i.id as item_id, p.id as pedido_id, p.numero, p.filial_codigo, p.laboratorio, p.data_pedido,
           i.produto_codigo, i.produto, i.barras, i.quantidade as q,
           coalesce(sum(i.quantidade) over w, 0) - i.quantidade as antes,
           coalesce(sum(i.quantidade) over w, 0) as ate_aqui,
           lead(p.data_pedido) over w as proximo,
           first_value(p.data_pedido) over w as primeiro
      from public.cmp_pedidos p
      join public.cmp_pedido_itens i on i.pedido_id = p.id
     where p.data_pedido between p_de - p_janela and p_ate + p_janela
       and (p_filial is null or p.filial_codigo = p_filial)
    window w as (partition by p.filial_codigo, i.produto_codigo order by p.data_pedido, p.numero, i.id)
  ),
  alvo as (
    select * from cadeia c
     where c.data_pedido between p_de and p_ate
       and (p_laboratorio is null or c.laboratorio = p_laboratorio)
       and (p_pedido is null or c.pedido_id = p_pedido)
  ),
  receb as (
    select a.item_id,
           coalesce(sum(x.quantidade), 0) as r,
           sum(x.valor_total) filter (where x.quantidade > 0 and x.valor_total is not null) / nullif(sum(x.quantidade) filter (where x.quantidade > 0 and x.valor_total is not null), 0) as preco_notas,
           max(x.data_entrada) filter (where x.data_entrada >= a.data_pedido) as ultima,
           string_agg(distinct x.rotulo, ' · ') filter (where x.data_entrada >= a.data_pedido) as notas
      from alvo a
      left join lateral (
        select ni.quantidade, ni.valor_total, n.data_entrada, 'NF ' || n.numero || ' ' || coalesce(n.fornecedor_nome, '') as rotulo
          from public.cmp_nota_itens ni
          join public.cmp_notas n on n.id = ni.nota_id
         where ni.produto_codigo = a.produto_codigo
           and n.filial_codigo = a.filial_codigo
           and not n.transferencia
           and n.data_entrada between a.primeiro and a.data_pedido + p_janela
      ) x on true
     group by a.item_id
  ),
  calc as (
    select a.*, r.r, r.ultima, r.notas,
           greatest(0, least(a.q, r.r - a.antes)) as rec,
           case when a.proximo is null then greatest(0, r.r - a.ate_aqui) else 0 end as exc,
           coalesce(r.preco_notas, ref.preco) as preco,
           r.preco_notas is null and ref.preco is not null as referencia
      from alvo a
      join receb r on r.item_id = a.item_id
      -- referência: o último preço pago pelo produto (qualquer filial, fora transferências)
      left join lateral (
        select ni.valor_total / ni.quantidade as preco
          from public.cmp_nota_itens ni
          join public.cmp_notas n on n.id = ni.nota_id
         where ni.produto_codigo = a.produto_codigo and ni.quantidade > 0 and ni.valor_total is not null and not n.transferencia
         order by n.data_entrada desc nulls last
         limit 1
      ) ref on r.preco_notas is null
  )
  select c.item_id, c.pedido_id, c.numero, c.filial_codigo, c.laboratorio, c.data_pedido,
         c.produto_codigo, c.produto, c.barras, c.q, c.rec, c.exc, c.ultima, c.notas, c.data_pedido + p_janela,
         round(c.preco, 4), c.referencia,
         round(c.rec * c.preco, 2), round(greatest(0, c.q - c.rec) * c.preco, 2), round(c.exc * c.preco, 2)
    from calc c;
$$;
revoke all on function public.cmp_cruzamento(date, date, integer, text, text, uuid) from public, anon;
grant execute on function public.cmp_cruzamento(date, date, integer, text, text, uuid) to authenticated;

create function public.cmp_pedidos_resumo(
  p_de date,
  p_ate date,
  p_janela integer default 7,
  p_filial text default null,
  p_laboratorio text default null,
  p_hoje date default current_date
)
returns table (
  pedido_id uuid, numero bigint, filial_codigo text, laboratorio text, data_pedido date, prazo date,
  itens bigint, qtd_pedida numeric, qtd_recebida numeric, qtd_excedente numeric,
  itens_completos bigint, itens_parciais bigint, itens_nao_chegaram bigint, itens_a_mais bigint,
  ultima_entrada date, situacao text,
  valor_recebido numeric, valor_faltando numeric, valor_excedente numeric, itens_sem_preco bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select c.pedido_id, c.numero, c.filial_codigo, c.laboratorio, c.data_pedido, max(c.prazo),
         count(*), sum(c.pedido), sum(c.recebido), sum(c.excedente),
         count(*) filter (where c.recebido >= c.pedido),
         count(*) filter (where c.recebido > 0 and c.recebido < c.pedido),
         count(*) filter (where c.recebido = 0),
         count(*) filter (where c.excedente > 0),
         max(c.ultima_entrada),
         case
           when sum(c.recebido) >= sum(c.pedido) and sum(c.excedente) = 0 then 'completo'
           when sum(c.excedente) > 0 and sum(c.recebido) >= sum(c.pedido) then 'a_mais'
           when max(c.prazo) >= p_hoje then 'aguardando'
           else 'faltou'
         end,
         coalesce(sum(c.valor_recebido), 0), coalesce(sum(c.valor_faltando), 0), coalesce(sum(c.valor_excedente), 0),
         count(*) filter (where c.preco is null)
    from public.cmp_cruzamento(p_de, p_ate, p_janela, p_filial, p_laboratorio, null) c
   group by c.pedido_id, c.numero, c.filial_codigo, c.laboratorio, c.data_pedido;
$$;
revoke all on function public.cmp_pedidos_resumo(date, date, integer, text, text, date) from public, anon;
grant execute on function public.cmp_pedidos_resumo(date, date, integer, text, text, date) to authenticated;

create function public.cmp_pedidos_totais(
  p_de date,
  p_ate date,
  p_janela integer default 7,
  p_filial text default null,
  p_laboratorio text default null,
  p_hoje date default current_date
)
returns table (
  situacao text, pedidos bigint, itens bigint, qtd_pedida numeric, qtd_recebida numeric, qtd_excedente numeric,
  valor_recebido numeric, valor_faltando numeric, valor_excedente numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select r.situacao, count(*), sum(r.itens), sum(r.qtd_pedida), sum(r.qtd_recebida), sum(r.qtd_excedente),
         sum(r.valor_recebido), sum(r.valor_faltando), sum(r.valor_excedente)
    from public.cmp_pedidos_resumo(p_de, p_ate, p_janela, p_filial, p_laboratorio, p_hoje) r
   group by r.situacao;
$$;
revoke all on function public.cmp_pedidos_totais(date, date, integer, text, text, date) from public, anon;
grant execute on function public.cmp_pedidos_totais(date, date, integer, text, text, date) to authenticated;
