-- Avisos no sino de cada pessoa. O primeiro uso é o fim do envio ao Omie: "Envio de 6 contas ao Omie: enviado com sucesso, sem erros".
-- Cada pessoa só vê, cria e marca como lido o que é dela. Depois de lido, o aviso sai do sino, mas continua guardado.
create table if not exists public.avisos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  tipo text not null check (tipo in ('envio_omie')),
  severidade text not null default 'info' check (severidade in ('critico', 'alto', 'atencao', 'info')),
  titulo text not null check (char_length(titulo) between 1 and 300),
  detalhe text check (char_length(detalhe) <= 8000),
  href text check (href is null or (href like '/%' and href not like '//%')),
  lida_em timestamptz,
  created_at timestamptz not null default now()
);

-- o sino lê só o que ainda não foi lido, a cada troca de tela
create index if not exists avisos_nao_lidos_idx on public.avisos (user_id, created_at desc) where lida_em is null;

alter table public.avisos enable row level security;

revoke all on public.avisos from public, anon, authenticated;
grant select, insert on public.avisos to authenticated;
-- de um aviso já criado, só dá para mudar quando foi lido: o texto não muda
grant update (lida_em) on public.avisos to authenticated;

drop policy if exists avisos_sel on public.avisos;
create policy avisos_sel on public.avisos for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists avisos_ins on public.avisos;
create policy avisos_ins on public.avisos for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists avisos_upd on public.avisos;
create policy avisos_upd on public.avisos for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
