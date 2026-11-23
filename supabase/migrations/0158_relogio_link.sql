-- 0158 — Link do relógio da filial (pedido do Luiz, 23/11/2026: "um link de abrir apenas o relógio da filial, não deixar
-- nenhum acesso ali, só a liberação do ponto").
-- O administrador gera um link por filial em Ponto → Relógio da filial. Aberto no computador da loja, entra direto com o
-- login do relógio da filial (papel "relogio": só a tela /relogio), sem digitar senha. Guarda-se só o hash do link.
-- Gerar outro link desliga o anterior (os computadores já abertos continuam). "Desativar" desliga o link e desconecta os
-- computadores do relógio daquela filial (as sessões caem em até 1 hora, quando o acesso vence).
create table if not exists public.relogio_links (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  token_hash text not null unique,
  criado_por uuid references public.profiles (id) on delete set null,
  criado_em timestamptz not null default now(),
  revogado_em timestamptz,
  revogado_por uuid references public.profiles (id) on delete set null,
  ultimo_uso timestamptz,
  usos integer not null default 0
);
create unique index if not exists relogio_links_um_ativo on public.relogio_links (branch_id) where revogado_em is null;

alter table public.relogio_links enable row level security;
drop policy if exists rlk_sel on public.relogio_links;
create policy rlk_sel on public.relogio_links for select to authenticated using ((select private.sou_admin()));
-- gravação só pelo servidor (chave de serviço), depois de conferir que é administrador
revoke insert, update, delete on public.relogio_links from anon, authenticated;

-- Desconecta os computadores que estão com o login do relógio da filial (apaga as sessões; o acesso vence em até 1 hora).
create or replace function public.relogio_desconectar(p_branch uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  n integer;
begin
  if not private.sou_admin() then raise exception 'Só administradores desconectam o relógio.' using errcode = '42501'; end if;
  delete from auth.sessions s
   using public.profiles p
   where s.user_id = p.id and p.papel = 'relogio' and p.branch_id = p_branch;
  get diagnostics n = row_count;
  return n;
end
$$;
revoke all on function public.relogio_desconectar(uuid) from public, anon;
grant execute on function public.relogio_desconectar(uuid) to authenticated;
