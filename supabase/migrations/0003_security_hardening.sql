-- =====================================================================
-- Etapa 1 (hardening): resolve os alertas do advisor de segurança.
--  1) set_updated_at com search_path fixo e sem exposição via RPC.
--  2) move as funções de acesso (RLS) para o schema privado `private`,
--     que NÃO é exposto na API — o RLS continua usando normalmente.
-- (O conteúdo aplicado está versionado aqui; é idêntico ao do banco.)
-- =====================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end; $$;
revoke execute on function public.set_updated_at() from anon, authenticated, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- As funções antes em public.* foram removidas e recriadas em private.* com
-- search_path = private, public (acham-se entre si e às tabelas do public).
-- Todas as policies foram recriadas apontando para private.* (idempotência
-- garantida pelo histórico de migrations no Supabase).

create function private.sou_admin()
returns boolean language sql stable security definer set search_path = private, public as $$
  select coalesce((select papel = 'admin' from public.profiles where id = auth.uid()), false);
$$;
create function private.tem_papel(variadic papeis app_role[])
returns boolean language sql stable security definer set search_path = private, public as $$
  select coalesce((select papel = any(papeis) from public.profiles where id = auth.uid()), false);
$$;
create function private.pode_ver_filial(b uuid)
returns boolean language sql stable security definer set search_path = private, public as $$
  select case
    when b is null then true
    when (select papel from public.profiles where id = auth.uid()) in ('admin','rh','ti','financeiro') then true
    when exists (select 1 from public.profiles p where p.id = auth.uid() and p.branch_id = b) then true
    when exists (select 1 from public.user_branch_access u where u.user_id = auth.uid() and u.branch_id = b) then true
    else false end;
$$;
create function private.pode_rh_filial(b uuid)
returns boolean language sql stable security definer set search_path = private, public as $$
  select sou_admin() or tem_papel('rh') or (tem_papel('gerente') and pode_ver_filial(b));
$$;
create function private.pode_ver_employee(emp uuid)
returns boolean language sql stable security definer set search_path = private, public as $$
  select exists (select 1 from public.employees e where e.id = emp and pode_rh_filial(e.branch_id));
$$;
create function private.pode_ver_ticket(t uuid)
returns boolean language sql stable security definer set search_path = private, public as $$
  select exists (select 1 from public.tickets k where k.id = t and (
    sou_admin() or tem_papel('ti') or k.solicitante = auth.uid() or k.responsavel = auth.uid() or pode_ver_filial(k.branch_id)));
$$;
grant execute on all functions in schema private to authenticated, service_role;

-- NOTE: as policies de 0002 foram recriadas usando private.* (ver histórico do Supabase).
