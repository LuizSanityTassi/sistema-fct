-- 10/11/2026 (pedido do comercial): quanto cada filial vendeu no tele. Sai do Trier em Relatórios > Vendas > Outros >
-- Relação de Vendas (Rel_0027), só vendas tele-entrega, desconsiderando o tipo de cartão 30 e os vendedores da central
-- de televendas (56562, 56698, 56843, 2582, 60385, 56345, 56828), que já contam à parte. Um número por filial e dia.

alter table public.vendas_coletas drop constraint if exists vendas_coletas_relatorio_check;
alter table public.vendas_coletas add constraint vendas_coletas_relatorio_check
  check (relatorio in ('filiais', 'grupos', 'laboratorios', 'vendedores', 'atendimentos', 'tele_entrega', 'ecommerce', 'receita', 'tele_filial'));

create table if not exists public.vendas_tele_filial_dia (
  branch_id uuid not null references public.branches (id) on delete cascade,
  data date not null,
  atendimentos integer not null default 0,
  venda numeric(14, 2) not null default 0,
  coleta_id uuid references public.vendas_coletas (id) on delete set null,
  atualizado_em timestamptz not null default now(),
  primary key (branch_id, data)
);
comment on table public.vendas_tele_filial_dia is 'Tele-entrega do dia por filial (Trier Rel_0027 Relação de Vendas, vendas tele-entrega, sem o tipo de cartão 30 e sem os vendedores da central de televendas). venda = líquido.';
create index if not exists vendas_tele_filial_dia_data_idx on public.vendas_tele_filial_dia (data);
create index if not exists vendas_tele_filial_dia_coleta_idx on public.vendas_tele_filial_dia (coleta_id);

alter table public.vendas_tele_filial_dia enable row level security;
revoke all on public.vendas_tele_filial_dia from anon;
grant select, insert, update, delete on public.vendas_tele_filial_dia to authenticated;
drop policy if exists vtf_sel on public.vendas_tele_filial_dia;
drop policy if exists vtf_ins on public.vendas_tele_filial_dia;
drop policy if exists vtf_upd on public.vendas_tele_filial_dia;
drop policy if exists vtf_del on public.vendas_tele_filial_dia;
-- mesmas regras das outras tabelas de vendas: admin, financeiro e coordenador veem todas; gerente só as lojas dele
create policy vtf_sel on public.vendas_tele_filial_dia for select to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'coordenador'))
         or ((select private.tem_papel('gerente')) and branch_id = any ((select private.filiais_visiveis())::uuid[])));
create policy vtf_ins on public.vendas_tele_filial_dia for insert to authenticated with check ((select private.sou_admin()));
create policy vtf_upd on public.vendas_tele_filial_dia for update to authenticated using ((select private.sou_admin())) with check ((select private.sou_admin()));
create policy vtf_del on public.vendas_tele_filial_dia for delete to authenticated using ((select private.sou_admin()));
