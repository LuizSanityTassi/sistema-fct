-- Conciliação GI (pedido do usuário, 22/10/2026): a mesma conciliação DDA × Trier para outra empresa (a GI), sem
-- misturar com a nossa. Tudo da GI fica em tabelas próprias gi_conc_* (cópia da estrutura das conc_*): arquivos,
-- conciliações, itens, pendências, de-para, aprendizado, regras, envios, configuração e agentes começam vazios e
-- nunca tocam nas tabelas conc_*. As filiais da GI não estão no cadastro de unidades do sistema: ficam em
-- gi_conc_filiais (código da filial no Trier, nome, CNPJ e departamento na Omie). Mesmo acesso da nossa:
-- admin e financeiro trabalham, contador consulta. Arquivos no mesmo bucket "conciliacao", na pasta gi/.
-- Nada existente é alterado.

-- 1) Tabelas: mesma estrutura (colunas, padrões, checks, chaves, índices) das conc_*.
create table public.gi_conc_arquivos       (like public.conc_arquivos       including all);
create table public.gi_conc_conciliacoes   (like public.conc_conciliacoes   including all);
create table public.gi_conc_regras         (like public.conc_regras         including all);
create table public.gi_conc_itens          (like public.conc_itens          including all);
create table public.gi_conc_pendencias     (like public.conc_pendencias     including all);
create table public.gi_conc_depara         (like public.conc_depara         including all);
create table public.gi_conc_aprendizado    (like public.conc_aprendizado    including all);
create table public.gi_conc_enviados_omie  (like public.conc_enviados_omie  including all);
create table public.gi_conc_config         (like public.conc_config         including all);
create table public.gi_conc_agentes        (like public.conc_agentes        including all);

-- chaves estrangeiras com os mesmos nomes das conc_* (prefixo gi_), que as telas usam nas consultas.
-- branch_id fica sem ligação: as filiais da GI não são unidades do sistema (a coluna fica vazia).
alter table public.gi_conc_arquivos
  add constraint gi_conc_arquivos_enviado_por_fkey foreign key (enviado_por) references public.profiles(id) on delete set null,
  add constraint gi_conc_arquivos_arquivado_por_fkey foreign key (arquivado_por) references public.profiles(id) on delete set null;
alter table public.gi_conc_conciliacoes
  add constraint gi_conc_conciliacoes_criado_por_fkey foreign key (criado_por) references public.profiles(id) on delete set null;
alter table public.gi_conc_regras
  add constraint gi_conc_regras_criado_por_fkey foreign key (criado_por) references public.profiles(id) on delete set null;
alter table public.gi_conc_itens
  add constraint gi_conc_itens_conciliacao_id_fkey foreign key (conciliacao_id) references public.gi_conc_conciliacoes(id) on delete cascade;
alter table public.gi_conc_pendencias
  add constraint gi_conc_pendencias_conciliacao_id_fkey foreign key (conciliacao_id) references public.gi_conc_conciliacoes(id) on delete set null,
  add constraint gi_conc_pendencias_regra_id_fkey foreign key (regra_id) references public.gi_conc_regras(id) on delete set null,
  add constraint gi_conc_pendencias_decidido_por_fkey foreign key (decidido_por) references public.profiles(id) on delete set null,
  add constraint gi_conc_pendencias_responsavel_fkey foreign key (responsavel) references public.profiles(id) on delete set null;
alter table public.gi_conc_enviados_omie
  add constraint gi_conc_enviados_omie_conciliacao_id_fkey foreign key (conciliacao_id) references public.gi_conc_conciliacoes(id) on delete set null,
  add constraint gi_conc_enviados_omie_arquivo_id_fkey foreign key (arquivo_id) references public.gi_conc_arquivos(id) on delete set null,
  add constraint gi_conc_enviados_omie_enviado_por_fkey foreign key (enviado_por) references public.profiles(id) on delete set null,
  add constraint gi_conc_enviados_omie_desfeito_por_fkey foreign key (desfeito_por) references public.profiles(id) on delete set null;
alter table public.gi_conc_config
  add constraint gi_conc_config_atualizado_por_fkey foreign key (atualizado_por) references public.profiles(id) on delete set null;
alter table public.gi_conc_agentes
  add constraint gi_conc_agentes_criado_por_fkey foreign key (criado_por) references public.profiles(id) on delete set null;

create trigger t_gi_conc_depara_upd before update on public.gi_conc_depara for each row execute function public.set_updated_at();
create trigger t_gi_conc_regras_upd before update on public.gi_conc_regras for each row execute function public.set_updated_at();

-- 2) Filiais da GI (o "cadastro de unidades" só desta conciliação).
create table public.gi_conc_filiais (
  codigo            integer primary key check (codigo between 1 and 9999),  -- código da filial no Trier da GI
  nome              text not null check (length(btrim(nome)) between 2 and 80),
  cnpj              text check (cnpj is null or cnpj ~ '^\d{14}$'),
  departamento_omie text check (departamento_omie is null or length(departamento_omie) <= 120),
  ativo             boolean not null default true,
  atualizado_em     timestamptz not null default now(),
  atualizado_por    uuid constraint gi_conc_filiais_atualizado_por_fkey references public.profiles(id) on delete set null
);
create unique index gi_conc_filiais_cnpj_uk on public.gi_conc_filiais (cnpj) where cnpj is not null;
create index gi_conc_filiais_atualizado_por_idx on public.gi_conc_filiais (atualizado_por);

-- 3) Acesso: as mesmas regras das conc_* (copiadas uma a uma) e as filiais no mesmo padrão.
do $$
declare
  p record;
begin
  for p in select * from pg_policies where schemaname = 'public' and tablename like 'conc\_%' and tablename <> 'conc_boletos_vistos' loop
    execute format(
      'create policy %I on public.%I as permissive for %s to %s%s%s',
      'gi_' || p.policyname,
      'gi_' || p.tablename,
      p.cmd,
      array_to_string(p.roles, ', '),
      case when p.qual is not null then ' using (' || p.qual || ')' else '' end,
      case when p.with_check is not null then ' with check (' || p.with_check || ')' else '' end
    );
  end loop;
end $$;

alter table public.gi_conc_arquivos      enable row level security;
alter table public.gi_conc_conciliacoes  enable row level security;
alter table public.gi_conc_regras        enable row level security;
alter table public.gi_conc_itens         enable row level security;
alter table public.gi_conc_pendencias    enable row level security;
alter table public.gi_conc_depara        enable row level security;
alter table public.gi_conc_aprendizado   enable row level security;
alter table public.gi_conc_enviados_omie enable row level security;
alter table public.gi_conc_config        enable row level security;
alter table public.gi_conc_agentes       enable row level security;
alter table public.gi_conc_filiais       enable row level security;

create policy gi_cfil_sel on public.gi_conc_filiais for select to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));
create policy gi_cfil_ins on public.gi_conc_filiais for insert to authenticated
  with check ((select private.sou_admin()) or (select private.tem_papel('financeiro')));
create policy gi_cfil_upd on public.gi_conc_filiais for update to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro')))
  with check ((select private.sou_admin()) or (select private.tem_papel('financeiro')));
create policy gi_cfil_del on public.gi_conc_filiais for delete to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro')));

-- 4) Configuração inicial (sem de-para: a GI começa do zero e aprende sozinha).
insert into public.gi_conc_config (chave, valor) values
  ('omie', '{"categoria": "Boletos Pagos Fornecedores", "conta": ""}'::jsonb),
  ('faixas', '[]'::jsonb);

-- 5) Histórico de boletos por fornecedor (ficha, anomalias) e uso das regras: as mesmas funções das conc_*.
create view public.gi_conc_boletos_vistos with (security_invoker = true) as
select distinct on (i.chave)
       i.chave,
       i.conciliacao_id,
       c.criado_em,
       regexp_replace(coalesce(i.cnpj, ''), '\D', '', 'g') as cnpj_num,
       left(regexp_replace(coalesce(i.cnpj, ''), '\D', '', 'g'), 8) as raiz,
       left(i.barra, 3) as banco,
       i.beneficiario,
       i.fornecedor,
       i.fornecedor_real,
       i.valor,
       i.vencimento,
       i.filial,
       i.grupo,
       i.categoria,
       coalesce((i.dados ->> 'fora_padrao')::boolean, false) as fora_padrao,
       i.dados -> 'anomalias' as anomalias
  from public.gi_conc_itens i
  join public.gi_conc_conciliacoes c on c.id = i.conciliacao_id
 where i.barra is not null and length(regexp_replace(coalesce(i.cnpj, ''), '\D', '', 'g')) = 14
 order by i.chave, c.criado_em desc;

create function public.gi_conc_fornecedor_historico(p_raizes text[])
returns table (raiz text, n bigint, cnpjs text[], bancos text[], valores jsonb)
language sql stable
set search_path = public
as $$
  select b.raiz,
         count(*)                               as n,
         array_agg(distinct b.cnpj_num)         as cnpjs,
         array_agg(distinct b.banco)            as bancos,
         coalesce((select jsonb_agg(jsonb_build_array(v.chave, v.valor))
                     from (select x.chave, x.valor
                             from public.gi_conc_boletos_vistos x
                            where x.raiz = b.raiz and not x.fora_padrao
                            order by x.vencimento desc nulls last
                            limit 400) v), '[]'::jsonb) as valores
    from public.gi_conc_boletos_vistos b
   where b.raiz = any (p_raizes)
   group by b.raiz
$$;

create function public.gi_conc_fornecedores_lista(p_q text default null, p_limite integer default 200)
returns table (raiz text, nome text, qtd bigint, total numeric, cnpjs bigint, bancos bigint, exatos bigint, divergencias bigint, fora_padrao bigint, primeiro timestamptz, ultimo timestamptz, ultimo_venc date)
language sql stable
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
    from public.gi_conc_boletos_vistos b, q
   where q.txt is null
      or b.beneficiario ilike '%' || q.txt || '%'
      or b.fornecedor   ilike '%' || q.txt || '%'
      or b.fornecedor_real ilike '%' || q.txt || '%'
      or (q.num is not null and b.cnpj_num like '%' || q.num || '%')
   group by b.raiz
   order by max(b.criado_em) desc
   limit greatest(1, least(coalesce(p_limite, 200), 1000))
$$;

create function public.gi_conc_fornecedor_ficha(p_raiz text)
returns table (raiz text, nome text, cnpjs text[], bancos text[], fornecedores text[], boletos bigint, total numeric, exatos bigint, divergencias bigint, fora_padrao bigint, minimo numeric, p10 numeric, mediana numeric, p90 numeric, maximo numeric, ultimo_venc date, primeiro timestamptz, ultimo timestamptz)
language sql stable
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
    from public.gi_conc_boletos_vistos b
   where b.raiz = p_raiz
  having count(*) > 0
$$;

create function public.gi_conc_regras_registrar_uso(p_ids uuid[], p_qtds integer[])
returns void
language sql
set search_path = public
as $$
  update public.gi_conc_regras r
     set vezes = r.vezes + u.qtd, ultima_vez = now()
    from unnest(p_ids, p_qtds) as u(id, qtd)
   where r.id = u.id and u.qtd > 0;
$$;

revoke all on function public.gi_conc_fornecedor_historico(text[]) from public, anon;
revoke all on function public.gi_conc_fornecedores_lista(text, integer) from public, anon;
revoke all on function public.gi_conc_fornecedor_ficha(text) from public, anon;
revoke all on function public.gi_conc_regras_registrar_uso(uuid[], integer[]) from public, anon;
grant execute on function public.gi_conc_fornecedor_historico(text[]) to authenticated, service_role;
grant execute on function public.gi_conc_fornecedores_lista(text, integer) to authenticated, service_role;
grant execute on function public.gi_conc_fornecedor_ficha(text) to authenticated, service_role;
grant execute on function public.gi_conc_regras_registrar_uso(uuid[], integer[]) to authenticated, service_role;
