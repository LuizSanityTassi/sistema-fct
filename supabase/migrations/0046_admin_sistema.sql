-- "Administrador do sistema" por pessoa, separado do cargo (pedido de 19/10/2026): quem cuida do sistema fica no
-- cargo certo (ex.: TI) e mantém TODOS os poderes de administrador, sem que todo mundo do cargo ganhe esses poderes.
-- Só cria coisas novas e amplia as funções de checagem: ninguém perde acesso; a marcação começa desligada para todos.

alter table public.profiles add column if not exists admin_sistema boolean not null default false;
comment on column public.profiles.admin_sistema is 'Tem todos os poderes de administrador, qualquer que seja o cargo (papel). Só administrador altera.';

-- quem é administrador: cargo Administrador OU a marcação
create or replace function private.sou_admin()
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select coalesce((select papel = 'admin' or admin_sistema from public.profiles where id = auth.uid()), false);
$$;

-- regras que pedem o papel 'admin' na lista (ex.: documentos e folha no Storage) também valem para a marcação
create or replace function private.tem_papel(variadic papeis app_role[])
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select coalesce((select papel = any (papeis) or (admin_sistema and 'admin'::app_role = any (papeis)) from public.profiles where id = auth.uid()), false);
$$;

-- administrador vê todas as lojas (com a marcação também)
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
    when coalesce((select admin_sistema from public.profiles where id = auth.uid()), false) then true
    when exists (select 1 from public.profiles p where p.id = auth.uid() and p.branch_id = b) then true
    when exists (select 1 from public.user_branch_access u where u.user_id = auth.uid() and u.branch_id = b) then true
    when private.coordena_filial(b) then true
    else false end;
$$;

-- a marcação é protegida como o cargo: só administrador muda (ninguém se promove sozinho)
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
  new.admin_sistema := old.admin_sistema;
  return new;
end;
$$;
