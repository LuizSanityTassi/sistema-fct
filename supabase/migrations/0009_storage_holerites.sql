-- 0009 — Holerites (folha) ficam em pasta própria do bucket "documentos": folha/<employee_id>/…
-- Diferente dos documentos da ficha, só admin/RH podem ler (gerente da filial NÃO vê holerite).
create policy folha_select on storage.objects for select to authenticated
  using (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = 'folha'
    and private.tem_papel('admin', 'rh')
  );
