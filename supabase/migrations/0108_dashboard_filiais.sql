-- Desempenho por filial do painel geral: quebras, conciliação, chamados e ASO de cada loja numa consulta só.
-- Roda com a permissão de quem chama (a RLS de cada tabela decide o que entra), então coordenador vê a regional e o
-- gerente vê as lojas dele; o que a pessoa não pode ver vem zerado. Só volta filial que tem algum dado.
-- % de conciliação: da última conciliação de cada empresa (Varela até a F199, Nazário da F301 em diante), só na filial
-- onde estão os títulos do Trier (a matriz); nas outras lojas o boleto não é conciliado por loja, por isso vem nulo.
create or replace function public.dashboard_filiais()
returns table (
  branch_id uuid, codigo text, nome text, regional text,
  caixas_recentes bigint, quebras_total bigint, quebras_abertas bigint, quebras_paradas bigint, quebras_valor numeric,
  conc_abertas bigint, conc_vencidas bigint, conc_pct numeric, conc_em timestamptz,
  chamados_abertos bigint, aso_vencidos bigint
)
language sql
stable
set search_path = ''
as $$
  with hoje as (
    select (now() at time zone 'America/Sao_Paulo')::date d
  ), q as (
    select c.branch_id,
      count(*) filter (where c.dia >= (select d from hoje) - 45) caixas_recentes,
      count(*) filter (where c.classe = 'quebra') total,
      count(*) filter (where c.classe = 'quebra' and c.andamento in ('pendente', 'justificada')) abertas,
      count(*) filter (where c.classe = 'quebra' and c.andamento = 'pendente' and c.coletado_em < now() - interval '5 days') paradas,
      coalesce(sum(c.valor_quebra) filter (where c.classe = 'quebra' and c.andamento in ('pendente', 'justificada')), 0) valor
    from public.caixa_diferencas c
    group by 1
  ), p as (
    select x.branch_id, count(*) abertas, count(*) filter (where x.vencimento < (select d from hoje)) vencidas
    from public.conc_pendencias x
    where x.status in ('pendente', 'em_analise') and x.branch_id is not null
    group by 1
  ), u as (
    select distinct on (x.fil_min >= 301) x.id, x.pct_bateu, x.criado_em
    from public.conc_conciliacoes x
    order by x.fil_min >= 301, x.criado_em desc
  ), cp as (
    select i.branch_id, max(u.pct_bateu) pct, max(u.criado_em) em
    from u
    join public.conc_itens i on i.conciliacao_id = u.id
    where i.grupo in ('exato', 'aproximado', 'so_trier') and i.branch_id is not null
    group by 1
  ), t as (
    select x.branch_id, count(*) n
    from public.tickets x
    where x.status not in ('resolvido', 'cancelado') and x.branch_id is not null
    group by 1
  ), a as (
    select e.branch_id, count(*) n
    from public.employee_aso x
    join public.employees e on e.id = x.employee_id
    where x.ativo and e.status <> 'desligado' and x.data_validade < (select d from hoje) and e.branch_id is not null
    group by 1
  )
  select b.id, b.codigo, b.nome, b.regional,
    coalesce(q.caixas_recentes, 0), coalesce(q.total, 0), coalesce(q.abertas, 0), coalesce(q.paradas, 0), coalesce(q.valor, 0),
    coalesce(p.abertas, 0), coalesce(p.vencidas, 0), cp.pct, cp.em,
    coalesce(t.n, 0), coalesce(a.n, 0)
  from public.branches b
  left join q on q.branch_id = b.id
  left join p on p.branch_id = b.id
  left join cp on cp.branch_id = b.id
  left join t on t.branch_id = b.id
  left join a on a.branch_id = b.id
  where b.ativo and (q.branch_id is not null or p.branch_id is not null or cp.branch_id is not null or t.branch_id is not null or a.branch_id is not null);
$$;
revoke execute on function public.dashboard_filiais() from public, anon;
grant execute on function public.dashboard_filiais() to authenticated;
