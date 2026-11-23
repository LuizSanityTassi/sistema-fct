-- Comprovantes de venda (Operação → Comprovantes de venda): a loja cadastra a venda a prazo (convênio ou crediário)
-- com o comprovante assinado pelo cliente; o financeiro pesquisa por rede, filial, período e tipo e baixa o anexo.
-- Substitui o "Pesquisar Comprovante" do sistema da Zanini. Só cria coisas novas.

create table if not exists public.venda_comprovantes (
  id                  uuid primary key default gen_random_uuid(),
  branch_id           uuid not null references public.branches (id),
  tipo                text not null check (tipo in ('convenio', 'crediario')),
  empresa             text check (char_length(empresa) <= 160),          -- empresa do convênio
  cliente             text not null check (char_length(cliente) between 2 and 160),
  valor               numeric(12, 2) not null check (valor > 0 and valor < 1000000),
  parcelas            smallint not null default 1 check (parcelas between 1 and 24),
  data_compra         date not null,
  numero_venda        text check (char_length(numero_venda) <= 40),      -- nº do cupom/venda no Trier
  observacao          text check (char_length(observacao) <= 1000),
  situacao            text not null default 'ativo' check (situacao in ('ativo', 'cancelado')),
  criada_por          uuid references public.profiles (id) on delete set null,
  criada_por_nome     text,
  criada_em           timestamptz not null default now(),
  cancelada_por       uuid references public.profiles (id) on delete set null,
  cancelada_por_nome  text,
  cancelada_em        timestamptz,
  motivo_cancelamento text check (char_length(motivo_cancelamento) <= 500),
  constraint venda_comprovante_empresa check (tipo <> 'convenio' or coalesce(trim(empresa), '') <> '')
);
create index if not exists venda_comprovantes_loja_idx on public.venda_comprovantes (branch_id, data_compra desc);
create index if not exists venda_comprovantes_data_idx on public.venda_comprovantes (data_compra desc, criada_em desc);
-- a mesma venda (loja + nº do cupom) não entra duas vezes
create unique index if not exists venda_comprovantes_venda_uk on public.venda_comprovantes (branch_id, numero_venda)
  where situacao <> 'cancelado' and numero_venda is not null;

-- quem cadastra: administrador, financeiro ou gerente/líder/colaborador que enxerga a loja (a mesma regra das sangrias)
create or replace function private.pode_cadastrar_comprovante(b uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select private.sou_admin() or private.tem_papel('financeiro')
      or (private.tem_papel('gerente', 'usuario') and private.pode_ver_filial(b));
$$;

-- quem vê: administrador, financeiro, contador e quem é da loja (gerente, líder, colaborador, coordenador da regional)
create or replace function private.pode_ver_comprovante(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select exists (
    select 1 from public.venda_comprovantes c
     where c.id = p_id
       and (private.sou_admin() or private.tem_papel('financeiro', 'contador')
            or (private.tem_papel('gerente', 'usuario', 'coordenador') and private.pode_ver_filial(c.branch_id)))
  );
$$;

-- quem anexa: enquanto não foi cancelado, quem cadastrou, a loja e o financeiro
create or replace function private.pode_anexar_comprovante(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select exists (
    select 1 from public.venda_comprovantes c
     where c.id = p_id and c.situacao = 'ativo'
       and (c.criada_por = auth.uid() or private.pode_cadastrar_comprovante(c.branch_id))
  );
$$;
revoke all on function private.pode_cadastrar_comprovante(uuid) from public, anon;
revoke all on function private.pode_ver_comprovante(uuid) from public, anon;
revoke all on function private.pode_anexar_comprovante(uuid) from public, anon;
grant execute on function private.pode_cadastrar_comprovante(uuid) to authenticated;
grant execute on function private.pode_ver_comprovante(uuid) to authenticated;
grant execute on function private.pode_anexar_comprovante(uuid) to authenticated;

-- carimbos: ninguém forja quem cadastrou ou cancelou; o cadastrado não muda (para corrigir: cancelar e cadastrar de novo)
create or replace function private.comprovante_carimbar()
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
    new.empresa := nullif(trim(new.empresa), '');
    new.cliente := trim(new.cliente);
    new.numero_venda := nullif(trim(new.numero_venda), '');
    new.situacao := 'ativo';
    new.criada_por := auth.uid();
    new.criada_por_nome := v_nome;
    new.criada_em := now();
    new.cancelada_por := null; new.cancelada_por_nome := null; new.cancelada_em := null; new.motivo_cancelamento := null;
    return new;
  end if;

  new.branch_id := old.branch_id; new.tipo := old.tipo; new.empresa := old.empresa; new.cliente := old.cliente;
  new.valor := old.valor; new.parcelas := old.parcelas; new.data_compra := old.data_compra;
  new.numero_venda := old.numero_venda; new.observacao := old.observacao;
  new.criada_por := old.criada_por; new.criada_por_nome := old.criada_por_nome; new.criada_em := old.criada_em;

  if new.situacao is distinct from old.situacao then
    if old.situacao = 'cancelado' then raise exception 'Comprovante cancelado não volta: cadastre de novo.'; end if;
    if not (v_fin or old.criada_por = auth.uid()) then
      raise exception 'Só quem cadastrou ou o financeiro cancela.';
    end if;
    if coalesce(trim(new.motivo_cancelamento), '') = '' then raise exception 'Informe o motivo do cancelamento.'; end if;
    new.cancelada_por := auth.uid(); new.cancelada_por_nome := v_nome; new.cancelada_em := now();
  else
    new.cancelada_por := old.cancelada_por; new.cancelada_por_nome := old.cancelada_por_nome; new.cancelada_em := old.cancelada_em;
    new.motivo_cancelamento := old.motivo_cancelamento;
  end if;
  return new;
end;
$$;
drop trigger if exists comprovante_carimbar on public.venda_comprovantes;
create trigger comprovante_carimbar before insert or update on public.venda_comprovantes
  for each row execute function private.comprovante_carimbar();

alter table public.venda_comprovantes enable row level security;
create policy vcp_sel on public.venda_comprovantes for select to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador'))
         or ((select private.tem_papel('gerente', 'usuario', 'coordenador'))
             and branch_id = any ((select private.filiais_visiveis())::uuid[])));
create policy vcp_ins on public.venda_comprovantes for insert to authenticated
  with check (private.pode_cadastrar_comprovante(branch_id));
create policy vcp_upd on public.venda_comprovantes for update to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro'))
         or (criada_por = (select auth.uid()) and situacao = 'ativo'))
  with check ((select private.sou_admin()) or (select private.tem_papel('financeiro')) or criada_por = (select auth.uid()));

-- lojas em que a pessoa pode cadastrar, com a rede (empresa do grupo)
create or replace function public.lojas_para_comprovante()
returns table (id uuid, codigo text, nome text, rede text)
language sql
stable
security definer
set search_path = public, private
as $$
  select b.id, b.codigo, b.nome, o.nome_fantasia
    from public.branches b
    left join public.organizations o on o.id = b.organization_id
   where b.ativo and private.pode_cadastrar_comprovante(b.id)
   order by b.codigo;
$$;
revoke all on function public.lojas_para_comprovante() from public, anon;
grant execute on function public.lojas_para_comprovante() to authenticated;

-- anexos: bucket "documentos", pasta comprovantes/<id>/<arquivo>
create table if not exists public.venda_comprovante_anexos (
  id               uuid primary key default gen_random_uuid(),
  comprovante_id   uuid not null references public.venda_comprovantes (id) on delete cascade,
  nome             text not null check (char_length(nome) between 1 and 160),
  storage_path     text not null unique,
  mime             text,
  tamanho          integer check (tamanho is null or tamanho between 0 and 20971520),
  enviado_por      uuid references public.profiles (id) on delete set null default auth.uid(),
  enviado_por_nome text,
  criado_em        timestamptz not null default now(),
  constraint venda_comprovante_anexos_pasta check (storage_path like 'comprovantes/' || comprovante_id::text || '/%')
);
create index if not exists venda_comprovante_anexos_idx on public.venda_comprovante_anexos (comprovante_id, criado_em);
alter table public.venda_comprovante_anexos enable row level security;
create policy vcpa_sel on public.venda_comprovante_anexos for select to authenticated
  using (private.pode_ver_comprovante(comprovante_id));
create policy vcpa_ins on public.venda_comprovante_anexos for insert to authenticated
  with check (private.pode_anexar_comprovante(comprovante_id) and enviado_por = (select auth.uid()));
create policy vcpa_del on public.venda_comprovante_anexos for delete to authenticated
  using (private.pode_anexar_comprovante(comprovante_id));

create or replace function private.comprovante_da_pasta(p_nome text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_nome, '/', 1) = 'comprovantes'
     and split_part(p_nome, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_nome, '/', 2)::uuid
  end;
$$;
revoke all on function private.comprovante_da_pasta(text) from public, anon;
grant execute on function private.comprovante_da_pasta(text) to authenticated;

drop policy if exists comprovante_anexo_select on storage.objects;
create policy comprovante_anexo_select on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and private.pode_ver_comprovante(private.comprovante_da_pasta(name)));
drop policy if exists comprovante_anexo_insert on storage.objects;
create policy comprovante_anexo_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and private.pode_anexar_comprovante(private.comprovante_da_pasta(name)));
drop policy if exists comprovante_anexo_delete on storage.objects;
create policy comprovante_anexo_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and private.pode_anexar_comprovante(private.comprovante_da_pasta(name)));
