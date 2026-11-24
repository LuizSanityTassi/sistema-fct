-- Compras: o cruzamento levava ~7 s dentro da função (plano genérico, sem saber datas e filtros) e ~70 ms como
-- consulta direta. Agora a função monta a consulta com os valores de cada chamada (EXECUTE ... USING): o mesmo
-- resultado, com o plano certo. Só troca a função; nenhum dado muda.
create or replace function public.cmp_cruzamento(
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
language plpgsql
stable
security invoker
set search_path = public
as $fn$
begin
  return query execute $q$
  with cadeia as (
    select i.id as item_id, p.id as pedido_id, p.numero, p.filial_codigo, p.laboratorio, p.data_pedido,
           i.produto_codigo, i.produto, i.barras, i.quantidade as q,
           coalesce(sum(i.quantidade) over w, 0) - i.quantidade as antes,
           coalesce(sum(i.quantidade) over w, 0) as ate_aqui,
           lead(p.data_pedido) over w as proximo,
           first_value(p.data_pedido) over w as primeiro
      from public.cmp_pedidos p
      join public.cmp_pedido_itens i on i.pedido_id = p.id
     where p.data_pedido between $1 - $3 and $2 + $3
       and ($4::text is null or p.filial_codigo = $4)
    window w as (partition by p.filial_codigo, i.produto_codigo order by p.data_pedido, p.numero, i.id)
  ),
  alvo as (
    select * from cadeia c
     where c.data_pedido between $1 and $2
       and ($5::text is null or c.laboratorio = $5)
       and ($6::uuid is null or c.pedido_id = $6)
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
           and n.data_entrada between a.primeiro and a.data_pedido + $3
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
         c.produto_codigo, c.produto, c.barras, c.q, c.rec, c.exc, c.ultima, c.notas, c.data_pedido + $3,
         round(c.preco, 4), c.referencia,
         round(c.rec * c.preco, 2), round(greatest(0, c.q - c.rec) * c.preco, 2), round(c.exc * c.preco, 2)
    from calc c
  $q$ using p_de, p_ate, p_janela, p_filial, p_laboratorio, p_pedido;
end;
$fn$;
revoke all on function public.cmp_cruzamento(date, date, integer, text, text, uuid) from public, anon;
grant execute on function public.cmp_cruzamento(date, date, integer, text, text, uuid) to authenticated;
