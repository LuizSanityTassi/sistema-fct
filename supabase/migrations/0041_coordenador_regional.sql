-- 0041 — Coordenador de vendas: enxerga indicadores e quebras de caixa de TODAS as lojas da regional dele
-- (profiles.regional = branches.regional: Sul, Serra, Oeste…). Loja nova da regional entra sozinha.
--  • pode_ver_filial passa a valer para o coordenador nas lojas da regional → chamados, TI e lançamentos do financeiro;
--  • leituras do financeiro que o gerente já tem (DRE, orçamento, fluxo, inadimplência) valem para o coordenador;
--  • quebras de caixa (e anexos) das lojas da regional: só leitura (quem justifica continua o gestor da loja);
--  • NÃO vê funcionários, documentos, ASO, folha nem salários (pode_rh_filial continua só admin/RH/gerente).
-- A regional fica protegida como o papel: só o administrador muda.
-- ADITIVA: uma coluna, uma função nova; funções e políticas ganham o caso do coordenador (nada é tirado de ninguém).

alter table public.profiles add column if not exists regional text;

create or replace function private.proteger_campos_perfil()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
begin
  if auth.uid() is null or private.sou_admin() then
    return new;
  end if;
  new.id := old.id;
  new.papel := old.papel;
  new.branch_id := old.branch_id;
  new.ativo := old.ativo;
  new.email := old.email;
  new.employee_id := old.employee_id;
  new.regional := old.regional;
  return new;
end;
$$;

-- a loja é da regional que o usuário (ativo) coordena
create or replace function private.coordena_filial(b uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select b is not null and exists (
    select 1
      from public.profiles p
      join public.branches br on br.id = b
     where p.id = auth.uid() and p.ativo and p.papel = 'coordenador'
       and p.regional is not null and br.regional = p.regional
  );
$$;
revoke all on function private.coordena_filial(uuid) from public, anon;
grant execute on function private.coordena_filial(uuid) to authenticated;

create or replace function private.pode_ver_filial(b uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select case
    when b is null then true
    when (select papel from public.profiles where id = auth.uid()) in ('admin','rh','ti','financeiro') then true
    when exists (select 1 from public.profiles p where p.id = auth.uid() and p.branch_id = b) then true
    when exists (select 1 from public.user_branch_access u where u.user_id = auth.uid() and u.branch_id = b) then true
    when private.coordena_filial(b) then true
    else false end;
$$;

-- financeiro: lançamentos das lojas que ele vê; as demais leituras do gerente
alter policy flan_sel on public.fin_lancamentos
  using (private.sou_admin() or private.tem_papel('financeiro', 'contador') or (private.tem_papel('gerente', 'coordenador') and private.pode_ver_filial(branch_id)));
alter policy faj_sel on public.fin_dre_ajustes using (private.sou_admin() or private.tem_papel('financeiro', 'contador', 'gerente', 'coordenador'));
alter policy fsal_sel on public.fin_dre_saldos using (private.sou_admin() or private.tem_papel('financeiro', 'contador', 'gerente', 'coordenador'));
alter policy forc_sel on public.fin_orcamentos using (private.sou_admin() or private.tem_papel('financeiro', 'contador', 'gerente', 'coordenador'));
alter policy ffm_sel on public.fin_fluxo_mensal using (private.sou_admin() or private.tem_papel('financeiro', 'contador', 'gerente', 'coordenador'));
alter policy ffd_sel on public.fin_fluxo_diario using (private.sou_admin() or private.tem_papel('financeiro', 'contador', 'gerente', 'coordenador'));
alter policy fina_sel on public.fin_inadimplencia using (private.sou_admin() or private.tem_papel('financeiro', 'contador', 'gerente', 'coordenador'));

-- quebras de caixa da regional (só leitura) e os anexos delas
alter policy cdif_sel on public.caixa_diferencas
  using (private.sou_admin() or private.tem_papel('financeiro')
         or (classe = 'quebra' and (private.tem_papel('rh') or private.pode_ver_quebra(employee_id, gestor_id, branch_id) or private.coordena_filial(branch_id))));

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
            or (d.classe = 'quebra' and (private.pode_ver_quebra(d.employee_id, d.gestor_id, d.branch_id) or private.coordena_filial(d.branch_id))))
  );
$$;
