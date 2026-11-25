-- CRM (índice de fidelização) do Bunker/Marka por loja e por vendedor, dia a dia. Vem do CSV "Exportar Vendedores" do
-- relatório "Índice de Fidelização por Vendedor (Adm)" do Bunker (o login do Bunker tem reCAPTCHA: por enquanto o arquivo
-- é enviado na tela Vendas → CRM). Uma linha por dia × unidade × vendedor; o mesmo dia enviado de novo substitui o dia.
-- O código do vendedor no Bunker (COD_EXTERNO) é o mesmo do Trier (vendas_vendedor_dia.vendedor_codigo).
-- Leitura igual às vendas: admin, financeiro, coordenador; gerente só das filiais dele. Envio: admin e financeiro.

create table if not exists public.crm_importacoes (
  id              uuid primary key default gen_random_uuid(),
  arquivo         text not null check (char_length(arquivo) <= 300),
  dias            date[] not null default '{}',
  linhas          integer not null default 0,
  resumo          jsonb not null default '{}'::jsonb,
  criado_por      uuid references public.profiles (id) on delete set null default auth.uid(),
  criado_por_nome text,
  criado_em       timestamptz not null default now()
);

create table if not exists public.crm_fidelizacao_dia (
  data                 date not null,
  cod_univend          integer not null,                                        -- unidade no Bunker
  vendedor_bunker      integer not null,                                        -- COD_VENDEDOR (id do Bunker)
  filial_codigo        text not null check (char_length(filial_codigo) <= 20),  -- "FCT F001" → F001
  branch_id            uuid references public.branches (id),
  vendedor_codigo      text check (char_length(vendedor_codigo) <= 30),         -- COD_EXTERNO = código no Trier
  vendedor_nome        text check (char_length(vendedor_nome) <= 200),
  qtd_vendas           integer not null default 0,
  qtd_avulsas          integer not null default 0,
  qtd_fidelizadas      integer not null default 0,
  valor_vendas         numeric(14, 2) not null default 0,
  valor_fidelizado     numeric(14, 2) not null default 0,
  qtd_funcionario      integer not null default 0,   -- vendas para cliente cadastrado como funcionário
  valor_funcionario    numeric(14, 2) not null default 0,
  qtd_inativo          integer not null default 0,   -- vendas para cliente desativado no Bunker
  valor_inativo        numeric(14, 2) not null default 0,
  valor_vinculado      numeric(14, 2) not null default 0,
  valor_resgate        numeric(14, 2) not null default 0,
  valor_credito_gerado numeric(14, 2) not null default 0,
  importacao_id        uuid references public.crm_importacoes (id) on delete set null,
  primary key (data, cod_univend, vendedor_bunker)
);
create index if not exists crm_fidelizacao_dia_branch_idx on public.crm_fidelizacao_dia (branch_id, data);
create index if not exists crm_fidelizacao_dia_vendedor_idx on public.crm_fidelizacao_dia (vendedor_codigo, data);
create index if not exists crm_fidelizacao_dia_importacao_idx on public.crm_fidelizacao_dia (importacao_id);

alter table public.crm_importacoes enable row level security;
alter table public.crm_fidelizacao_dia enable row level security;

drop policy if exists crm_imp_sel on public.crm_importacoes;
create policy crm_imp_sel on public.crm_importacoes for select to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro')));
drop policy if exists crm_imp_ins on public.crm_importacoes;
create policy crm_imp_ins on public.crm_importacoes for insert to authenticated
  with check ((select private.sou_admin()) or (select private.tem_papel('financeiro')));
drop policy if exists crm_imp_upd on public.crm_importacoes;
create policy crm_imp_upd on public.crm_importacoes for update to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro')))
  with check ((select private.sou_admin()) or (select private.tem_papel('financeiro')));
drop policy if exists crm_imp_del on public.crm_importacoes;
create policy crm_imp_del on public.crm_importacoes for delete to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro')));

drop policy if exists crm_dia_sel on public.crm_fidelizacao_dia;
create policy crm_dia_sel on public.crm_fidelizacao_dia for select to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'coordenador'))
         or ((select private.tem_papel('gerente')) and branch_id = any ((select private.filiais_visiveis())::uuid[])));
drop policy if exists crm_dia_ins on public.crm_fidelizacao_dia;
create policy crm_dia_ins on public.crm_fidelizacao_dia for insert to authenticated
  with check ((select private.sou_admin()) or (select private.tem_papel('financeiro')));
drop policy if exists crm_dia_upd on public.crm_fidelizacao_dia;
create policy crm_dia_upd on public.crm_fidelizacao_dia for update to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro')))
  with check ((select private.sou_admin()) or (select private.tem_papel('financeiro')));
drop policy if exists crm_dia_del on public.crm_fidelizacao_dia;
create policy crm_dia_del on public.crm_fidelizacao_dia for delete to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro')));

grant select, insert, update, delete on public.crm_importacoes, public.crm_fidelizacao_dia to authenticated;

-- soma do período por loja e vendedor (a regra de leitura da tabela vale: security invoker)
create or replace function public.crm_fidelizacao_resumo(p_de date, p_ate date)
returns table (
  filial_codigo text, branch_id uuid, vendedor_codigo text, vendedor_nome text, dias bigint,
  qtd_vendas bigint, qtd_avulsas bigint, qtd_fidelizadas bigint, valor_vendas numeric, valor_fidelizado numeric,
  qtd_funcionario bigint, qtd_inativo bigint, valor_resgate numeric, valor_credito_gerado numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select c.filial_codigo, max(c.branch_id::text)::uuid, c.vendedor_codigo,
         (array_agg(c.vendedor_nome order by c.data desc))[1],
         count(distinct c.data),
         sum(c.qtd_vendas), sum(c.qtd_avulsas), sum(c.qtd_fidelizadas), sum(c.valor_vendas), sum(c.valor_fidelizado),
         sum(c.qtd_funcionario), sum(c.qtd_inativo), sum(c.valor_resgate), sum(c.valor_credito_gerado)
    from public.crm_fidelizacao_dia c
   where c.data between p_de and p_ate
   group by c.filial_codigo, c.vendedor_codigo, case when c.vendedor_codigo is null then c.vendedor_bunker end
$$;
revoke all on function public.crm_fidelizacao_resumo(date, date) from public, anon;
grant execute on function public.crm_fidelizacao_resumo(date, date) to authenticated;

-- Importação de um arquivo inteiro numa transação só: guarda o que havia nos dias do arquivo (no resumo), apaga esses dias
-- e grava as linhas novas. Se algo falhar, nada muda. Quem pode: admin e financeiro (a regra das tabelas confere de novo).
create or replace function public.crm_importar(p_arquivo text, p_dias date[], p_linhas jsonb, p_nome text, p_resumo jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_id uuid;
  v_antes jsonb;
begin
  if not ((select private.sou_admin()) or (select private.tem_papel('financeiro'))) then
    raise exception 'Sem permissão para importar o CRM.';
  end if;
  if coalesce(array_length(p_dias, 1), 0) = 0 or jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'Arquivo sem linhas.';
  end if;
  select coalesce(jsonb_object_agg(x.d, jsonb_build_object('linhas', x.n, 'vendas', x.v, 'fidelizadas', x.f)), '{}'::jsonb)
    into v_antes
    from (select data::text as d, count(*) as n, sum(qtd_vendas) as v, sum(qtd_fidelizadas) as f
            from public.crm_fidelizacao_dia where data = any (p_dias) group by data) x;
  insert into public.crm_importacoes (arquivo, dias, linhas, resumo, criado_por_nome)
  values (left(p_arquivo, 300), p_dias, jsonb_array_length(p_linhas), coalesce(p_resumo, '{}'::jsonb) || jsonb_build_object('substituiu', v_antes), p_nome)
  returning id into v_id;
  delete from public.crm_fidelizacao_dia where data = any (p_dias);
  insert into public.crm_fidelizacao_dia (
    data, cod_univend, vendedor_bunker, filial_codigo, branch_id, vendedor_codigo, vendedor_nome,
    qtd_vendas, qtd_avulsas, qtd_fidelizadas, valor_vendas, valor_fidelizado, qtd_funcionario, valor_funcionario,
    qtd_inativo, valor_inativo, valor_vinculado, valor_resgate, valor_credito_gerado, importacao_id)
  select r.data, r.cod_univend, r.vendedor_bunker, r.filial_codigo, b.id, nullif(r.vendedor_codigo, ''), nullif(r.vendedor_nome, ''),
         r.qtd_vendas, r.qtd_avulsas, r.qtd_fidelizadas, r.valor_vendas, r.valor_fidelizado, r.qtd_funcionario, r.valor_funcionario,
         r.qtd_inativo, r.valor_inativo, r.valor_vinculado, r.valor_resgate, r.valor_credito_gerado, v_id
    from jsonb_to_recordset(p_linhas) as r(
           data date, cod_univend integer, vendedor_bunker integer, filial_codigo text, vendedor_codigo text, vendedor_nome text,
           qtd_vendas integer, qtd_avulsas integer, qtd_fidelizadas integer, valor_vendas numeric, valor_fidelizado numeric,
           qtd_funcionario integer, valor_funcionario numeric, qtd_inativo integer, valor_inativo numeric, valor_vinculado numeric,
           valor_resgate numeric, valor_credito_gerado numeric)
    left join public.branches b on upper(b.codigo) = upper(r.filial_codigo)
   where r.data = any (p_dias);
  return v_id;
end;
$fn$;
revoke all on function public.crm_importar(text, date[], jsonb, text, jsonb) from public, anon;
grant execute on function public.crm_importar(text, date[], jsonb, text, jsonb) to authenticated;

-- dias do período que já têm CRM (para avisar o que falta enviar)
create or replace function public.crm_dias(p_de date, p_ate date)
returns setof date
language sql
stable
security invoker
set search_path = public
as $$
  select distinct c.data from public.crm_fidelizacao_dia c where c.data between p_de and p_ate order by 1
$$;
revoke all on function public.crm_dias(date, date) from public, anon;
grant execute on function public.crm_dias(date, date) to authenticated;
