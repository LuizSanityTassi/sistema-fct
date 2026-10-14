-- 0017 — Financeiro (Etapa F1, parte 2): resumos agregados, totais com filtros e chave do legado.
--  • legado_id vira UNIQUE "normal" (vários NULLs continuam permitidos) para o importador poder usar
--    "on conflict (legado_id) do nothing" e ser reexecutável sem duplicar.
--  • Views com security_invoker: cada papel soma só o que o RLS de fin_lancamentos deixa enxergar.
--  • fin_totais(): soma receber/pagar com os mesmos filtros da tela de lançamentos (PostgREST não agrega).

drop index if exists public.fin_lanc_legado_idx;
alter table public.fin_lancamentos add constraint fin_lancamentos_legado_id_key unique (legado_id);

create or replace view public.fin_resumo_mensal
  with (security_invoker = true) as
select branch_id, competencia, tipo, count(*)::bigint as qtd, sum(valor)::numeric(16,2) as total
from public.fin_lancamentos
group by branch_id, competencia, tipo;

create or replace view public.fin_resumo_categoria
  with (security_invoker = true) as
select branch_id, competencia, tipo, categoria_id, count(*)::bigint as qtd, sum(valor)::numeric(16,2) as total
from public.fin_lancamentos
group by branch_id, competencia, tipo, categoria_id;

create or replace function public.fin_totais(
  p_de         date       default null,
  p_ate        date       default null,
  p_branches   uuid[]     default null,
  p_tipo       fin_tipo   default null,
  p_categoria  uuid       default null,
  p_origem     fin_origem default null,
  p_q          text       default null
)
returns table (tipo fin_tipo, qtd bigint, total numeric)
language sql stable security invoker
set search_path = public
as $$
  select l.tipo, count(*)::bigint, coalesce(sum(l.valor), 0)::numeric
  from public.fin_lancamentos l
  where (p_de        is null or l.data >= p_de)
    and (p_ate       is null or l.data <= p_ate)
    and (p_branches  is null or l.branch_id = any (p_branches))
    and (p_tipo      is null or l.tipo = p_tipo)
    and (p_categoria is null or l.categoria_id = p_categoria)
    and (p_origem    is null or l.origem = p_origem)
    and (p_q         is null or l.descricao ilike '%' || p_q || '%')
  group by l.tipo
$$;
