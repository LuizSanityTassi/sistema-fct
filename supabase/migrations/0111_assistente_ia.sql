-- Assistente de IA: conversas de cada pessoa e o custo de cada chamada à API. A chave da API fica só no servidor; aqui
-- não há segredo nenhum. Cada pessoa vê só as próprias conversas; o gasto total do mês sai pela função ia_gastos.
create table public.ia_conversas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titulo text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index ia_conversas_usuario_idx on public.ia_conversas (user_id, atualizado_em desc);

-- conteudo = os blocos da mensagem como a API devolveu, em texto (JSON.stringify): a API exige o histórico sem edição,
-- e jsonb reordenaria as chaves.
create table public.ia_mensagens (
  conversa_id uuid not null references public.ia_conversas (id) on delete cascade,
  ordem integer not null,
  papel text not null check (papel in ('user', 'assistant')),
  conteudo text not null,
  criado_em timestamptz not null default now(),
  primary key (conversa_id, ordem)
);

create table public.ia_uso (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conversa_id uuid references public.ia_conversas (id) on delete set null,
  modelo text not null,
  entrada integer not null default 0,
  cache_leitura integer not null default 0,
  cache_escrita integer not null default 0,
  saida integer not null default 0,
  custo_usd numeric(10, 6) not null,
  criado_em timestamptz not null default now()
);
create index ia_uso_usuario_idx on public.ia_uso (user_id, criado_em desc);
create index ia_uso_criado_idx on public.ia_uso (criado_em);
create index ia_uso_conversa_idx on public.ia_uso (conversa_id);

alter table public.ia_conversas enable row level security;
alter table public.ia_mensagens enable row level security;
alter table public.ia_uso enable row level security;

create policy ia_conversas_sel on public.ia_conversas for select to authenticated using (user_id = (select auth.uid()));
create policy ia_conversas_ins on public.ia_conversas for insert to authenticated with check (user_id = (select auth.uid()));
create policy ia_conversas_upd on public.ia_conversas for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy ia_mensagens_sel on public.ia_mensagens for select to authenticated
  using (exists (select 1 from public.ia_conversas c where c.id = conversa_id and c.user_id = (select auth.uid())));
create policy ia_mensagens_ins on public.ia_mensagens for insert to authenticated
  with check (exists (select 1 from public.ia_conversas c where c.id = conversa_id and c.user_id = (select auth.uid())));

create policy ia_uso_sel on public.ia_uso for select to authenticated using (user_id = (select auth.uid()) or (select private.sou_admin()));
create policy ia_uso_ins on public.ia_uso for insert to authenticated with check (user_id = (select auth.uid()));

-- Quanto a pessoa gastou hoje e quanto todo mundo gastou no mês (horário de Brasília), para os limites de gasto.
create function public.ia_gastos()
returns table (hoje_usuario numeric, mes_total numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(sum(u.custo_usd) filter (
      where u.user_id = (select auth.uid())
        and (u.criado_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
    ), 0),
    coalesce(sum(u.custo_usd) filter (
      where date_trunc('month', u.criado_em at time zone 'America/Sao_Paulo') = date_trunc('month', now() at time zone 'America/Sao_Paulo')
    ), 0)
  from public.ia_uso u;
$$;
revoke all on function public.ia_gastos() from public, anon;
grant execute on function public.ia_gastos() to authenticated;
