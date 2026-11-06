-- Auditoria de 06/11/2026 — grupo 1 (segurança).
-- AL-06: usuário desativado (profiles.ativo = false) perde o acesso também pelo banco, não só pelas telas.
--        As funções de permissão do RLS passam a exigir ativo. Sem usuário (service_role/cron) nada muda.
-- AL-01: as senhas das integrações (Omie, Trier, SMTP) deixam de poder ser lidas pela API com o login do usuário.
--        O servidor confere o papel (integracao_posso_ler) e lê pela função de serviço, que só a service_role executa.
-- AL-02: em sistema_config o financeiro grava só as chaves das telas dele; chaves de robô (tokens) só o administrador.
-- BA-06: search_path fixo nas duas funções que não tinham.

create or replace function private.sou_admin()
returns boolean language sql stable security definer set search_path = private, public as $$
  select coalesce((select (papel = 'admin' or admin_sistema) and ativo from public.profiles where id = auth.uid()), false);
$$;

create or replace function private.tem_papel(variadic papeis app_role[])
returns boolean language sql stable security definer set search_path = private, public as $$
  select coalesce((select ativo and (papel = any (papeis) or (admin_sistema and 'admin'::app_role = any (papeis)))
                   from public.profiles where id = auth.uid()), false);
$$;

create or replace function private.meu_employee()
returns uuid language sql stable security definer set search_path = private, public as $$
  select employee_id from public.profiles where id = auth.uid() and ativo;
$$;

create or replace function private.pode_ver_filial(b uuid)
returns boolean language sql stable security definer set search_path = private, public as $$
  select case
    -- logado mas desativado (ou sem perfil): não vê nada
    when auth.uid() is not null and not coalesce((select ativo from public.profiles where id = auth.uid()), false) then false
    when (select papel from public.profiles where id = auth.uid()) = 'relogio' then false
    when b is null then true
    when (select papel from public.profiles where id = auth.uid()) in ('admin','rh','ti','financeiro') then true
    when coalesce((select admin_sistema from public.profiles where id = auth.uid()), false) then true
    when exists (select 1 from public.profiles p where p.id = auth.uid() and p.branch_id = b) then true
    when exists (select 1 from public.user_branch_access u where u.user_id = auth.uid() and u.branch_id = b) then true
    when private.coordena_filial(b) then true
    else false
  end;
$$;

-- Desativar no cadastro bloqueia o login de verdade (e encerra as sessões abertas); reativar libera de novo.
-- Vale para qualquer caminho que mude profiles.ativo (tela de usuários, SQL, desligamento).
create or replace function private.profile_ativo_login()
returns trigger language plpgsql security definer set search_path = private, public, auth as $$
begin
  if new.ativo is distinct from old.ativo then
    if new.ativo then
      update auth.users set banned_until = null where id = new.id;
    else
      update auth.users set banned_until = 'infinity' where id = new.id;
      delete from auth.sessions where user_id = new.id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.profile_ativo_login() from public, anon, authenticated;
drop trigger if exists t_profile_ativo_login on public.profiles;
create trigger t_profile_ativo_login after update of ativo on public.profiles
  for each row execute function private.profile_ativo_login();

-- quem já estava desativado antes desta migração também fica bloqueado
update auth.users u set banned_until = 'infinity'
  from public.profiles p where p.id = u.id and not p.ativo and (u.banned_until is null or u.banned_until < now());

-- ---------- segredos das integrações ----------
-- quem pode operar as integrações (o servidor pergunta antes de ler pela função de serviço)
create or replace function public.integracao_posso_ler()
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.sou_admin() or private.tem_papel('financeiro');
$$;
revoke all on function public.integracao_posso_ler() from public, anon;
grant execute on function public.integracao_posso_ler() to authenticated;

-- a leitura em texto puro some da API dos usuários: só a service_role (servidor) lê
revoke all on function public.integracao_ler_segredos(text[]) from public, anon, authenticated;
revoke all on function public.integracao_ler_segredos_servico(text[]) from public, anon, authenticated;
grant execute on function public.integracao_ler_segredos_servico(text[]) to service_role;

-- ---------- sistema_config ----------
drop policy if exists scfg_ins on public.sistema_config;
drop policy if exists scfg_upd on public.sistema_config;
create policy scfg_ins on public.sistema_config for insert to authenticated
  with check ((select private.sou_admin())
              or ((select private.tem_papel('financeiro')) and chave in ('caixa_avisos', 'dre_lembrete')));
create policy scfg_upd on public.sistema_config for update to authenticated
  using ((select private.sou_admin())
         or ((select private.tem_papel('financeiro')) and chave in ('caixa_avisos', 'dre_lembrete')))
  with check ((select private.sou_admin())
              or ((select private.tem_papel('financeiro')) and chave in ('caixa_avisos', 'dre_lembrete')));

-- ---------- search_path ----------
alter function private.dre_manual(date, text) set search_path = private, public;
alter function private.operacao_inicio() set search_path = private, public;
