-- Logins criados sem e-mail: a conta existe (sem senha) e o admin escolhe quando mandar o convite.
-- convite_enviado_em = quando o sistema mandou o convite (null = ainda não mandou).
alter table public.profiles add column if not exists convite_enviado_em timestamptz;

-- quem já foi convidado pelo Supabase antes desta coluna não aparece como pendente
update public.profiles p
set convite_enviado_em = u.invited_at
from auth.users u
where u.id = p.id and u.invited_at is not null and p.convite_enviado_em is null;

-- só o admin mexe na data do convite (o próprio usuário não)
create or replace function private.proteger_campos_perfil()
returns trigger
language plpgsql
security definer
set search_path to 'private', 'public'
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
  new.convite_enviado_em := old.convite_enviado_em;
  return new;
end;
$$;

-- Situação do acesso de cada usuário (só admin): confirmou o e-mail/criou a senha, quando foi convidado, último login.
create or replace function public.usuarios_acesso()
returns table (id uuid, confirmado boolean, convidado_em timestamptz, ultimo_login timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email_confirmed_at is not null, coalesce(p.convite_enviado_em, u.invited_at), u.last_sign_in_at
  from auth.users u
  join public.profiles p on p.id = u.id
  where (select private.sou_admin());
$$;
revoke all on function public.usuarios_acesso() from public, anon;
grant execute on function public.usuarios_acesso() to authenticated;
