-- Totais da pesquisa de comprovantes de venda (quantidade e valor por tipo), com os mesmos filtros da tela.
-- security invoker: o RLS de venda_comprovantes decide o que entra na soma (a loja soma só as dela).
create or replace function public.comprovantes_totais(
  p_de date,
  p_ate date,
  p_rede uuid default null,
  p_filial uuid default null,
  p_tipo text default null,
  p_situacao text default null,
  p_busca text default null
)
returns table (tipo text, qtd bigint, valor numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select c.tipo, count(*), coalesce(sum(c.valor), 0)
    from public.venda_comprovantes c
    join public.branches b on b.id = c.branch_id
   where c.data_compra between p_de and p_ate
     and (p_rede is null or b.organization_id = p_rede)
     and (p_filial is null or c.branch_id = p_filial)
     and (p_tipo is null or c.tipo = p_tipo)
     and (p_situacao is null or c.situacao = p_situacao)
     and (p_busca is null
          or c.cliente ilike '%' || p_busca || '%'
          or c.empresa ilike '%' || p_busca || '%'
          or c.numero_venda ilike '%' || p_busca || '%')
   group by c.tipo;
$$;
revoke all on function public.comprovantes_totais(date, date, uuid, uuid, text, text, text) from public, anon;
grant execute on function public.comprovantes_totais(date, date, uuid, uuid, text, text, text) to authenticated;
