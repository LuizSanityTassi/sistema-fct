-- 0022 — Conciliação C3/C4: histórico por fornecedor (raiz do CNPJ) para a ficha do fornecedor e a detecção
-- de anomalias (valor fora do padrão, banco/CNPJ diferente do habitual, fornecedor novo).
-- Tudo é calculado em cima de conc_itens (um boleto conta uma vez: a leitura mais recente de cada chave).
-- View e funções são security invoker: valem as políticas de conc_itens (admin, financeiro, contador leem).

create or replace view public.conc_boletos_vistos
with (security_invoker = true) as
select distinct on (i.chave)
  i.chave,
  i.conciliacao_id,
  c.criado_em,
  regexp_replace(coalesce(i.cnpj, ''), '\D', '', 'g')          as cnpj_num,
  left(regexp_replace(coalesce(i.cnpj, ''), '\D', '', 'g'), 8) as raiz,
  left(i.barra, 3)                                              as banco,
  i.beneficiario,
  i.fornecedor,
  i.fornecedor_real,
  i.valor,
  i.vencimento,
  i.filial,
  i.grupo,
  i.categoria,
  coalesce((i.dados->>'fora_padrao')::boolean, false)           as fora_padrao,
  (i.dados->'anomalias')                                        as anomalias
from public.conc_itens i
join public.conc_conciliacoes c on c.id = i.conciliacao_id
where i.barra is not null
  and length(regexp_replace(coalesce(i.cnpj, ''), '\D', '', 'g')) = 14
order by i.chave, c.criado_em desc;

grant select on public.conc_boletos_vistos to authenticated;

-- histórico das raízes pedidas (para a detecção de anomalias): CNPJs e bancos já vistos e os últimos 400 valores
-- "normais" (fora do padrão não entra), cada valor com a chave do boleto para o boleto atual não contar contra si mesmo
create or replace function public.conc_fornecedor_historico(p_raizes text[])
returns table (raiz text, n bigint, cnpjs text[], bancos text[], valores jsonb)
language sql stable security invoker
set search_path = public
as $$
  select b.raiz,
         count(*)                               as n,
         array_agg(distinct b.cnpj_num)         as cnpjs,
         array_agg(distinct b.banco)            as bancos,
         coalesce((select jsonb_agg(jsonb_build_array(v.chave, v.valor))
                     from (select x.chave, x.valor
                             from public.conc_boletos_vistos x
                            where x.raiz = b.raiz and not x.fora_padrao
                            order by x.vencimento desc nulls last
                            limit 400) v), '[]'::jsonb) as valores
    from public.conc_boletos_vistos b
   where b.raiz = any (p_raizes)
   group by b.raiz
$$;

-- lista de fornecedores (busca por nome, fornecedor do Trier ou CNPJ)
create or replace function public.conc_fornecedores_lista(p_q text default null, p_limite integer default 200)
returns table (
  raiz text, nome text, qtd bigint, total numeric, cnpjs bigint, bancos bigint,
  exatos bigint, divergencias bigint, fora_padrao bigint,
  primeiro timestamptz, ultimo timestamptz, ultimo_venc date
)
language sql stable security invoker
set search_path = public
as $$
  with q as (select nullif(trim(coalesce(p_q, '')), '') as txt,
                    nullif(regexp_replace(coalesce(p_q, ''), '\D', '', 'g'), '') as num)
  select b.raiz,
         (array_agg(b.beneficiario order by b.criado_em desc))[1]  as nome,
         count(*)                                                  as qtd,
         sum(b.valor)                                              as total,
         count(distinct b.cnpj_num)                                as cnpjs,
         count(distinct b.banco)                                   as bancos,
         count(*) filter (where b.grupo = 'exato')                 as exatos,
         count(*) filter (where b.grupo in ('aproximado', 'so_dda')) as divergencias,
         count(*) filter (where b.fora_padrao)                     as fora_padrao,
         min(b.criado_em)                                          as primeiro,
         max(b.criado_em)                                          as ultimo,
         max(b.vencimento)                                         as ultimo_venc
    from public.conc_boletos_vistos b, q
   where q.txt is null
      or b.beneficiario ilike '%' || q.txt || '%'
      or b.fornecedor   ilike '%' || q.txt || '%'
      or b.fornecedor_real ilike '%' || q.txt || '%'
      or (q.num is not null and b.cnpj_num like '%' || q.num || '%')
   group by b.raiz
   order by max(b.criado_em) desc
   limit greatest(1, least(coalesce(p_limite, 200), 1000))
$$;

-- ficha de um fornecedor (raiz do CNPJ): faixa normal de valores, bancos, CNPJs, nomes no Trier, % conciliado
create or replace function public.conc_fornecedor_ficha(p_raiz text)
returns table (
  raiz text, nome text, cnpjs text[], bancos text[], fornecedores text[],
  boletos bigint, total numeric, exatos bigint, divergencias bigint, fora_padrao bigint,
  minimo numeric, p10 numeric, mediana numeric, p90 numeric, maximo numeric,
  ultimo_venc date, primeiro timestamptz, ultimo timestamptz
)
language sql stable security invoker
set search_path = public
as $$
  select p_raiz,
         (array_agg(b.beneficiario order by b.criado_em desc))[1],
         array_agg(distinct b.cnpj_num),
         array_agg(distinct b.banco),
         array_remove(array_agg(distinct b.fornecedor), null),
         count(*),
         sum(b.valor),
         count(*) filter (where b.grupo = 'exato'),
         count(*) filter (where b.grupo in ('aproximado', 'so_dda')),
         count(*) filter (where b.fora_padrao),
         min(b.valor) filter (where not b.fora_padrao),
         percentile_cont(0.1) within group (order by b.valor) filter (where not b.fora_padrao),
         percentile_cont(0.5) within group (order by b.valor) filter (where not b.fora_padrao),
         percentile_cont(0.9) within group (order by b.valor) filter (where not b.fora_padrao),
         max(b.valor) filter (where not b.fora_padrao),
         max(b.vencimento),
         min(b.criado_em),
         max(b.criado_em)
    from public.conc_boletos_vistos b
   where b.raiz = p_raiz
  having count(*) > 0
$$;

revoke all on function public.conc_fornecedor_historico(text[]) from public, anon;
revoke all on function public.conc_fornecedores_lista(text, integer) from public, anon;
revoke all on function public.conc_fornecedor_ficha(text) from public, anon;
grant execute on function public.conc_fornecedor_historico(text[]) to authenticated;
grant execute on function public.conc_fornecedores_lista(text, integer) to authenticated;
grant execute on function public.conc_fornecedor_ficha(text) to authenticated;
