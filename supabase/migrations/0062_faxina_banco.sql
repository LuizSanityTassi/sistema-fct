-- Faxina do banco (pedido do usuário, 21/10/2026, a partir dos alertas do Supabase). Nada de dado muda: só índices e
-- a forma das regras de permissão. Conferido antes de aplicar, num retrato fixo do banco: 8 perfis × 61 tabelas com
-- as mesmas linhas visíveis antes e depois (0 diferenças) e nenhuma regra permissiva sobreposta sobrando.

-- 1) Índices repetidos na folha antiga: idx_payroll_comp = payroll_records_competencia_idx; idx_payroll_employee já é
--    coberto pela chave única (employee_id, competencia).
drop index if exists public.idx_payroll_comp;
drop index if exists public.idx_payroll_employee;

-- 2) Chaves estrangeiras sem índice nas tabelas que crescem ou que são filtradas por elas (filial, conciliação,
--    responsável…). As de "quem gravou" (created_by, atualizado_por…) ficam sem: ninguém filtra por elas.
create index if not exists dre_contabil_branch_idx on public.dre_contabil (branch_id);
create index if not exists dre_contabil_importacao_idx on public.dre_contabil (importacao_id);
create index if not exists folha_lancamentos_branch_idx on public.folha_lancamentos (branch_id);
create index if not exists conc_itens_branch_idx on public.conc_itens (branch_id);
create index if not exists caixa_coletas_branch_idx on public.caixa_coletas (branch_id);
create index if not exists caixa_diferencas_operador_idx on public.caixa_diferencas (cod_operador);
create index if not exists conc_pendencias_branch_idx on public.conc_pendencias (branch_id);
create index if not exists conc_pendencias_conciliacao_idx on public.conc_pendencias (conciliacao_id);
create index if not exists conc_pendencias_responsavel_idx on public.conc_pendencias (responsavel);
create index if not exists conc_enviados_omie_conciliacao_idx on public.conc_enviados_omie (conciliacao_id);
create index if not exists conc_enviados_omie_arquivo_idx on public.conc_enviados_omie (arquivo_id);
create index if not exists profiles_branch_idx on public.profiles (branch_id);
create index if not exists user_branch_access_branch_idx on public.user_branch_access (branch_id);
create index if not exists audit_logs_user_idx on public.audit_logs (user_id);
create index if not exists tickets_solicitante_idx on public.tickets (solicitante);
create index if not exists caixa_gestores_profile_idx on public.caixa_gestores (profile_id);
create index if not exists it_assets_responsavel_idx on public.it_assets (responsavel_employee_id);

-- 3) Regras "_wr" FOR ALL (escrita) também valiam para leitura, junto com a regra "_sel": o banco conferia as duas a
--    cada linha lida. Cada FOR ALL vira INSERT + UPDATE + DELETE com as MESMAS condições; a leitura fica só na "_sel".
do $$
declare
  p record;
begin
  for p in
    select pol.tablename, pol.policyname, pol.roles, pol.qual, coalesce(pol.with_check, pol.qual) as chk
    from pg_policies pol
    where pol.schemaname = 'public' and pol.cmd = 'ALL' and pol.permissive = 'PERMISSIVE'
      and exists (select 1 from pg_policies s where s.schemaname = 'public' and s.tablename = pol.tablename and s.cmd = 'SELECT' and s.permissive = 'PERMISSIVE')
  loop
    if p.roles::text <> '{authenticated}' then
      raise exception 'regra % em % não é só de authenticated (%)', p.policyname, p.tablename, p.roles;
    end if;
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', p.policyname || '_ins', p.tablename, p.chk);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', p.policyname || '_upd', p.tablename, p.qual, p.chk);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)', p.policyname || '_del', p.tablename, p.qual);
  end loop;
end $$;

-- Onde a regra de escrita não estava contida na de leitura, a leitura ganha a condição dela (vê o mesmo que antes).
-- De quebra, admin/RH/TI deixam de passar pela função por linha.
alter policy aso_sel on public.employee_aso using (
  (select private.sou_admin()) or (select private.tem_papel('rh')) or private.pode_ver_employee(employee_id)
);
alter policy doc_sel on public.employee_documents using (
  (select private.sou_admin()) or (select private.tem_papel('rh')) or private.pode_ver_employee(employee_id)
);
alter policy ita_sel on public.it_assets using (
  (select private.sou_admin()) or (select private.tem_papel('ti')) or branch_id is null
  or branch_id = any ((select private.filiais_visiveis())::uuid[])
);

-- profiles: as duas regras de leitura viram uma (o próprio/admin/RH/TI + quem aparece num chamado que a pessoa vê) e
-- as duas de alteração (admin + o próprio) também.
alter policy prof_sel on public.profiles using (
  id = (select auth.uid())
  or (select private.sou_admin())
  or (select private.tem_papel('rh', 'ti'))
  or exists (select 1 from public.tickets k where (k.solicitante = profiles.id or k.responsavel = profiles.id) and private.pode_ver_ticket(k.id))
);
drop policy prof_sel_chamados on public.profiles;
drop policy prof_adm_upd on public.profiles;
drop policy prof_upd_self on public.profiles;
create policy prof_upd on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select private.sou_admin()))
  with check (id = (select auth.uid()) or (select private.sou_admin()));
