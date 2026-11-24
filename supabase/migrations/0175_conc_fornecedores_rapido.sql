-- Fornecedores do DDA: a view conc_boletos_vistos tira o estado mais novo de cada boleto olhando TODOS os itens de
-- conciliação (450 mil linhas em 24/11/2026) e só depois filtra o fornecedor: 2 a 3,5 s por consulta. Agora a busca
-- por fornecedor (raiz do CNPJ) filtra primeiro, pelo índice novo, e depois pega o mais novo de cada boleto. Mesmo
-- resultado (conferido por md5 em todos os 228 fornecedores). Não apaga nada.
-- O índice foi criado em produção com CREATE INDEX CONCURRENTLY (sem travar); aqui fica registrado.
create index if not exists conc_itens_raiz_idx on public.conc_itens
  ((left(regexp_replace(coalesce(cnpj, ''::text), '\D'::text, ''::text, 'g'::text), 8)), chave)
  where barra is not null;

-- os boletos (estado mais novo de cada um) dos fornecedores pedidos: as mesmas colunas da view.
-- SECURITY DEFINER com a MESMA regra de leitura de conc_itens (administrador, financeiro, contador; e o serviço dos
-- robôs): com a regra da tabela (RLS) o banco não usa índice de expressão com funções de texto e lia as 450 mil linhas.
create or replace function public.conc_boletos_da_raiz(p_raizes text[])
returns setof public.conc_boletos_vistos
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not (private.sou_admin() or private.tem_papel('financeiro', 'contador')
          or current_setting('role', true) = 'service_role'
          or (current_setting('role', true) in ('none', '') and session_user in ('postgres', 'supabase_admin'))) then
    return;
  end if;
  return query execute $q$
    select distinct on (i.chave)
           i.chave, i.conciliacao_id, c.criado_em,
           regexp_replace(coalesce(i.cnpj, ''::text), '\D'::text, ''::text, 'g'::text) as cnpj_num,
           left(regexp_replace(coalesce(i.cnpj, ''::text), '\D'::text, ''::text, 'g'::text), 8) as raiz,
           left(i.barra, 3) as banco,
           i.beneficiario, i.fornecedor, i.fornecedor_real, i.valor, i.vencimento, i.filial, i.grupo, i.categoria,
           coalesce((i.dados ->> 'fora_padrao')::boolean, false) as fora_padrao,
           i.dados -> 'anomalias' as anomalias
      from public.conc_itens i
      join public.conc_conciliacoes c on c.id = i.conciliacao_id
     where left(regexp_replace(coalesce(i.cnpj, ''::text), '\D'::text, ''::text, 'g'::text), 8) = any ($1)
       and i.barra is not null
       and length(regexp_replace(coalesce(i.cnpj, ''::text), '\D'::text, ''::text, 'g'::text)) = 14
     order by i.chave, c.criado_em desc
  $q$ using p_raizes;
end;
$fn$;
revoke all on function public.conc_boletos_da_raiz(text[]) from public, anon;
grant execute on function public.conc_boletos_da_raiz(text[]) to authenticated;

create or replace function public.conc_fornecedor_ficha(p_raiz text)
returns table(raiz text, nome text, cnpjs text[], bancos text[], fornecedores text[], boletos bigint, total numeric, exatos bigint, divergencias bigint, fora_padrao bigint, minimo numeric, p10 numeric, mediana numeric, p90 numeric, maximo numeric, ultimo_venc date, primeiro timestamp with time zone, ultimo timestamp with time zone)
language sql
stable
set search_path to 'public'
as $function$
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
    from public.conc_boletos_da_raiz(array[p_raiz]) b
  having count(*) > 0
$function$;

create or replace function public.conc_fornecedor_historico(p_raizes text[])
returns table(raiz text, n bigint, cnpjs text[], bancos text[], valores jsonb)
language sql
stable
set search_path to 'public'
as $function$
  with v as materialized (
    select b.raiz, b.cnpj_num, b.banco, b.chave, b.valor, b.vencimento, b.fora_padrao
      from public.conc_boletos_da_raiz(p_raizes) b
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
$function$;
