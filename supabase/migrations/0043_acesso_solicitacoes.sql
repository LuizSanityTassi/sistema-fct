-- Pedido de acesso a uma tela: quem abre uma tela que o perfil não libera pode pedir ao administrador.
-- Só cria coisas novas: nenhum dado existente é alterado.

create table if not exists public.acesso_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  solicitante uuid not null references public.profiles (id) on delete cascade,
  solicitante_nome text not null,
  papel_atual text not null,
  rota text not null check (rota ~ '^/[a-z0-9/_-]{0,120}$'),
  tela text not null check (char_length(tela) <= 120),
  motivo text check (char_length(motivo) <= 1000),
  status text not null default 'pendente' check (status in ('pendente', 'atendida', 'recusada')),
  resposta text check (char_length(resposta) <= 1000),
  respondida_por uuid references public.profiles (id) on delete set null,
  respondida_por_nome text,
  respondida_em timestamptz,
  criada_em timestamptz not null default now()
);

-- um pedido em aberto por pessoa e tela (pedir de novo enquanto espera não duplica)
create unique index if not exists acesso_sol_pendente_uk on public.acesso_solicitacoes (solicitante, rota) where status = 'pendente';
create index if not exists acesso_sol_status_idx on public.acesso_solicitacoes (status, criada_em desc);

-- quem pede, nome, papel e datas vêm do banco (não dá para pedir em nome de outro nem forjar a resposta)
create or replace function private.acesso_sol_preencher()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
declare p public.profiles;
begin
  if tg_op = 'INSERT' then
    select * into p from public.profiles where id = auth.uid();
    if p.id is null then raise exception 'Usuário não encontrado.'; end if;
    new.solicitante := p.id;
    new.solicitante_nome := coalesce(nullif(trim(p.nome), ''), p.email, 'Usuário');
    new.papel_atual := p.papel::text;
    new.status := 'pendente';
    new.resposta := null;
    new.respondida_por := null;
    new.respondida_por_nome := null;
    new.respondida_em := null;
    new.criada_em := now();
    new.motivo := nullif(left(trim(coalesce(new.motivo, '')), 1000), '');
  else
    -- o administrador só muda a situação e a resposta; o resto do pedido fica como foi feito
    new.solicitante := old.solicitante;
    new.solicitante_nome := old.solicitante_nome;
    new.papel_atual := old.papel_atual;
    new.rota := old.rota;
    new.tela := old.tela;
    new.motivo := old.motivo;
    new.criada_em := old.criada_em;
    if new.status is distinct from old.status then
      new.respondida_por := auth.uid();
      new.respondida_por_nome := (select nullif(trim(nome), '') from public.profiles where id = auth.uid());
      new.respondida_em := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists acesso_sol_preencher on public.acesso_solicitacoes;
create trigger acesso_sol_preencher before insert or update on public.acesso_solicitacoes
  for each row execute function private.acesso_sol_preencher();

alter table public.acesso_solicitacoes enable row level security;
-- cada um vê os próprios pedidos; o administrador vê todos
create policy asol_sel on public.acesso_solicitacoes for select to authenticated using (solicitante = auth.uid() or private.sou_admin());
-- qualquer usuário ativo pede (o gatilho garante que é em nome dele)
create policy asol_ins on public.acesso_solicitacoes for insert to authenticated
  with check (solicitante = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and ativo));
-- só o administrador responde
create policy asol_upd on public.acesso_solicitacoes for update to authenticated using (private.sou_admin()) with check (private.sou_admin());
