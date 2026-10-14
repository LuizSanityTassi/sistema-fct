-- 0023 — Integrações configuráveis pela tela (Configurações → Integrações).
-- Segredos (usuário/senha do Trier, app_key/app_secret da Omie) ficam no Supabase Vault (criptografado) e só passam
-- por estas funções security definer: o administrador grava; administrador e financeiro leem (são quem opera o robô do
-- Trier e o envio ao Omie). Nenhum valor chega ao navegador: as telas recebem só "configurado" e o final da chave.
-- Variáveis de ambiente (TRIER_*, OMIE_*) continuam valendo como alternativa.

create or replace function public.integracao_salvar_segredo(p_nome text, p_valor text)
returns void
language plpgsql security definer
set search_path = public, vault
as $$
declare v_id uuid;
begin
  if not private.sou_admin() then raise exception 'Só o administrador altera integrações.'; end if;
  if p_nome !~ '^integ_[a-z0-9_]{3,60}$' then raise exception 'Nome de segredo inválido.'; end if;
  select id into v_id from vault.secrets where name = p_nome;
  if p_valor is null or btrim(p_valor) = '' then
    if v_id is not null then delete from vault.secrets where id = v_id; end if;
    return;
  end if;
  if v_id is null then
    perform vault.create_secret(p_valor, p_nome, 'Integração do Sistema FCT');
  else
    perform vault.update_secret(v_id, p_valor, p_nome, 'Integração do Sistema FCT');
  end if;
end $$;

create or replace function public.integracao_ler_segredos(p_nomes text[])
returns table (nome text, valor text)
language sql stable security definer
set search_path = public, vault
as $$
  select s.name, s.decrypted_secret
    from vault.decrypted_secrets s
   where s.name = any (p_nomes)
     and s.name like 'integ\_%'
     and (private.sou_admin() or private.tem_papel('financeiro'))
$$;

create or replace function public.integracao_status_segredos()
returns table (nome text, final text, atualizado_em timestamptz)
language sql stable security definer
set search_path = public, vault
as $$
  select s.name, right(s.decrypted_secret, 4), s.updated_at
    from vault.decrypted_secrets s
   where s.name like 'integ\_%'
     and (private.sou_admin() or private.tem_papel('financeiro', 'contador'))
$$;

revoke all on function public.integracao_salvar_segredo(text, text) from public, anon;
revoke all on function public.integracao_ler_segredos(text[]) from public, anon;
revoke all on function public.integracao_status_segredos() from public, anon;
grant execute on function public.integracao_salvar_segredo(text, text) to authenticated;
grant execute on function public.integracao_ler_segredos(text[]) to authenticated;
grant execute on function public.integracao_status_segredos() to authenticated;
