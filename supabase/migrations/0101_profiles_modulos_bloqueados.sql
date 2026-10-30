-- Módulos bloqueados por pessoa (pedido do Luiz em 30/10/2026 para o Artur): o cargo continua o mesmo, mas os grupos
-- do menu listados aqui (título do grupo, ex.: 'Financeiro') somem do menu e as telas deles ficam sem acesso.
alter table public.profiles add column if not exists modulos_bloqueados text[] not null default '{}';

-- só o admin mexe nos bloqueios (o próprio usuário não)
create or replace function private.proteger_campos_perfil()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'private', 'public'
as $function$
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
  return new;
end;
$function$;
