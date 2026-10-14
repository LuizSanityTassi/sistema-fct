-- 0020 — Financeiro F3/F4/F5: molde da DRE, ajustes manuais do contador, saldos de caixa, orçamento,
-- fluxo mensal/diário (inputs da diretoria) e inadimplência. Equivalentes das tabelas do fluxo de caixa anterior
-- (contabil_override, saldos_dre, orcamento, fluxo_mensal, fluxo_diario, inadimplencia).
-- "grupo" = recorte da diretoria: TODOS, VARELA, ITAJAÍ, NAZÁRIO ou BLUMENAU (texto; igual ao usado nas telas).

create table public.fin_dre_estrutura (
  familia        text not null,
  grupo          text not null,
  ordem_familia  integer not null,
  ordem_grupo    integer not null,
  sinal          smallint not null default -1,
  primary key (familia, grupo)
);

create table public.fin_dre_ajustes (
  id             uuid primary key default gen_random_uuid(),
  grupo          text not null default 'TODOS',
  branch_id      uuid references public.branches(id) on delete cascade,
  categoria_id   uuid not null references public.fin_categorias(id) on delete cascade,
  competencia    char(7) not null,
  valor          numeric(14,2) not null,
  atualizado_por uuid references public.profiles(id) on delete set null,
  atualizado_em  timestamptz not null default now(),
  chave          text generated always as (grupo || '|' || coalesce(branch_id::text, '') || '|' || categoria_id::text || '|' || competencia) stored unique
);

create table public.fin_dre_saldos (
  id             uuid primary key default gen_random_uuid(),
  grupo          text not null default 'TODOS',
  branch_id      uuid references public.branches(id) on delete cascade,
  competencia    char(7) not null,
  campo          text not null,                       -- saldo_inicial, caixinha, contas_correntes, limites_bancos
  valor          numeric(14,2) not null,
  atualizado_por uuid references public.profiles(id) on delete set null,
  atualizado_em  timestamptz not null default now(),
  chave          text generated always as (grupo || '|' || coalesce(branch_id::text, '') || '|' || competencia || '|' || campo) stored unique
);

create table public.fin_orcamentos (
  id                   uuid primary key default gen_random_uuid(),
  grupo                text not null default 'TODOS',
  categoria_id         uuid not null references public.fin_categorias(id) on delete cascade,
  competencia          char(7) not null,
  valor                numeric(14,2),                 -- orçado
  realizado_informado  numeric(14,2),                 -- quando a diretoria digita o realizado em vez de usar o calculado
  atualizado_por       uuid references public.profiles(id) on delete set null,
  atualizado_em        timestamptz not null default now(),
  unique (grupo, categoria_id, competencia)
);

create table public.fin_fluxo_mensal (
  id             uuid primary key default gen_random_uuid(),
  grupo          text not null,
  competencia    char(7) not null,
  linha          text not null,                       -- Faturamento, Recebimento, famílias de despesa…
  provisao       numeric(14,2),
  realizado      numeric(14,2),
  atualizado_por uuid references public.profiles(id) on delete set null,
  atualizado_em  timestamptz not null default now(),
  unique (grupo, competencia, linha)
);

create table public.fin_fluxo_diario (
  id             uuid primary key default gen_random_uuid(),
  grupo          text not null,
  data           date not null,
  campo          text not null,                       -- saldo_itau, saldo_sicredi, receber_cartao, agenda…
  valor          numeric(14,2),
  texto          text,
  atualizado_por uuid references public.profiles(id) on delete set null,
  atualizado_em  timestamptz not null default now(),
  unique (grupo, data, campo)
);

create table public.fin_inadimplencia (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null check (tipo in ('crediario', 'convenio')),
  ano            integer not null check (ano between 2000 and 2100),
  mes            integer not null check (mes between 1 and 12),
  atrasado       numeric(14,2),
  recebido       numeric(14,2),
  atualizado_por uuid references public.profiles(id) on delete set null,
  atualizado_em  timestamptz not null default now(),
  unique (tipo, ano, mes)
);

alter table public.fin_dre_estrutura  enable row level security;
alter table public.fin_dre_ajustes    enable row level security;
alter table public.fin_dre_saldos     enable row level security;
alter table public.fin_orcamentos     enable row level security;
alter table public.fin_fluxo_mensal   enable row level security;
alter table public.fin_fluxo_diario   enable row level security;
alter table public.fin_inadimplencia  enable row level security;

-- leitura: quem vê o financeiro; escrita: admin/financeiro/contador nas contábeis, admin/financeiro no resto
create policy fdre_sel on public.fin_dre_estrutura for select to authenticated using (true);
create policy fdre_wr  on public.fin_dre_estrutura for all to authenticated using (private.sou_admin() or private.tem_papel('financeiro', 'contador')) with check (private.sou_admin() or private.tem_papel('financeiro', 'contador'));

create policy faj_sel on public.fin_dre_ajustes for select to authenticated using (private.sou_admin() or private.tem_papel('financeiro', 'contador', 'gerente'));
create policy faj_wr  on public.fin_dre_ajustes for all to authenticated using (private.sou_admin() or private.tem_papel('financeiro', 'contador')) with check (private.sou_admin() or private.tem_papel('financeiro', 'contador'));

create policy fsal_sel on public.fin_dre_saldos for select to authenticated using (private.sou_admin() or private.tem_papel('financeiro', 'contador', 'gerente'));
create policy fsal_wr  on public.fin_dre_saldos for all to authenticated using (private.sou_admin() or private.tem_papel('financeiro', 'contador')) with check (private.sou_admin() or private.tem_papel('financeiro', 'contador'));

create policy forc_sel on public.fin_orcamentos for select to authenticated using (private.sou_admin() or private.tem_papel('financeiro', 'contador', 'gerente'));
create policy forc_wr  on public.fin_orcamentos for all to authenticated using (private.sou_admin() or private.tem_papel('financeiro')) with check (private.sou_admin() or private.tem_papel('financeiro'));

create policy ffm_sel on public.fin_fluxo_mensal for select to authenticated using (private.sou_admin() or private.tem_papel('financeiro', 'contador', 'gerente'));
create policy ffm_wr  on public.fin_fluxo_mensal for all to authenticated using (private.sou_admin() or private.tem_papel('financeiro')) with check (private.sou_admin() or private.tem_papel('financeiro'));

create policy ffd_sel on public.fin_fluxo_diario for select to authenticated using (private.sou_admin() or private.tem_papel('financeiro', 'contador', 'gerente'));
create policy ffd_wr  on public.fin_fluxo_diario for all to authenticated using (private.sou_admin() or private.tem_papel('financeiro')) with check (private.sou_admin() or private.tem_papel('financeiro'));

create policy fina_sel on public.fin_inadimplencia for select to authenticated using (private.sou_admin() or private.tem_papel('financeiro', 'contador', 'gerente'));
create policy fina_wr  on public.fin_inadimplencia for all to authenticated using (private.sou_admin() or private.tem_papel('financeiro')) with check (private.sou_admin() or private.tem_papel('financeiro'));
