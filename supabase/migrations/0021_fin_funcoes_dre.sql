-- 0021 — Funções agregadoras para DRE, ranking por unidade e fluxo diário (PostgREST não agrega).
-- security invoker: respeitam o RLS de fin_lancamentos. A API pagina com Range (máx. 1000 linhas por página).

create or replace function public.fin_dre(p_de char(7), p_ate char(7), p_branches uuid[] default null)
returns table (categoria_id uuid, competencia char(7), tipo fin_tipo, total numeric, qtd bigint)
language sql stable security invoker set search_path = public as $$
  select l.categoria_id, l.competencia, l.tipo, sum(l.valor)::numeric, count(*)::bigint
  from public.fin_lancamentos l
  where l.competencia between p_de and p_ate
    and (p_branches is null or l.branch_id = any (p_branches))
  group by l.categoria_id, l.competencia, l.tipo
  order by l.competencia, l.categoria_id
$$;

create or replace function public.fin_resumo_unidades(p_de char(7), p_ate char(7), p_branches uuid[] default null)
returns table (branch_id uuid, competencia char(7), tipo fin_tipo, grupo text, total numeric)
language sql stable security invoker set search_path = public as $$
  select l.branch_id, l.competencia, l.tipo, c.grupo, sum(l.valor)::numeric
  from public.fin_lancamentos l
  join public.fin_categorias c on c.id = l.categoria_id
  where l.competencia between p_de and p_ate
    and (p_branches is null or l.branch_id = any (p_branches))
  group by l.branch_id, l.competencia, l.tipo, c.grupo
  order by l.branch_id, l.competencia
$$;

create or replace function public.fin_diario(p_de date, p_ate date, p_branches uuid[] default null)
returns table (data date, tipo fin_tipo, categoria_id uuid, total numeric, qtd bigint)
language sql stable security invoker set search_path = public as $$
  select l.data, l.tipo, l.categoria_id, sum(l.valor)::numeric, count(*)::bigint
  from public.fin_lancamentos l
  where l.data between p_de and p_ate
    and (p_branches is null or l.branch_id = any (p_branches))
  group by l.data, l.tipo, l.categoria_id
  order by l.data, l.tipo
$$;
