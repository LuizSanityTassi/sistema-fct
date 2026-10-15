-- 0025 — Perfis: corrige "infinite recursion detected in policy for relation profiles".
-- A policy prof_upd_self consultava a própria tabela profiles no WITH CHECK (para impedir a troca do próprio papel).
-- Isso fazia QUALQUER update em profiles falhar: papel/filial no convite, editar e desativar usuário, último acesso.
-- Agora a policy só exige id = auth.uid(), e um gatilho mantém papel, filial, situação (ativo) e e-mail de quem não
-- é administrador. Sem o gatilho, só tirar a consulta abriria uma brecha (a pessoa trocaria a própria filial).
-- Não apaga dados; desfazer = drop trigger + voltar o WITH CHECK anterior.

create or replace function private.proteger_campos_perfil()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
begin
  -- administrador (e o próprio banco/serviço, sem usuário na requisição) altera tudo
  if auth.uid() is null or private.sou_admin() then
    return new;
  end if;
  new.id := old.id;
  new.papel := old.papel;
  new.branch_id := old.branch_id;
  new.ativo := old.ativo;
  new.email := old.email;
  return new;
end;
$$;

revoke all on function private.proteger_campos_perfil() from public, anon, authenticated;

drop trigger if exists t_profiles_proteger on public.profiles;
create trigger t_profiles_proteger
  before update on public.profiles
  for each row execute function private.proteger_campos_perfil();

alter policy prof_upd_self on public.profiles
  using (id = auth.uid())
  with check (id = auth.uid());
