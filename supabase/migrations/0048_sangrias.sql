-- Sangrias (Operação → Sangrias): o dinheiro que sai do caixa da loja e é depositado no banco, com o comprovante.
-- A loja cadastra (gerente ou colaborador da loja); o financeiro confere com o extrato; quem cadastrou pode
-- cancelar enquanto não foi conferida. O banco de destino é uma conta da Carteira (fin_contas_bancarias).
-- Só cria coisas novas.

create table if not exists public.caixa_sangrias (
  id                  uuid primary key default gen_random_uuid(),
  branch_id           uuid not null references public.branches (id),
  conta_id            uuid not null references public.fin_contas_bancarias (id),
  conta_apelido       text not null,                  -- copiado da Carteira (a loja não lê a Carteira)
  data_retirada       date not null,
  data_deposito       date not null,
  numero_deposito     text check (char_length(numero_deposito) <= 40),
  valor               numeric(12, 2) not null check (valor > 0 and valor < 10000000),
  observacao          text check (char_length(observacao) <= 1000),
  situacao            text not null default 'pendente' check (situacao in ('pendente', 'conferida', 'cancelada')),
  criada_por          uuid references public.profiles (id) on delete set null,
  criada_por_nome     text,
  criada_em           timestamptz not null default now(),
  conferida_por       uuid references public.profiles (id) on delete set null,
  conferida_por_nome  text,
  conferida_em        timestamptz,
  conferencia_obs     text check (char_length(conferencia_obs) <= 500),
  cancelada_por       uuid references public.profiles (id) on delete set null,
  cancelada_por_nome  text,
  cancelada_em        timestamptz,
  motivo_cancelamento text check (char_length(motivo_cancelamento) <= 500),
  constraint sangria_datas check (data_deposito >= data_retirada)
);
create index if not exists caixa_sangrias_loja_idx on public.caixa_sangrias (branch_id, data_deposito desc);
create index if not exists caixa_sangrias_situacao_idx on public.caixa_sangrias (situacao, data_deposito desc);
-- o mesmo comprovante (conta + nº do depósito) não entra duas vezes
create unique index if not exists caixa_sangrias_deposito_uk on public.caixa_sangrias (conta_id, numero_deposito)
  where situacao <> 'cancelada' and numero_deposito is not null;

-- quem cadastra: administrador, financeiro ou gerente/colaborador que enxerga a loja
create or replace function private.pode_cadastrar_sangria(b uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select private.sou_admin() or private.tem_papel('financeiro')
      or (private.tem_papel('gerente', 'usuario') and private.pode_ver_filial(b));
$$;

-- quem vê: administrador, financeiro, contador e quem é da loja (gerente, colaborador, coordenador da regional)
create or replace function private.pode_ver_sangria(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select exists (
    select 1 from public.caixa_sangrias s
     where s.id = p_id
       and (private.sou_admin() or private.tem_papel('financeiro', 'contador')
            or (private.tem_papel('gerente', 'usuario', 'coordenador') and private.pode_ver_filial(s.branch_id)))
  );
$$;

-- quem anexa comprovante: enquanto a sangria está a conferir, quem cadastrou, a loja e o financeiro
create or replace function private.pode_anexar_sangria(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select exists (
    select 1 from public.caixa_sangrias s
     where s.id = p_id and s.situacao = 'pendente'
       and (s.criada_por = auth.uid() or private.pode_cadastrar_sangria(s.branch_id))
  );
$$;
revoke all on function private.pode_cadastrar_sangria(uuid) from public, anon;
revoke all on function private.pode_ver_sangria(uuid) from public, anon;
revoke all on function private.pode_anexar_sangria(uuid) from public, anon;
grant execute on function private.pode_cadastrar_sangria(uuid) to authenticated;
grant execute on function private.pode_ver_sangria(uuid) to authenticated;
grant execute on function private.pode_anexar_sangria(uuid) to authenticated;

-- carimbos e regras da situação (ninguém forja quem cadastrou, conferiu ou cancelou)
create or replace function private.sangria_carimbar()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_nome text := (select coalesce(nullif(trim(nome), ''), email) from public.profiles where id = auth.uid());
  v_fin boolean := private.sou_admin() or private.tem_papel('financeiro');
begin
  if tg_op = 'INSERT' then
    new.conta_apelido := (select apelido from public.fin_contas_bancarias where id = new.conta_id and ativa);
    if new.conta_apelido is null then raise exception 'Escolha uma conta ativa da carteira.'; end if;
    new.situacao := 'pendente';
    new.criada_por := auth.uid();
    new.criada_por_nome := v_nome;
    new.criada_em := now();
    new.conferida_por := null; new.conferida_por_nome := null; new.conferida_em := null; new.conferencia_obs := null;
    new.cancelada_por := null; new.cancelada_por_nome := null; new.cancelada_em := null; new.motivo_cancelamento := null;
    return new;
  end if;

  -- o que foi cadastrado não muda (para corrigir: cancelar e cadastrar de novo)
  new.branch_id := old.branch_id; new.conta_id := old.conta_id; new.conta_apelido := old.conta_apelido;
  new.data_retirada := old.data_retirada; new.data_deposito := old.data_deposito; new.numero_deposito := old.numero_deposito;
  new.valor := old.valor; new.observacao := old.observacao;
  new.criada_por := old.criada_por; new.criada_por_nome := old.criada_por_nome; new.criada_em := old.criada_em;

  if new.situacao is distinct from old.situacao then
    if old.situacao = 'cancelada' then raise exception 'Sangria cancelada não volta: cadastre de novo.'; end if;
    if new.situacao = 'cancelada' then
      if not (v_fin or (old.situacao = 'pendente' and old.criada_por = auth.uid())) then
        raise exception 'Só quem cadastrou (antes da conferência) ou o financeiro cancela.';
      end if;
      if coalesce(trim(new.motivo_cancelamento), '') = '' then raise exception 'Informe o motivo do cancelamento.'; end if;
      new.cancelada_por := auth.uid(); new.cancelada_por_nome := v_nome; new.cancelada_em := now();
    elsif not v_fin then
      raise exception 'Só o financeiro confere sangrias.';
    elsif new.situacao = 'conferida' then
      new.conferida_por := auth.uid(); new.conferida_por_nome := v_nome; new.conferida_em := now();
    else -- desfazer a conferência
      new.conferida_por := null; new.conferida_por_nome := null; new.conferida_em := null; new.conferencia_obs := null;
    end if;
  else
    -- sem troca de situação, os carimbos ficam como estão
    new.conferida_por := old.conferida_por; new.conferida_por_nome := old.conferida_por_nome; new.conferida_em := old.conferida_em;
    new.cancelada_por := old.cancelada_por; new.cancelada_por_nome := old.cancelada_por_nome; new.cancelada_em := old.cancelada_em;
    new.motivo_cancelamento := old.motivo_cancelamento;
    if not v_fin then new.conferencia_obs := old.conferencia_obs; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists sangria_carimbar on public.caixa_sangrias;
create trigger sangria_carimbar before insert or update on public.caixa_sangrias
  for each row execute function private.sangria_carimbar();

alter table public.caixa_sangrias enable row level security;
create policy csg_sel on public.caixa_sangrias for select to authenticated
  using (private.sou_admin() or private.tem_papel('financeiro', 'contador')
         or (private.tem_papel('gerente', 'usuario', 'coordenador') and private.pode_ver_filial(branch_id)));
create policy csg_ins on public.caixa_sangrias for insert to authenticated with check (private.pode_cadastrar_sangria(branch_id));
create policy csg_upd on public.caixa_sangrias for update to authenticated
  using (private.sou_admin() or private.tem_papel('financeiro') or (criada_por = auth.uid() and situacao = 'pendente'))
  with check (private.sou_admin() or private.tem_papel('financeiro') or criada_por = auth.uid());

-- contas que a loja pode escolher (só o apelido e o banco; agência e conta ficam com o financeiro)
create or replace function public.contas_para_deposito()
returns table (id uuid, apelido text, banco text, tipo text)
language sql
stable
security definer
set search_path = public, private
as $$
  select c.id, c.apelido, c.banco, c.tipo
    from public.fin_contas_bancarias c
   where c.ativa
     and (private.sou_admin() or private.tem_papel('financeiro', 'contador', 'gerente', 'usuario', 'coordenador'))
   order by c.apelido;
$$;
revoke all on function public.contas_para_deposito() from public, anon;
grant execute on function public.contas_para_deposito() to authenticated;

-- comprovantes: bucket "documentos", pasta sangrias/<id>/<arquivo>
create table if not exists public.sangria_anexos (
  id               uuid primary key default gen_random_uuid(),
  sangria_id       uuid not null references public.caixa_sangrias (id) on delete cascade,
  nome             text not null check (char_length(nome) between 1 and 160),
  storage_path     text not null unique,
  mime             text,
  tamanho          integer check (tamanho is null or tamanho between 0 and 20971520),
  enviado_por      uuid references public.profiles (id) on delete set null default auth.uid(),
  enviado_por_nome text,
  criado_em        timestamptz not null default now(),
  constraint sangria_anexos_pasta check (storage_path like 'sangrias/' || sangria_id::text || '/%')
);
create index if not exists sangria_anexos_idx on public.sangria_anexos (sangria_id, criado_em);
alter table public.sangria_anexos enable row level security;
create policy sanx_sel on public.sangria_anexos for select to authenticated using (private.pode_ver_sangria(sangria_id));
create policy sanx_ins on public.sangria_anexos for insert to authenticated with check (private.pode_anexar_sangria(sangria_id) and enviado_por = auth.uid());
create policy sanx_del on public.sangria_anexos for delete to authenticated using (private.pode_anexar_sangria(sangria_id));

create or replace function private.sangria_da_pasta(p_nome text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_nome, '/', 1) = 'sangrias'
     and split_part(p_nome, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_nome, '/', 2)::uuid
  end;
$$;
revoke all on function private.sangria_da_pasta(text) from public, anon;
grant execute on function private.sangria_da_pasta(text) to authenticated;

drop policy if exists sangria_anexo_select on storage.objects;
create policy sangria_anexo_select on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and private.pode_ver_sangria(private.sangria_da_pasta(name)));
drop policy if exists sangria_anexo_insert on storage.objects;
create policy sangria_anexo_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and private.pode_anexar_sangria(private.sangria_da_pasta(name)));
drop policy if exists sangria_anexo_delete on storage.objects;
create policy sangria_anexo_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and private.pode_anexar_sangria(private.sangria_da_pasta(name)));
