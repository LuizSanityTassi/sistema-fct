-- 0008 — Storage privado para documentos de RH (contratos, ASO, atestados…) + exclusão lógica de ASO.
-- Caminho dos arquivos: funcionarios/<employee_id>/<uuid>-<nome>  (ASO: funcionarios/<employee_id>/aso/…)
-- Nada é público: todo acesso passa por URL assinada de curta duração gerada pela aplicação.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos', 'documentos', false, 20971520,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Leitura: quem pode ver o funcionário (admin/RH todos; gerente só a própria filial).
-- O 2º segmento do caminho é o id do funcionário.
create policy documentos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = 'funcionarios'
    and private.pode_ver_employee(((storage.foldername(name))[2])::uuid)
  );

-- Escrita: só admin/RH.
create policy documentos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and private.tem_papel('admin', 'rh'));
create policy documentos_update on storage.objects for update to authenticated
  using (bucket_id = 'documentos' and private.tem_papel('admin', 'rh'));
create policy documentos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and private.tem_papel('admin', 'rh'));

-- ASO: exclusão lógica (igual aos documentos).
alter table public.employee_aso
  add column if not exists ativo boolean not null default true;
