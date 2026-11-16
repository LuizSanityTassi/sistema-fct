-- Diretor de Compras: papel cujas telas o administrador escolhe uma a uma (acesso_telas) e que só CONSULTA os dados.
-- profiles.papeis_leitura = papéis cujos dados ele lê (saem das telas marcadas, gravados pela tela de usuários).
-- Leitura sem escrita: o PostgREST roda GET (e RPC STABLE) em transação só leitura; insert/update/delete rodam em
-- leitura e escrita. A permissão do diretor vale só quando transaction_read_only = on.

alter type public.app_role add value if not exists 'diretor_compras';

alter table public.profiles add column if not exists papeis_leitura text[] not null default '{}';

create or replace function private.tem_papel(variadic papeis app_role[])
returns boolean
language sql
stable security definer
set search_path to 'private', 'public'
as $$
  select coalesce((select ativo and (papel = any (papeis)
                     or (admin_sistema and 'admin'::app_role = any (papeis))
                     or (papel::text = 'diretor_compras' and papeis_leitura && papeis::text[]
                         and current_setting('transaction_read_only') = 'on'))
                   from public.profiles where id = auth.uid()), false);
$$;

create or replace function private.pode_ver_filial(b uuid)
returns boolean
language sql
stable security definer
set search_path to 'private', 'public'
as $$
  select case
    -- logado mas desativado (ou sem perfil): não vê nada
    when auth.uid() is not null and not coalesce((select ativo from public.profiles where id = auth.uid()), false) then false
    when (select papel from public.profiles where id = auth.uid()) = 'relogio' then false
    when b is null then true
    when (select papel from public.profiles where id = auth.uid()) in ('admin','rh','ti','financeiro') then true
    -- diretor de compras: todas as lojas, só para consultar
    when (select papel::text from public.profiles where id = auth.uid()) = 'diretor_compras' and current_setting('transaction_read_only') = 'on' then true
    when coalesce((select admin_sistema from public.profiles where id = auth.uid()), false) then true
    when exists (select 1 from public.profiles p where p.id = auth.uid() and p.branch_id = b) then true
    when exists (select 1 from public.user_branch_access u where u.user_id = auth.uid() and u.branch_id = b) then true
    when private.coordena_filial(b) then true
    else false
  end;
$$;

-- só o administrador mexe nos papéis que o diretor lê
create or replace function private.proteger_campos_perfil()
returns trigger
language plpgsql
security definer
set search_path to 'private', 'public'
as $$
begin
  -- ninguém tira o próprio bloqueio, nem administrador
  if auth.uid() is not null and new.id = auth.uid() then
    new.modulos_bloqueados := old.modulos_bloqueados;
  end if;
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
  new.convite_enviado_em := old.convite_enviado_em;
  new.modulos_bloqueados := old.modulos_bloqueados;
  new.papeis_leitura := old.papeis_leitura;
  return new;
end;
$$;
