-- 0026 — Canal de denúncias anônimas.
-- Qualquer usuário do sistema envia; só quem o administrador liberar (denuncia_responsaveis) lê e responde.
-- ANONIMATO: a denúncia não guarda quem enviou. O envio é gravado pelo servidor com a chave de serviço, então nem o
-- registro de requisições do banco liga a denúncia a um usuário. Guarda-se só o DIA (sem hora) para não cruzar com
-- horários de acesso. Quem denuncia recebe protocolo + chave (só o hash da chave fica no banco) para acompanhar e
-- conversar com o comitê sem se identificar.
-- ADITIVA: só cria tabelas novas.

create table public.denuncia_responsaveis (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  liberado_por uuid references public.profiles(id) on delete set null default auth.uid(),
  liberado_em  timestamptz not null default now()
);

-- quem tem o acesso liberado (e está ativo) lê e responde as denúncias
create or replace function private.responde_denuncias()
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select exists (
    select 1 from public.denuncia_responsaveis r
    join public.profiles p on p.id = r.user_id
    where r.user_id = auth.uid() and p.ativo
  );
$$;
grant execute on function private.responde_denuncias() to authenticated;

create table public.denuncias (
  id            uuid primary key default gen_random_uuid(),
  seq           bigint generated always as identity,
  protocolo     text not null unique,
  chave_hash    text not null,
  categoria     text not null check (categoria in ('assedio_moral', 'assedio_sexual', 'discriminacao', 'fraude', 'conduta', 'seguranca', 'normas', 'outros')),
  descricao     text not null check (char_length(descricao) between 20 and 10000),
  local_texto   text check (char_length(local_texto) <= 200),
  quando        text check (char_length(quando) <= 120),
  envolvidos    text check (char_length(envolvidos) <= 1000),
  identificacao text check (char_length(identificacao) <= 300),   -- só se a pessoa quiser se identificar
  status        text not null default 'recebida' check (status in ('recebida', 'em_analise', 'concluida', 'arquivada')),
  recebida_em   date not null default ((now() at time zone 'America/Sao_Paulo')::date)
);
create index denuncias_status_idx on public.denuncias (status, seq desc);

create table public.denuncia_mensagens (
  id               uuid primary key default gen_random_uuid(),
  seq              bigint generated always as identity,
  denuncia_id      uuid not null references public.denuncias(id) on delete cascade,
  autor            text not null check (autor in ('denunciante', 'responsavel')),
  responsavel_id   uuid references public.profiles(id) on delete set null,
  responsavel_nome text,
  interna          boolean not null default false,             -- anotação do comitê que o denunciante não vê
  texto            text not null check (char_length(texto) between 1 and 5000),
  criada_em        date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  check (autor = 'responsavel' or (responsavel_id is null and responsavel_nome is null and not interna))
);
create index denuncia_mensagens_den_idx on public.denuncia_mensagens (denuncia_id, seq);

alter table public.denuncia_responsaveis enable row level security;
alter table public.denuncias             enable row level security;
alter table public.denuncia_mensagens    enable row level security;

-- ninguém de fora do sistema
revoke all on public.denuncia_responsaveis, public.denuncias, public.denuncia_mensagens from anon;

-- denúncias: o comitê lê e só muda a situação; ninguém insere ou apaga pela API (o envio é pelo servidor)
revoke insert, update, delete on public.denuncias from authenticated;
grant update (status) on public.denuncias to authenticated;
create policy den_sel on public.denuncias for select to authenticated using (private.responde_denuncias());
create policy den_upd on public.denuncias for update to authenticated using (private.responde_denuncias()) with check (private.responde_denuncias());

-- mensagens: o comitê lê e escreve em nome próprio; as do denunciante entram pelo servidor
revoke update, delete on public.denuncia_mensagens from authenticated;
create policy denm_sel on public.denuncia_mensagens for select to authenticated using (private.responde_denuncias());
create policy denm_ins on public.denuncia_mensagens for insert to authenticated
  with check (private.responde_denuncias() and autor = 'responsavel' and responsavel_id = auth.uid());

-- quem tem acesso: o administrador libera e tira; o comitê vê quem mais faz parte
create policy denr_sel on public.denuncia_responsaveis for select to authenticated using (private.responde_denuncias() or private.sou_admin());
create policy denr_wr  on public.denuncia_responsaveis for all to authenticated using (private.sou_admin()) with check (private.sou_admin());
