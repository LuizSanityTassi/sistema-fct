-- Carteira: as contas bancárias, caixas e cofres da empresa (Financeiro → Carteira). Pedido de 19/10/2026.
-- Só cria coisas novas. Os dados das contas entram pela tela (ou carga inicial no banco), não ficam no código.

create table if not exists public.fin_contas_bancarias (
  id uuid primary key default gen_random_uuid(),
  apelido text not null check (char_length(trim(apelido)) between 2 and 60),
  banco text check (banco ~ '^\d{3}$'),                 -- código do banco (341 Itaú, 237 Bradesco…)
  agencia text check (char_length(agencia) <= 20),
  conta text check (char_length(conta) <= 30),
  tipo text not null default 'corrente' check (tipo in ('corrente', 'aplicacao', 'caixa', 'cofre')),
  grupo text check (grupo in ('VARELA', 'ITAJAÍ', 'NAZÁRIO', 'BLUMENAU')),
  ativa boolean not null default true,
  observacao text check (char_length(observacao) <= 500),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.profiles (id) on delete set null
);

-- apelido não repete (sem diferenciar maiúscula/minúscula)
create unique index if not exists fin_contas_apelido_uk on public.fin_contas_bancarias (lower(trim(apelido)));

create or replace function private.fin_contas_carimbo()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  if tg_op = 'UPDATE' then new.criado_em := old.criado_em; end if;
  return new;
end;
$$;
drop trigger if exists fin_contas_carimbo on public.fin_contas_bancarias;
create trigger fin_contas_carimbo before insert or update on public.fin_contas_bancarias
  for each row execute function private.fin_contas_carimbo();

alter table public.fin_contas_bancarias enable row level security;
-- veem: administrador, financeiro e contador; cadastram e alteram: administrador e financeiro
create policy fcb_sel on public.fin_contas_bancarias for select to authenticated using (private.sou_admin() or private.tem_papel('financeiro', 'contador'));
create policy fcb_ins on public.fin_contas_bancarias for insert to authenticated with check (private.sou_admin() or private.tem_papel('financeiro'));
create policy fcb_upd on public.fin_contas_bancarias for update to authenticated using (private.sou_admin() or private.tem_papel('financeiro')) with check (private.sou_admin() or private.tem_papel('financeiro'));
