-- Vendas: os números lidos dos relatórios do Trier (vendas_coletas), por filial.
--   vendas_filial_dia ......... Rel_0056 (atendimentos, itens, unidades, bruto, desconto, venda líquida)
--   vendas_grupo_dia .......... Rel_0080 por grupo de produtos (quantidade, venda, custo → CMV, premium, genérico…)
--   vendas_laboratorio_dia .... Rel_0080 por laboratório, só os acompanhados (Fortvigor)
--   vendas_vendedor_dia ....... Rel_0028 por vendedor (atendimentos, venda, custo) + só tele-entrega
--   vendas_vendedor_grupo_mes . Rel_0028 por vendedor e grupo, mês até a data lida (base da premiação)
-- Quem vê: admin, financeiro e coordenador (todas as lojas); gerente só as lojas dele. Grava: o robô (service role)
-- e o administrador (busca na hora).

alter table public.vendas_coletas drop constraint vendas_coletas_relatorio_check;
alter table public.vendas_coletas add constraint vendas_coletas_relatorio_check check (relatorio in ('filiais', 'grupos', 'laboratorios', 'vendedores', 'atendimentos', 'tele_entrega'));

create table public.vendas_filial_dia (
  branch_id uuid not null references public.branches (id) on delete cascade,
  data date not null,
  atendimentos integer not null default 0,
  itens integer not null default 0,
  unidades numeric(14, 3) not null default 0,
  valor_bruto numeric(14, 2) not null default 0,
  desconto numeric(14, 2) not null default 0,
  venda numeric(14, 2) not null default 0,
  coleta_id uuid references public.vendas_coletas (id) on delete set null,
  atualizado_em timestamptz not null default now(),
  primary key (branch_id, data)
);

create table public.vendas_grupo_dia (
  branch_id uuid not null references public.branches (id) on delete cascade,
  data date not null,
  grupo_codigo integer not null,
  grupo_nome text not null,
  quantidade numeric(14, 3) not null default 0,
  venda numeric(14, 2) not null default 0,
  custo numeric(14, 2) not null default 0,
  coleta_id uuid references public.vendas_coletas (id) on delete set null,
  primary key (branch_id, data, grupo_codigo)
);

create table public.vendas_laboratorio_dia (
  branch_id uuid not null references public.branches (id) on delete cascade,
  data date not null,
  laboratorio_codigo integer not null,
  laboratorio_nome text not null,
  quantidade numeric(14, 3) not null default 0,
  venda numeric(14, 2) not null default 0,
  custo numeric(14, 2) not null default 0,
  coleta_id uuid references public.vendas_coletas (id) on delete set null,
  primary key (branch_id, data, laboratorio_codigo)
);

create table public.vendas_vendedor_dia (
  branch_id uuid not null references public.branches (id) on delete cascade,
  data date not null,
  vendedor_codigo integer not null,
  vendedor_nome text not null,
  atendimentos integer not null default 0,
  venda numeric(14, 2) not null default 0,
  custo numeric(14, 2) not null default 0,
  tele_atendimentos integer not null default 0,
  tele_venda numeric(14, 2) not null default 0,
  tele_custo numeric(14, 2) not null default 0,
  coleta_id uuid references public.vendas_coletas (id) on delete set null,
  primary key (branch_id, data, vendedor_codigo)
);

create table public.vendas_vendedor_grupo_mes (
  branch_id uuid not null references public.branches (id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  vendedor_codigo integer not null,
  vendedor_nome text not null,
  grupo_codigo integer not null,
  grupo_nome text not null,
  quantidade numeric(14, 3) not null default 0,
  desconto numeric(14, 2) not null default 0,
  custo numeric(14, 2) not null default 0,
  venda numeric(14, 2) not null default 0,
  lido_ate date not null,
  coleta_id uuid references public.vendas_coletas (id) on delete set null,
  primary key (branch_id, mes, vendedor_codigo, grupo_codigo)
);

comment on table public.vendas_filial_dia is 'Vendas do dia por filial (Trier Rel_0056, vendas menos devoluções). venda = valor líquido.';
comment on table public.vendas_grupo_dia is 'Vendas e custo do dia por filial e grupo de produtos (Trier Rel_0080, custo do cadastro do produto).';
comment on table public.vendas_laboratorio_dia is 'Vendas do dia por filial dos laboratórios acompanhados (Fortvigor), Trier Rel_0080.';
comment on table public.vendas_vendedor_dia is 'Vendas do dia por filial e vendedor (Trier Rel_0028); tele_* = só as vendas por tele-entrega.';
comment on table public.vendas_vendedor_grupo_mes is 'Vendas do mês (até lido_ate) por filial, vendedor e grupo de produtos (Trier Rel_0028).';

create index vendas_filial_dia_data_idx on public.vendas_filial_dia (data);
create index vendas_grupo_dia_data_idx on public.vendas_grupo_dia (data);
create index vendas_laboratorio_dia_data_idx on public.vendas_laboratorio_dia (data);
create index vendas_vendedor_dia_data_idx on public.vendas_vendedor_dia (data);
create index vendas_vendedor_grupo_mes_mes_idx on public.vendas_vendedor_grupo_mes (mes);
create index vendas_filial_dia_coleta_idx on public.vendas_filial_dia (coleta_id);
create index vendas_grupo_dia_coleta_idx on public.vendas_grupo_dia (coleta_id);
create index vendas_laboratorio_dia_coleta_idx on public.vendas_laboratorio_dia (coleta_id);
create index vendas_vendedor_dia_coleta_idx on public.vendas_vendedor_dia (coleta_id);
create index vendas_vendedor_grupo_mes_coleta_idx on public.vendas_vendedor_grupo_mes (coleta_id);

do $$
declare
  t text;
  p text;
begin
  foreach t in array array['vendas_filial_dia', 'vendas_grupo_dia', 'vendas_laboratorio_dia', 'vendas_vendedor_dia', 'vendas_vendedor_grupo_mes'] loop
    p := (select string_agg(substr(x, 1, 1), '') from unnest(string_to_array(replace(t, 'vendas_', 'v_'), '_')) x);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.sou_admin()) or (select private.tem_papel(''financeiro'', ''coordenador'')) or ((select private.tem_papel(''gerente'')) and private.pode_ver_filial(branch_id)))', p || '_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.sou_admin()))', p || '_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.sou_admin())) with check ((select private.sou_admin()))', p || '_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.sou_admin()))', p || '_del', t);
  end loop;
end $$;
