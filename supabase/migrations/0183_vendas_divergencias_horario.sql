-- Painel de vendas relê sozinho o dia que não bate com a venda por horário (pedido do Luiz, 25/11/2026). Achado: o painel
-- lê cada dia uma vez, às 3h30 do dia seguinte; loja que manda a venda para o Trier atrasada fica de fora (F301 04 e 05/11,
-- F309 09/11, F101 13 e 14/11: R$ 15.532,31 a menos). A venda por horário (Rel_0212) soma, por filial e dia, o mesmo que
-- vendas_filial_dia (915 de 918 dias completos iguais em 25/11), e é buscada de novo depois.
-- Esta função devolve os dias em que a soma das horas difere do painel (valor > R$ 0,05 ou quantidade de vendas) e a
-- venda por horário foi buscada DEPOIS da última leitura do painel daquele dia (assim um dia que continua diferente
-- depois de relido não vira pedido toda noite). Só o servidor chama (chave de serviço).

create or replace function public.vendas_divergencias_horario(p_de date)
returns table (data date, filiais integer, diferenca numeric, detalhe text)
language sql
stable
set search_path = ''
as $$
  with h as (
    select k.branch_id, k.data, k.coletado_em, coalesce(sum(d.valor), 0) valor, coalesce(sum(d.vendas), 0) vendas
      from public.vendas_hora_coletas k
      left join public.vendas_hora_dia d on d.branch_id = k.branch_id and d.data = k.data
     where k.data >= p_de and not k.parcial and k.status in ('ok', 'vazio') and k.lido_em is not null and k.branch_id is not null
     group by k.branch_id, k.data, k.coletado_em
  ), p as (
    select c.de as data, max(c.coletado_em) coletado_em
      from public.vendas_coletas c
     where c.relatorio = 'filiais' and c.de = c.ate and c.de >= p_de and not c.parcial and c.status in ('ok', 'vazio')
     group by c.de
  ), dif as (
    select h.data, h.branch_id, h.valor - coalesce(v.venda, 0) diferenca
      from h
      join p on p.data = h.data and p.coletado_em < h.coletado_em
      left join public.vendas_filial_dia v on v.branch_id = h.branch_id and v.data = h.data
     where abs(h.valor - coalesce(v.venda, 0)) > 0.05 or h.vendas <> coalesce(v.atendimentos, 0)
  )
  select dif.data, count(*)::integer, sum(dif.diferenca),
         string_agg(b.codigo || ' ' || to_char(dif.diferenca, 'FM999999990.00'), ', ' order by b.codigo)
    from dif
    join public.branches b on b.id = dif.branch_id
   group by dif.data
   order by dif.data desc;
$$;
revoke all on function public.vendas_divergencias_horario(date) from public, anon, authenticated;
grant execute on function public.vendas_divergencias_horario(date) to service_role;
