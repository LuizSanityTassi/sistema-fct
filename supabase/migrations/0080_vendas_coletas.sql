-- Vendas: o que o robô trouxe do Trier, relatório por relatório (todas as filiais, um período).
-- Guarda o Excel como veio (arquivo_b64) para reler quando o leitor mudar; os números vão para as tabelas de vendas
-- depois de lidos. Só o administrador vê; o robô diário grava com a service role.

create table public.vendas_coletas (
  id uuid primary key default gen_random_uuid(),
  relatorio text not null check (relatorio in ('filiais', 'grupos', 'laboratorios', 'vendedores', 'tele_entrega')),
  de date not null,
  ate date not null,
  coletado_em timestamptz not null default now(),
  status text not null check (status in ('ok', 'vazio', 'erro')),
  erro text,
  ms integer,
  tamanho integer,
  arquivo_b64 text,
  lido_em timestamptz,
  linhas integer,
  criado_por uuid references public.profiles (id) on delete set null,
  constraint vendas_coletas_periodo check (ate >= de)
);

comment on table public.vendas_coletas is 'Relatórios de vendas trazidos do Trier pelo robô (Excel original + situação da leitura).';
comment on column public.vendas_coletas.arquivo_b64 is 'Excel do Trier em base64, como veio; pode ser apagado depois de lido.';

create index vendas_coletas_periodo_idx on public.vendas_coletas (relatorio, de, ate, coletado_em desc);
create index vendas_coletas_quando_idx on public.vendas_coletas (coletado_em desc);
create index vendas_coletas_criado_por_idx on public.vendas_coletas (criado_por);

alter table public.vendas_coletas enable row level security;

create policy vcol_sel on public.vendas_coletas for select to authenticated using ((select private.sou_admin()));
create policy vcol_ins on public.vendas_coletas for insert to authenticated with check ((select private.sou_admin()));
create policy vcol_upd on public.vendas_coletas for update to authenticated using ((select private.sou_admin())) with check ((select private.sou_admin()));
create policy vcol_del on public.vendas_coletas for delete to authenticated using ((select private.sou_admin()));
