-- 0037 — Anexos da justificativa de quebra de caixa (foto do comprovante, cupom, conferência…).
-- Arquivo no bucket privado "documentos", em caixa/<id da quebra>/<uuid>-<nome>. O navegador envia direto para o
-- Storage (a Vercel limita 4,5 MB por requisição ao servidor); o servidor só registra a linha em caixa_anexos.
-- Quem anexa: quem pode justificar (gestor da quebra; sem gestor, o gerente da loja) e o financeiro, enquanto a
-- quebra não foi decidida. Quem vê: quem vê a quebra (gestor, colaborador do caixa, financeiro).
-- ADITIVA: uma tabela, três funções e três políticas no Storage.

create table if not exists public.caixa_anexos (
  id                uuid primary key default gen_random_uuid(),
  diferenca_id      uuid not null references public.caixa_diferencas(id) on delete cascade,
  nome              text not null check (char_length(nome) between 1 and 160),
  storage_path      text not null unique,
  mime              text,
  tamanho           integer check (tamanho is null or tamanho between 0 and 20971520),
  enviado_por       uuid references public.profiles(id) on delete set null default auth.uid(),
  enviado_por_nome  text,
  criado_em         timestamptz not null default now(),
  -- o arquivo precisa estar na pasta da própria quebra
  constraint caixa_anexos_pasta check (storage_path like 'caixa/' || diferenca_id::text || '/%')
);
create index if not exists caixa_anexos_diferenca_idx on public.caixa_anexos (diferenca_id, criado_em);

-- vê o anexo quem vê a quebra
create or replace function private.pode_ver_anexo_caixa(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select exists (
    select 1 from public.caixa_diferencas d
     where d.id = p_id
       and (private.sou_admin() or private.tem_papel('financeiro')
            or (d.classe = 'quebra' and private.pode_ver_quebra(d.employee_id, d.gestor_id, d.branch_id)))
  );
$$;

-- anexa (e remove) quem pode justificar, enquanto o financeiro não decidiu
create or replace function private.pode_anexar_caixa(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select exists (
    select 1 from public.caixa_diferencas d
     where d.id = p_id and d.classe = 'quebra' and d.andamento in ('pendente', 'justificada')
       and (private.sou_admin() or private.tem_papel('financeiro') or private.pode_justificar_quebra(d.gestor_id, d.branch_id))
  );
$$;
revoke all on function private.pode_ver_anexo_caixa(uuid) from public, anon;
revoke all on function private.pode_anexar_caixa(uuid) from public, anon;
grant execute on function private.pode_ver_anexo_caixa(uuid) to authenticated;
grant execute on function private.pode_anexar_caixa(uuid) to authenticated;

alter table public.caixa_anexos enable row level security;
drop policy if exists canx_sel on public.caixa_anexos;
create policy canx_sel on public.caixa_anexos for select to authenticated using (private.pode_ver_anexo_caixa(diferenca_id));
drop policy if exists canx_ins on public.caixa_anexos;
create policy canx_ins on public.caixa_anexos for insert to authenticated
  with check (private.pode_anexar_caixa(diferenca_id) and enviado_por = auth.uid());
drop policy if exists canx_del on public.caixa_anexos;
create policy canx_del on public.caixa_anexos for delete to authenticated
  using (private.pode_anexar_caixa(diferenca_id) and (enviado_por = auth.uid() or private.sou_admin() or private.tem_papel('financeiro')));

-- id da quebra a partir do caminho no Storage (caixa/<uuid>/...); caminho fora do padrão = null (sem erro de conversão)
create or replace function private.quebra_da_pasta(p_nome text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_nome, '/', 1) = 'caixa'
     and split_part(p_nome, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_nome, '/', 2)::uuid
  end;
$$;
revoke all on function private.quebra_da_pasta(text) from public, anon;
grant execute on function private.quebra_da_pasta(text) to authenticated;

-- Storage: caixa/<id da quebra>/<arquivo>
drop policy if exists caixa_anexo_select on storage.objects;
create policy caixa_anexo_select on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and private.pode_ver_anexo_caixa(private.quebra_da_pasta(name)));
drop policy if exists caixa_anexo_insert on storage.objects;
create policy caixa_anexo_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and private.pode_anexar_caixa(private.quebra_da_pasta(name)));
drop policy if exists caixa_anexo_delete on storage.objects;
create policy caixa_anexo_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and private.pode_anexar_caixa(private.quebra_da_pasta(name)));
