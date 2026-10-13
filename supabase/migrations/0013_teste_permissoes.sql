-- 0013 — Função de diagnóstico de permissões (schema private, não exposta pela API, sem acesso para anon/authenticated).
-- Executa contagens e tentativas de escrita "como se fosse" cada usuário informado, com o RLS aplicado.
-- As escritas são desfeitas dentro da própria função (subtransação com exceção).
-- Uso (no SQL editor, como postgres):
--   select jsonb_pretty(private.teste_permissoes(array['<uuid do perfil>'::uuid, ...]));
create or replace function private.teste_permissoes(uids uuid[])
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  uid uuid; r jsonb := '{}'::jsonb; upd_sal int; upd_func int; upd_filial int; ins_ticket text; ins_ticket_outro text; ins_doc text;
begin
  perform set_config('role', 'authenticated', true);
  foreach uid in array uids loop
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);

    begin
      update public.employee_salaries set salario = salario where true; get diagnostics upd_sal = row_count;
      update public.employees set observacoes = observacoes where true; get diagnostics upd_func = row_count;
      update public.branches set nome = nome where true; get diagnostics upd_filial = row_count;
      raise exception using errcode = 'P0001', message = 'desfaz';
    exception when others then
      if sqlerrm <> 'desfaz' then upd_sal := -1; upd_func := -1; upd_filial := -1; end if;
    end;

    begin
      insert into public.tickets (titulo, solicitante, categoria) values ('TESTE RLS', uid, 'ti');
      ins_ticket := 'permitido';
      raise exception using errcode = 'P0001', message = 'desfaz';
    exception when others then
      if sqlerrm <> 'desfaz' then ins_ticket := 'negado ' || sqlstate; end if;
    end;

    begin
      insert into public.tickets (titulo, solicitante, categoria) values ('TESTE RLS', 'd7e9deaf-0000-0000-0000-000000000000', 'ti');
      ins_ticket_outro := 'permitido';
      raise exception using errcode = 'P0001', message = 'desfaz';
    exception when others then
      if sqlerrm <> 'desfaz' then ins_ticket_outro := 'negado ' || sqlstate; end if;
    end;

    begin
      insert into public.employee_documents (employee_id, nome, storage_path, uploaded_by)
      values ((select id from public.employees limit 1), 'TESTE', 'funcionarios/x/y.pdf', uid);
      ins_doc := 'permitido';
      raise exception using errcode = 'P0001', message = 'desfaz';
    exception when others then
      if sqlerrm <> 'desfaz' then ins_doc := 'negado ' || sqlstate; end if;
    end;

    r := r || jsonb_build_object(uid::text, jsonb_build_object(
      'funcionarios', (select count(*) from public.employees),
      'salarios', (select count(*) from public.employee_salaries),
      'salario_vigente', (select count(*) from public.employee_current_salary),
      'folha', (select count(*) from public.payroll_records),
      'unidades', (select count(*) from public.branches),
      'perfis', (select count(*) from public.profiles),
      'chamados', (select count(*) from public.tickets),
      'documentos', (select count(*) from public.employee_documents),
      'auditoria', (select count(*) from public.audit_logs),
      'contagem_func_unidades', (select count(*) from public.branch_employee_counts),
      'upd_salarios_linhas', upd_sal,
      'upd_funcionarios_linhas', upd_func,
      'upd_unidades_linhas', upd_filial,
      'abrir_chamado_proprio', ins_ticket,
      'abrir_chamado_como_outro', ins_ticket_outro,
      'enviar_documento', ins_doc
    ));
  end loop;
  return r;
end $$;
revoke all on function private.teste_permissoes(uuid[]) from public, anon, authenticated;
