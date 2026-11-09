-- 09/11/2026: "Não consegui ler o histórico dos fornecedores: canceling statement due to statement timeout" ao conciliar.
-- A função refazia a view conc_boletos_vistos (DISTINCT ON sobre todos os itens) UMA VEZ POR FORNECEDOR na subconsulta
-- dos valores: 174 fornecedores x ~0,28 s = 45 s (limite do login: 8 s). Agora a view é lida uma vez só.
-- Medido em produção: 45,2 s -> 0,66 s; mesmo resultado (n, CNPJs, bancos e valores) para os 174 fornecedores — a única
-- diferença possível é qual boleto entra entre os EMPATADOS no mesmo vencimento no corte dos 400 mais recentes, que antes
-- já era arbitrária (agora desempata pela chave, sempre igual). Mesma correção na cópia da Conciliação GI.

create or replace function public.conc_fornecedor_historico(p_raizes text[])
returns table(raiz text, n bigint, cnpjs text[], bancos text[], valores jsonb)
language sql stable set search_path = public as $$
  with v as materialized (
    select b.raiz, b.cnpj_num, b.banco, b.chave, b.valor, b.vencimento, b.fora_padrao
      from public.conc_boletos_vistos b
     where b.raiz = any (p_raizes)
  ), agg as (
    select v.raiz, count(*) as n, array_agg(distinct v.cnpj_num) as cnpjs, array_agg(distinct v.banco) as bancos
      from v group by v.raiz
  ), ult as (
    select x.raiz, jsonb_agg(jsonb_build_array(x.chave, x.valor) order by x.rn) as valores
      from (select v.raiz, v.chave, v.valor,
                   row_number() over (partition by v.raiz order by v.vencimento desc nulls last, v.chave) as rn
              from v where not v.fora_padrao) x
     where x.rn <= 400
     group by x.raiz
  )
  select a.raiz, a.n, a.cnpjs, a.bancos, coalesce(u.valores, '[]'::jsonb)
    from agg a left join ult u on u.raiz = a.raiz
$$;

create or replace function public.gi_conc_fornecedor_historico(p_raizes text[])
returns table(raiz text, n bigint, cnpjs text[], bancos text[], valores jsonb)
language sql stable set search_path = public as $$
  with v as materialized (
    select b.raiz, b.cnpj_num, b.banco, b.chave, b.valor, b.vencimento, b.fora_padrao
      from public.gi_conc_boletos_vistos b
     where b.raiz = any (p_raizes)
  ), agg as (
    select v.raiz, count(*) as n, array_agg(distinct v.cnpj_num) as cnpjs, array_agg(distinct v.banco) as bancos
      from v group by v.raiz
  ), ult as (
    select x.raiz, jsonb_agg(jsonb_build_array(x.chave, x.valor) order by x.rn) as valores
      from (select v.raiz, v.chave, v.valor,
                   row_number() over (partition by v.raiz order by v.vencimento desc nulls last, v.chave) as rn
              from v where not v.fora_padrao) x
     where x.rn <= 400
     group by x.raiz
  )
  select a.raiz, a.n, a.cnpjs, a.bancos, coalesce(u.valores, '[]'::jsonb)
    from agg a left join ult u on u.raiz = a.raiz
$$;
