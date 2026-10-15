-- 0027 — Diagnóstico das integrações (Trier).
-- O robô entra no Trier com o usuário da tela de Integrações, procura no menu os relatórios de caixa
-- ("Conferência de Movimentos de Caixa", "Fechamento de Caixa") e anota o nome da tela e os campos de cada um,
-- para montar a busca automática da diferença de caixa. Nunca guarda usuário nem senha.
-- Só o administrador roda, lê e apaga. ADITIVA: só cria uma tabela nova.

create table public.integracao_diagnosticos (
  id         uuid primary key default gen_random_uuid(),
  sistema    text not null check (sistema in ('trier')),
  resumo     jsonb not null default '{}'::jsonb,
  dados      jsonb not null default '{}'::jsonb,
  criado_por uuid references public.profiles(id) on delete set null default auth.uid(),
  criado_em  timestamptz not null default now()
);
create index integracao_diag_sistema_idx on public.integracao_diagnosticos (sistema, criado_em desc);

alter table public.integracao_diagnosticos enable row level security;
revoke all on public.integracao_diagnosticos from anon;

create policy idiag_sel on public.integracao_diagnosticos for select to authenticated using (private.sou_admin());
create policy idiag_ins on public.integracao_diagnosticos for insert to authenticated with check (private.sou_admin());
create policy idiag_del on public.integracao_diagnosticos for delete to authenticated using (private.sou_admin());
