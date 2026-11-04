-- Pedidos do RH (04/11/2026): categoria de rescisão, documento que vai para o gerente colher a assinatura e volta sozinho para
-- o cadastro, dados da ficha de registro no cadastro do funcionário e dados da empresa para a declaração do banco.
-- Os dados do sócio e da empresa não ficam neste arquivo: são preenchidos direto no banco.
alter type public.document_category add value if not exists 'rescisao';

alter table public.employee_documents
  add column assinatura text check (assinatura in ('aguardando', 'assinado')),
  add column assinado_path text,
  add column assinado_em timestamptz,
  add column assinado_por uuid references auth.users (id) on delete set null;
create index employee_documents_aguardando_idx on public.employee_documents (employee_id) where assinatura = 'aguardando' and ativo;
create index employee_documents_assinado_por_idx on public.employee_documents (assinado_por);

-- O gerente só envia para a pasta "assinados" de quem é da filial dele; o resto do bucket continua só para Admin e RH.
create policy documentos_assinado_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = 'funcionarios'
    and (storage.foldername(name))[3] = 'assinados'
    and private.pode_ver_employee(((storage.foldername(name))[2])::uuid)
  );

-- Gerente, RH ou Admin devolvem o documento assinado; ele fica na ficha do funcionário.
create function public.rh_documento_devolver_assinado(p_documento uuid, p_caminho text) returns void
language plpgsql security definer set search_path = public as $$
declare
  d record;
begin
  select id, employee_id, assinatura, ativo into d from public.employee_documents where id = p_documento;
  if d.id is null or not d.ativo or auth.uid() is null or not private.pode_ver_employee(d.employee_id) then
    raise exception 'Documento não encontrado ou sem permissão.' using errcode = 'P0001';
  end if;
  if d.assinatura is distinct from 'aguardando' then
    raise exception 'Este documento não está aguardando assinatura.' using errcode = 'P0001';
  end if;
  if p_caminho is null or p_caminho not like 'funcionarios/' || d.employee_id || '/assinados/%' then
    raise exception 'Arquivo assinado inválido.' using errcode = 'P0001';
  end if;
  update public.employee_documents
     set assinatura = 'assinado', assinado_path = p_caminho, assinado_em = now(), assinado_por = auth.uid()
   where id = d.id;
  insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_novo)
  values (auth.uid(), 'editar', 'employee_documents', d.id, jsonb_build_object('assinatura', 'assinado'));
end $$;
revoke all on function public.rh_documento_devolver_assinado(uuid, text) from public, anon;
grant execute on function public.rh_documento_devolver_assinado(uuid, text) to authenticated;

alter table public.employees
  add column pis text,
  add column nome_mae text,
  add column nome_pai text,
  add column endereco text,
  add column endereco_numero text,
  add column bairro text,
  add column cidade text,
  add column uf text,
  add column cep text,
  add column celular text,
  add column escolaridade text,
  add column estado_civil text,
  add column rg text,
  add column rg_emissao date,
  add column rg_emissor text,
  add column rg_uf text,
  add column raca_cor text,
  add column titulo_eleitor text,
  add column titulo_zona text,
  add column titulo_secao text,
  add column cnh text,
  add column cnh_emissao date,
  add column cnh_vencimento date,
  add column cnh_categoria text,
  add column reservista text,
  add column reservista_categoria text,
  add column horario_trabalho text,
  add column periodo_experiencia text,
  add column adicionais text;

alter table public.organizations
  add column razao_declaracao text,
  add column endereco_declaracao text,
  add column socio_nome text,
  add column socio_cpf text;
