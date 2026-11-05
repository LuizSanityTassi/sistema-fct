-- Os cartões "Para conferir", "Só no Trier" e "Só no DDA" contavam também o que já foi enviado ao Omie, e por isso não baixavam
-- com o envio. O resumo passa a trazer os dois números: o total, que segue valendo para a taxa de "Bateram", e o que falta tratar.
drop function if exists public.conc_resumo_periodo(uuid);

create function public.conc_resumo_periodo(p_conciliacao uuid)
returns table (filial integer, grupo text, qtd bigint, valor numeric, qtd_aberto bigint, valor_aberto numeric)
language sql stable security invoker set search_path = public as $$
  select i.filial, i.grupo, count(*), coalesce(sum(i.valor), 0),
         count(*) filter (where i.enviado_em is null),
         coalesce(sum(i.valor) filter (where i.enviado_em is null), 0)
    from public.conc_itens i
   where i.conciliacao_id = p_conciliacao and i.vencimento >= private.operacao_inicio()
   group by 1, 2;
$$;

revoke all on function public.conc_resumo_periodo(uuid) from public, anon;
grant execute on function public.conc_resumo_periodo(uuid) to authenticated;
