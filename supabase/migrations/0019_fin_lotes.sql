-- 0019 — Financeiro F2: lotes de importação (Omie / em lote) para listar e desfazer.
-- security_invoker: cada papel enxerga só os lançamentos que o RLS de fin_lancamentos permite.
create or replace view public.fin_lotes
  with (security_invoker = true) as
select
  lote_id,
  origem,
  min(created_by::text)::uuid as created_by,
  min(created_at)             as criado_em,
  count(*)::bigint            as qtd,
  sum(valor)::numeric(16,2)   as total,
  min(data)                   as de,
  max(data)                   as ate,
  count(distinct branch_id)::int as unidades,
  max(descricao)              as descricao
from public.fin_lancamentos
where lote_id is not null
group by lote_id, origem;
