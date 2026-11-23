-- 0161 — Chamados nos grupos de WhatsApp de cada setor (pedido do Luiz, 23/11/2026; sem custo, RH e DP no mesmo grupo).
-- Um programa no computador do escritório ("agente WhatsApp", Desktop\agente-whatsapp) conecta um número pelo QR code e,
-- de tempos em tempos, pergunta ao portal o que mandar (/api/whatsapp/agente, com a chave do agente). Chamado aberto →
-- entra na fila do grupo do setor dele (categoria). O agente informa os grupos em que o número está; o administrador liga
-- cada setor a um grupo em Chamados → WhatsApp dos setores.

create table if not exists public.wpp_destinos (
  categoria public.ticket_category primary key,
  grupo_jid text,
  grupo_nome text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.profiles (id) on delete set null
);

create table if not exists public.wpp_grupos (
  jid text primary key check (jid ~ '@g\.us$'),
  nome text not null,
  atualizado_em timestamptz not null default now()
);

-- um agente só (linha única): chave (só o hash) e como ele está
create table if not exists public.wpp_agente (
  id smallint primary key default 1 check (id = 1),
  token_hash text,
  criado_por uuid references public.profiles (id) on delete set null,
  criado_em timestamptz,
  numero text,
  conectado boolean not null default false,
  situacao text,
  ultimo_contato timestamptz
);

create table if not exists public.wpp_fila (
  id bigint generated always as identity primary key,
  ticket_id uuid references public.tickets (id) on delete set null,
  categoria public.ticket_category,
  grupo_jid text not null,
  mensagem text,                       -- vazio = o portal monta na hora (chamado novo); preenchido = teste
  criado_em timestamptz not null default now(),
  enviado_em timestamptz,
  tentativas integer not null default 0,
  erro text
);
create index if not exists wpp_fila_pendente_idx on public.wpp_fila (criado_em) where enviado_em is null;

alter table public.wpp_destinos enable row level security;
alter table public.wpp_grupos enable row level security;
alter table public.wpp_agente enable row level security;
alter table public.wpp_fila enable row level security;

drop policy if exists wppd_sel on public.wpp_destinos;
drop policy if exists wppd_ins on public.wpp_destinos;
drop policy if exists wppd_upd on public.wpp_destinos;
drop policy if exists wppd_del on public.wpp_destinos;
create policy wppd_sel on public.wpp_destinos for select to authenticated using ((select private.sou_admin()));
create policy wppd_ins on public.wpp_destinos for insert to authenticated with check ((select private.sou_admin()));
create policy wppd_upd on public.wpp_destinos for update to authenticated using ((select private.sou_admin())) with check ((select private.sou_admin()));
create policy wppd_del on public.wpp_destinos for delete to authenticated using ((select private.sou_admin()));

drop policy if exists wppg_sel on public.wpp_grupos;
create policy wppg_sel on public.wpp_grupos for select to authenticated using ((select private.sou_admin()));
drop policy if exists wppa_sel on public.wpp_agente;
create policy wppa_sel on public.wpp_agente for select to authenticated using ((select private.sou_admin()));
drop policy if exists wppf_sel on public.wpp_fila;
drop policy if exists wppf_ins on public.wpp_fila;
create policy wppf_sel on public.wpp_fila for select to authenticated using ((select private.sou_admin()));
-- teste mandado pela tela (só administrador, só mensagem pronta)
create policy wppf_ins on public.wpp_fila for insert to authenticated with check ((select private.sou_admin()) and mensagem is not null and enviado_em is null);
revoke update, delete on public.wpp_fila from anon, authenticated;
revoke insert, update, delete on public.wpp_grupos, public.wpp_agente from anon, authenticated;

-- Chamado aberto: entra na fila do grupo do setor (se o setor tem grupo ligado e ativo).
create or replace function private.wpp_enfileirar_chamado()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
declare
  d public.wpp_destinos;
begin
  select * into d from public.wpp_destinos where categoria = new.categoria and ativo and grupo_jid is not null;
  if d.categoria is null then return null; end if;
  insert into public.wpp_fila (ticket_id, categoria, grupo_jid) values (new.id, new.categoria, d.grupo_jid);
  return null;
exception when others then
  -- o aviso no WhatsApp nunca impede abrir o chamado
  return null;
end
$$;

drop trigger if exists t_tickets_whatsapp on public.tickets;
create trigger t_tickets_whatsapp after insert on public.tickets for each row execute function private.wpp_enfileirar_chamado();
