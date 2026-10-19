-- Aviso diário por e-mail para o gestor que tem quebra de caixa esperando justificativa.
-- Só cria coisas novas: nenhum dado existente é alterado.

-- 1) Leitura dos segredos das integrações pelas rotinas do servidor que rodam sem usuário logado (o envio
--    automático da manhã). Só a service_role executa; quem está logado continua usando integracao_ler_segredos,
--    que confere o papel. Mesma restrição de nome (só os segredos integ_*).
create or replace function public.integracao_ler_segredos_servico(p_nomes text[])
returns table (nome text, valor text)
language sql
stable
security definer
set search_path = public, vault
as $$
  select s.name, s.decrypted_secret
    from vault.decrypted_secrets s
   where s.name = any (p_nomes)
     and s.name like 'integ\_%'
$$;
revoke all on function public.integracao_ler_segredos_servico(text[]) from public, anon, authenticated;
grant execute on function public.integracao_ler_segredos_servico(text[]) to service_role;

-- 2) Configurações gerais do sistema (chave → valor). Primeira chave: caixa_avisos {ligado: bool}.
create table if not exists public.sistema_config (
  chave text primary key,
  valor jsonb not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.profiles (id) on delete set null
);
alter table public.sistema_config enable row level security;
create policy scfg_sel on public.sistema_config for select to authenticated using (private.sou_admin() or private.tem_papel('financeiro'));
create policy scfg_ins on public.sistema_config for insert to authenticated with check (private.sou_admin() or private.tem_papel('financeiro'));
create policy scfg_upd on public.sistema_config for update to authenticated using (private.sou_admin() or private.tem_papel('financeiro'))
  with check (private.sou_admin() or private.tem_papel('financeiro'));

-- 3) Registro de cada aviso enviado (evita mandar duas vezes no mesmo dia e mostra o histórico na tela).
--    Quem grava é o servidor (service_role); admin e financeiro leem.
create table if not exists public.caixa_avisos (
  id uuid primary key default gen_random_uuid(),
  dia date not null,
  profile_id uuid references public.profiles (id) on delete cascade,
  nome text not null,
  email text not null,
  quantidade integer not null,
  valor numeric(12, 2) not null,
  origem text not null check (origem in ('automatico', 'manual', 'teste')),
  enviado_em timestamptz not null default now(),
  erro text
);
create index if not exists caixa_avisos_dia_idx on public.caixa_avisos (dia, profile_id);
create index if not exists caixa_avisos_enviado_idx on public.caixa_avisos (enviado_em desc);
alter table public.caixa_avisos enable row level security;
create policy cav_sel on public.caixa_avisos for select to authenticated using (private.sou_admin() or private.tem_papel('financeiro'));
