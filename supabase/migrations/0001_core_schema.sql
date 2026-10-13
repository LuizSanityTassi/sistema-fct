-- =====================================================================
-- Sistema FCT — Etapa 1: schema central (empresas/filiais, acesso, RH,
-- chamados, auditoria). PKs uuid, dinheiro numeric(14,2), exclusão lógica.
-- =====================================================================

-- ---------- Extensões ----------
create extension if not exists pgcrypto;      -- gen_random_uuid()

-- ---------- Tipos de domínio (enums) ----------
create type app_role          as enum ('admin','rh','ti','financeiro','gerente','usuario');
create type employee_status   as enum ('ativo','afastado','ferias','desligado');
create type contract_type     as enum ('clt','pj','estagio','temporario','aprendiz');
create type document_category as enum ('documento_pessoal','contrato','aso','ferias','advertencia','comprovante','folha','atestado','outros');
create type aso_type          as enum ('admissional','periodico','retorno','mudanca_funcao','demissional');
create type ticket_category   as enum ('ti','rh','financeiro','manutencao','compras','outros');
create type ticket_priority   as enum ('baixa','normal','alta','critica');
create type ticket_status     as enum ('aberto','em_analise','em_atendimento','aguardando_usuario','aguardando_terceiro','resolvido','cancelado');
create type payroll_status    as enum ('rascunho','fechada','paga');

-- ---------- updated_at automático ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

-- =====================================================================
-- NÚCLEO: empresa → filial → departamento
-- =====================================================================
create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  razao_social  text not null,
  nome_fantasia text,
  cnpj          text unique,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.branches (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  codigo          text not null,                      -- F001, F002...
  nome            text not null,
  cnpj            text,
  cidade          text,
  estado          char(2),
  endereco        text,
  telefone        text,
  email           text,
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, codigo)                    -- código único por empresa
);
create index idx_branches_org on public.branches(organization_id);

create table public.departments (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid not null references public.branches(id) on delete cascade,
  nome       text not null,
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  unique (branch_id, nome)
);
create index idx_departments_branch on public.departments(branch_id);

-- =====================================================================
-- ACESSO: profiles (1:1 auth.users) + acesso por filial (gerente)
-- =====================================================================
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  nome           text not null default '',
  email          text,
  papel          app_role not null default 'usuario',
  branch_id      uuid references public.branches(id) on delete set null,  -- filial padrão
  ativo          boolean not null default true,
  ultimo_acesso  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Quais filiais um GERENTE/USUARIO pode enxergar (além da sua filial padrão)
create table public.user_branch_access (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  primary key (user_id, branch_id)
);

-- Cria o profile automaticamente quando nasce um usuário no Auth
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nome)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- =====================================================================
-- RH: funcionários, documentos, ASO, folha
-- =====================================================================
create table public.employees (
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid not null references public.branches(id) on delete restrict,
  department_id   uuid references public.departments(id) on delete set null,
  nome            text not null,
  cpf             text,                          -- fictício nesta fase
  matricula       text,
  data_nascimento date,
  email           text,
  telefone        text,
  cargo           text,
  tipo_contrato   contract_type,
  data_admissao   date,
  status          employee_status not null default 'ativo',
  observacoes     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (branch_id, matricula)
);
create index idx_employees_branch on public.employees(branch_id);
create index idx_employees_dept on public.employees(department_id);
create index idx_employees_status on public.employees(status);

create table public.employee_documents (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  categoria    document_category not null default 'outros',
  nome         text not null,
  descricao    text,
  storage_path text not null,                    -- caminho no bucket privado
  data_documento date,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  ativo        boolean not null default true,
  created_at   timestamptz not null default now()
);
create index idx_docs_employee on public.employee_documents(employee_id);

create table public.employee_aso (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.employees(id) on delete cascade,
  tipo             aso_type not null,
  data_realizacao  date,
  data_validade    date,
  storage_path     text,
  observacoes      text,
  created_at       timestamptz not null default now()
);
create index idx_aso_employee on public.employee_aso(employee_id);
create index idx_aso_validade on public.employee_aso(data_validade);

create table public.payroll_records (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees(id) on delete cascade,
  competencia    char(7) not null,               -- 'AAAA-MM'
  salario_base   numeric(14,2) not null default 0,
  horas_extras   numeric(14,2) not null default 0,
  adicionais     numeric(14,2) not null default 0,
  beneficios     numeric(14,2) not null default 0,
  descontos      numeric(14,2) not null default 0,
  valor_liquido  numeric(14,2) not null default 0,
  storage_path   text,
  status         payroll_status not null default 'rascunho',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (employee_id, competencia)
);
create index idx_payroll_employee on public.payroll_records(employee_id);
create index idx_payroll_comp on public.payroll_records(competencia);

-- =====================================================================
-- CHAMADOS
-- =====================================================================
create sequence if not exists public.ticket_numero_seq start 142;   -- começa em #000142 (exemplo do briefing)
create table public.tickets (
  id            uuid primary key default gen_random_uuid(),
  numero        bigint not null default nextval('public.ticket_numero_seq') unique,
  titulo        text not null,
  descricao     text,
  categoria     ticket_category not null default 'outros',
  subcategoria  text,
  branch_id     uuid references public.branches(id) on delete set null,
  solicitante   uuid references public.profiles(id) on delete set null,
  responsavel   uuid references public.profiles(id) on delete set null,
  prioridade    ticket_priority not null default 'normal',
  status        ticket_status not null default 'aberto',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
create index idx_tickets_branch on public.tickets(branch_id);
create index idx_tickets_status on public.tickets(status);
create index idx_tickets_resp on public.tickets(responsavel);

create table public.ticket_comments (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.tickets(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null,
  comentario text not null,
  created_at timestamptz not null default now()
);
create index idx_tcomments_ticket on public.ticket_comments(ticket_id);

create table public.ticket_attachments (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references public.tickets(id) on delete cascade,
  nome         text not null,
  storage_path text not null,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index idx_tattach_ticket on public.ticket_attachments(ticket_id);

-- Timeline/histórico do chamado
create table public.ticket_history (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  acao        text not null,                      -- 'aberto','assumiu','status','comentario'...
  de          text,                               -- valor anterior (quando aplicável)
  para        text,                               -- valor novo
  created_at  timestamptz not null default now()
);
create index idx_thistory_ticket on public.ticket_history(ticket_id);

-- =====================================================================
-- AUDITORIA (geral)
-- =====================================================================
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  acao        text not null,                      -- create/update/inativar/...
  entidade    text not null,                      -- nome da tabela/entidade
  registro_id uuid,
  valor_anterior jsonb,
  valor_novo     jsonb,
  created_at  timestamptz not null default now()
);
create index idx_audit_entidade on public.audit_logs(entidade, registro_id);
create index idx_audit_created on public.audit_logs(created_at desc);

-- ---------- Triggers de updated_at ----------
create trigger t_org_upd     before update on public.organizations   for each row execute function public.set_updated_at();
create trigger t_branch_upd  before update on public.branches        for each row execute function public.set_updated_at();
create trigger t_profile_upd before update on public.profiles        for each row execute function public.set_updated_at();
create trigger t_emp_upd     before update on public.employees       for each row execute function public.set_updated_at();
create trigger t_pay_upd     before update on public.payroll_records for each row execute function public.set_updated_at();
create trigger t_ticket_upd  before update on public.tickets         for each row execute function public.set_updated_at();
