-- =====================================================================
-- Sistema FCT — Etapa 1: RLS (Row Level Security) + funções de acesso.
-- Regra de ouro: quem decide o acesso é o Postgres, não o frontend.
-- =====================================================================

-- ---------- Funções auxiliares (security definer: leem profiles sem recursão) ----------
create or replace function public.meu_papel()
returns app_role language sql stable security definer set search_path = public as $$
  select papel from public.profiles where id = auth.uid();
$$;

create or replace function public.sou_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select papel = 'admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.tem_papel(variadic papeis app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select papel = any(papeis) from public.profiles where id = auth.uid()), false);
$$;

-- pode ver uma filial? admin e áreas corporativas (rh/ti/financeiro) veem todas;
-- gerente/usuário veem a sua filial padrão e as liberadas em user_branch_access.
create or replace function public.pode_ver_filial(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when b is null then true
    when (select papel from public.profiles where id = auth.uid()) in ('admin','rh','ti','financeiro') then true
    when exists (select 1 from public.profiles p where p.id = auth.uid() and p.branch_id = b) then true
    when exists (select 1 from public.user_branch_access u where u.user_id = auth.uid() and u.branch_id = b) then true
    else false
  end;
$$;

-- acesso a dados de RH de uma filial (admin/rh em todas; gerente só nas suas)
create or replace function public.pode_rh_filial(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.sou_admin() or public.tem_papel('rh') or (public.tem_papel('gerente') and public.pode_ver_filial(b));
$$;

create or replace function public.pode_ver_employee(emp uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.employees e where e.id = emp and public.pode_rh_filial(e.branch_id));
$$;

create or replace function public.pode_ver_ticket(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tickets k where k.id = t and (
      public.sou_admin() or public.tem_papel('ti') or k.solicitante = auth.uid()
      or k.responsavel = auth.uid() or public.pode_ver_filial(k.branch_id)
    )
  );
$$;

-- ---------- Habilita RLS ----------
alter table public.organizations      enable row level security;
alter table public.branches           enable row level security;
alter table public.departments        enable row level security;
alter table public.profiles           enable row level security;
alter table public.user_branch_access enable row level security;
alter table public.employees          enable row level security;
alter table public.employee_documents enable row level security;
alter table public.employee_aso       enable row level security;
alter table public.payroll_records    enable row level security;
alter table public.tickets            enable row level security;
alter table public.ticket_comments    enable row level security;
alter table public.ticket_attachments enable row level security;
alter table public.ticket_history     enable row level security;
alter table public.audit_logs         enable row level security;

-- ---------- Dados de referência (empresa/filial/depto): leitura autenticada, escrita admin ----------
create policy org_sel on public.organizations for select to authenticated using (true);
create policy org_adm on public.organizations for all    to authenticated using (public.sou_admin()) with check (public.sou_admin());
create policy br_sel  on public.branches      for select to authenticated using (true);
create policy br_adm  on public.branches      for all    to authenticated using (public.sou_admin()) with check (public.sou_admin());
create policy dep_sel on public.departments   for select to authenticated using (true);
create policy dep_adm on public.departments   for all    to authenticated using (public.sou_admin()) with check (public.sou_admin());

-- ---------- Profiles: vê a si mesmo; admin/rh/ti veem todos; só admin escreve ----------
create policy prof_sel on public.profiles for select to authenticated
  using (id = auth.uid() or public.sou_admin() or public.tem_papel('rh','ti'));
create policy prof_upd_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and papel = (select papel from public.profiles where id = auth.uid())); -- não muda o próprio papel
create policy prof_adm on public.profiles for all to authenticated
  using (public.sou_admin()) with check (public.sou_admin());

-- ---------- user_branch_access: só admin ----------
create policy uba_adm on public.user_branch_access for all to authenticated
  using (public.sou_admin()) with check (public.sou_admin());

-- ---------- Funcionários e dados de RH ----------
create policy emp_sel on public.employees for select to authenticated using (public.pode_rh_filial(branch_id));
create policy emp_wr  on public.employees for all    to authenticated
  using (public.sou_admin() or public.tem_papel('rh')) with check (public.sou_admin() or public.tem_papel('rh'));

create policy doc_sel on public.employee_documents for select to authenticated using (public.pode_ver_employee(employee_id));
create policy doc_wr  on public.employee_documents for all    to authenticated
  using (public.sou_admin() or public.tem_papel('rh')) with check (public.sou_admin() or public.tem_papel('rh'));

create policy aso_sel on public.employee_aso for select to authenticated using (public.pode_ver_employee(employee_id));
create policy aso_wr  on public.employee_aso for all    to authenticated
  using (public.sou_admin() or public.tem_papel('rh')) with check (public.sou_admin() or public.tem_papel('rh'));

-- Folha é sensível: só admin e RH
create policy pay_sel on public.payroll_records for select to authenticated using (public.sou_admin() or public.tem_papel('rh'));
create policy pay_wr  on public.payroll_records for all    to authenticated
  using (public.sou_admin() or public.tem_papel('rh')) with check (public.sou_admin() or public.tem_papel('rh'));

-- ---------- Chamados ----------
create policy tk_sel on public.tickets for select to authenticated
  using (public.sou_admin() or public.tem_papel('ti') or solicitante = auth.uid() or responsavel = auth.uid() or public.pode_ver_filial(branch_id));
create policy tk_ins on public.tickets for insert to authenticated
  with check (solicitante = auth.uid());
create policy tk_upd on public.tickets for update to authenticated
  using (public.sou_admin() or public.tem_papel('ti') or responsavel = auth.uid())
  with check (public.sou_admin() or public.tem_papel('ti') or responsavel = auth.uid());

create policy tc_sel on public.ticket_comments for select to authenticated using (public.pode_ver_ticket(ticket_id));
create policy tc_ins on public.ticket_comments for insert to authenticated with check (public.pode_ver_ticket(ticket_id) and author_id = auth.uid());

create policy ta_sel on public.ticket_attachments for select to authenticated using (public.pode_ver_ticket(ticket_id));
create policy ta_ins on public.ticket_attachments for insert to authenticated with check (public.pode_ver_ticket(ticket_id));

create policy th_sel on public.ticket_history for select to authenticated using (public.pode_ver_ticket(ticket_id));
create policy th_ins on public.ticket_history for insert to authenticated with check (public.pode_ver_ticket(ticket_id));

-- ---------- Auditoria: só admin lê. Gravação é feita pelo servidor (service_role ignora RLS). ----------
create policy audit_sel on public.audit_logs for select to authenticated using (public.sou_admin());
