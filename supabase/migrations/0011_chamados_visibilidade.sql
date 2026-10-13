-- 0011 — Chamados: visibilidade por categoria, permissões do solicitante, nomes na tela e anexos no Storage.
-- Regras:
--   • admin vê tudo; TI vê tudo que não é de RH; RH vê os chamados de RH; Financeiro vê os de Financeiro;
--   • solicitante e responsável sempre veem o próprio chamado;
--   • gerente/usuário veem os chamados da(s) sua(s) filial(is), EXCETO os de RH (sensíveis);
--   • solicitante pode atualizar o próprio chamado (cancelar/reabrir — a aplicação limita os campos);
--   • quem vê um chamado pode ver nome/papel de quem abriu e de quem atende.

create or replace function private.pode_ver_ticket(t uuid)
returns boolean language sql stable security definer set search_path = private, public as $$
  select exists (
    select 1 from public.tickets k where k.id = t and (
      sou_admin()
      or k.solicitante = auth.uid()
      or k.responsavel = auth.uid()
      or (k.categoria = 'rh' and tem_papel('rh'))
      or (k.categoria = 'financeiro' and tem_papel('financeiro'))
      or (k.categoria <> 'rh' and (tem_papel('ti') or pode_ver_filial(k.branch_id)))
    )
  );
$$;

drop policy if exists tk_sel on public.tickets;
create policy tk_sel on public.tickets for select to authenticated
  using (private.pode_ver_ticket(id));

drop policy if exists tk_upd on public.tickets;
create policy tk_upd on public.tickets for update to authenticated
  using (
    private.sou_admin() or private.tem_papel('ti')
    or responsavel = auth.uid() or solicitante = auth.uid()
    or (categoria = 'rh' and private.tem_papel('rh'))
    or (categoria = 'financeiro' and private.tem_papel('financeiro'))
  )
  with check (
    private.sou_admin() or private.tem_papel('ti')
    or responsavel = auth.uid() or solicitante = auth.uid()
    or (categoria = 'rh' and private.tem_papel('rh'))
    or (categoria = 'financeiro' and private.tem_papel('financeiro'))
  );

-- Nome/papel de solicitante e responsável para quem pode ver o chamado.
create policy prof_sel_chamados on public.profiles for select to authenticated
  using (
    exists (
      select 1 from public.tickets k
      where (k.solicitante = profiles.id or k.responsavel = profiles.id)
        and private.pode_ver_ticket(k.id)
    )
  );

-- Anexos: chamados/<ticket_id>/<arquivo> — quem vê o chamado lê e envia.
create policy chamados_select on storage.objects for select to authenticated
  using (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = 'chamados'
    and private.pode_ver_ticket(((storage.foldername(name))[2])::uuid)
  );
create policy chamados_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = 'chamados'
    and private.pode_ver_ticket(((storage.foldername(name))[2])::uuid)
  );
