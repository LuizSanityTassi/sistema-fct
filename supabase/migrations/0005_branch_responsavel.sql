-- 0005 — Responsável por unidade (gerente/responsável da loja).
-- FK para o funcionário quando ele está cadastrado; texto livre como fallback
-- (ex.: trainee ou pessoa ainda fora da folha). Mudança ADITIVA.

alter table public.branches
  add column if not exists responsavel_employee_id uuid references public.employees(id) on delete set null,
  add column if not exists responsavel_nome        text;

create index if not exists branches_responsavel_idx on public.branches (responsavel_employee_id);
