-- 0004 — Cadastro de RH com os campos da "Relação de Empregados" (Domínio) e salários em tabela própria.
-- Mudanças ADITIVAS: nenhuma coluna/tabela existente é alterada ou removida.

-- Unidade (filial/CNPJ): razão social própria e regional (Sul, Serra, Vale do Itajaí, Oeste, Blumenau, Administrativo).
alter table public.branches
  add column if not exists razao_social text,
  add column if not exists regional     text;

-- Funcionário: dados contratuais que vêm da folha.
alter table public.employees
  add column if not exists categoria           text,          -- Mensalista / Horista
  add column if not exists horas_mes           numeric(6,2),  -- horas contratuais por mês
  add column if not exists num_filhos          smallint,
  add column if not exists num_dependentes     smallint,
  add column if not exists contribui_sindicato boolean,
  add column if not exists optante_fgts        boolean;

-- Salário fica FORA de employees: quem enxerga o funcionário (ex.: gerente da filial) não enxerga salário.
-- Histórico por vigência (reajuste/promoção = nova linha; vigencia_fim null = vigente).
create table if not exists public.employee_salaries (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.employees(id) on delete cascade,
  salario         numeric(14,2) not null,
  vigencia_inicio date not null,
  vigencia_fim    date,
  origem          text,                                  -- importação, reajuste, promoção...
  created_at      timestamptz not null default now()
);
create index if not exists employee_salaries_employee_idx
  on public.employee_salaries (employee_id, vigencia_inicio desc);

alter table public.employee_salaries enable row level security;
create policy sal_sel on public.employee_salaries for select to authenticated
  using (private.sou_admin() or private.tem_papel('rh'));
create policy sal_wr  on public.employee_salaries for all to authenticated
  using (private.sou_admin() or private.tem_papel('rh'))
  with check (private.sou_admin() or private.tem_papel('rh'));

-- Salário vigente por funcionário (security_invoker: aplica o RLS de quem consulta).
create or replace view public.employee_current_salary
  with (security_invoker = true) as
  select distinct on (employee_id) employee_id, salario, vigencia_inicio, origem
  from public.employee_salaries
  where vigencia_fim is null or vigencia_fim >= current_date
  order by employee_id, vigencia_inicio desc;
