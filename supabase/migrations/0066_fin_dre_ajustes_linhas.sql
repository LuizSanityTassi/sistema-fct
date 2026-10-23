-- Caixa contábil: valor digitado numa linha de total (família, ex.: TOTAL RECEITAS, ou grupo, ex.: Despesas com
-- Pessoal) num mês. Vale no lugar da soma das categorias de baixo; o resto (saídas, resultado, acumulado) continua
-- somando. Mesmo recorte de fin_dre_ajustes: grupo (TODOS, VARELA, …) e, na filial, branch_id.
-- linha = 'F|<família>' ou 'G|<família>|<grupo>'.

create table public.fin_dre_ajustes_linhas (
  id             uuid primary key default gen_random_uuid(),
  grupo          text not null default 'TODOS',
  branch_id      uuid references public.branches(id) on delete cascade,
  linha          text not null check (linha ~ '^(F|G)\|' and length(linha) <= 300),
  competencia    char(7) not null,
  valor          numeric(14,2) not null,
  atualizado_por uuid references public.profiles(id) on delete set null,
  atualizado_em  timestamptz not null default now(),
  chave          text generated always as (grupo || '|' || coalesce(branch_id::text, '') || '|' || linha || '|' || competencia) stored unique
);
create index fin_dre_ajustes_linhas_branch_idx on public.fin_dre_ajustes_linhas (branch_id);
create index fin_dre_ajustes_linhas_atualizado_por_idx on public.fin_dre_ajustes_linhas (atualizado_por);

alter table public.fin_dre_ajustes_linhas enable row level security;
-- mesmas regras de fin_dre_ajustes
create policy fajl_sel on public.fin_dre_ajustes_linhas for select to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador', 'gerente', 'coordenador')));
create policy fajl_ins on public.fin_dre_ajustes_linhas for insert to authenticated
  with check ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));
create policy fajl_upd on public.fin_dre_ajustes_linhas for update to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')))
  with check ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));
create policy fajl_del on public.fin_dre_ajustes_linhas for delete to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));
