-- 0014 — Módulo de TI: inventário de ativos (equipamentos) por unidade.
-- Tipo é texto (lista mantida na aplicação em src/lib/ti/rotulos.ts) para crescer sem migração.
create type it_asset_status as enum ('em_uso', 'estoque', 'manutencao', 'baixado');

create table public.it_assets (
  id                      uuid primary key default gen_random_uuid(),
  branch_id               uuid not null references public.branches(id) on delete restrict,
  tipo                    text not null,
  descricao               text not null,                 -- marca/modelo
  patrimonio              text,                          -- etiqueta/código interno
  numero_serie            text,
  status                  it_asset_status not null default 'em_uso',
  responsavel_employee_id uuid references public.employees(id) on delete set null,
  data_aquisicao          date,
  valor                   numeric(14,2),                 -- valor de referência/compra (TEF: mensal)
  fornecedor              text,
  observacoes             text,
  ativo                   boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index it_assets_branch_idx on public.it_assets (branch_id);
create index it_assets_tipo_idx on public.it_assets (tipo);
create unique index it_assets_patrimonio_idx on public.it_assets (patrimonio) where patrimonio is not null;
create trigger t_it_assets_upd before update on public.it_assets for each row execute function public.set_updated_at();

alter table public.it_assets enable row level security;
-- Leitura: corporativos veem tudo; gerente/usuário veem a própria unidade (mesma regra das filiais).
create policy ita_sel on public.it_assets for select to authenticated
  using (private.pode_ver_filial(branch_id));
-- Escrita: administrador e TI.
create policy ita_wr on public.it_assets for all to authenticated
  using (private.sou_admin() or private.tem_papel('ti'))
  with check (private.sou_admin() or private.tem_papel('ti'));
