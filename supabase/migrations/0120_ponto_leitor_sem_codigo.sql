-- O leitor de digital não usa mais código de ativação: ele se ativa sozinho quando o relógio abre no computador da loja.
-- Quem pode: administrador, TI e RH em qualquer filial. O login do relógio, o gerente e o coordenador só no primeiro computador da
-- filial; depois disso, um computador novo só entra com um dos três primeiros. Sem essa trava, qualquer pessoa com acesso ao relógio
-- poderia ligar outro computador e bater o ponto pelos colegas. Leitor desativado também só volta por um deles.
create or replace function public.ponto_leitor_garantir(p_branch uuid, p_leitor uuid, p_nome text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  eu uuid := auth.uid();
  v_gestor boolean;
  v_atual record;
  v_id uuid;
  v_chave text;
  v_segredo text;
begin
  if eu is null or not (private.pode_ver_filial(p_branch) or private.relogio_da_filial(p_branch)) then
    raise exception 'Este relógio não atende esta filial.' using errcode = 'P0001';
  end if;
  select id, branch_id, ativo, segredo_cifrado into v_atual from public.ponto_leitores where id = p_leitor;
  if v_atual.id is not null and v_atual.branch_id = p_branch and v_atual.ativo and v_atual.segredo_cifrado is not null then
    return jsonb_build_object('id', v_atual.id);
  end if;

  v_gestor := private.sou_admin() or private.tem_papel('rh', 'ti');
  if not v_gestor then
    if v_atual.id is not null
       or exists (select 1 from public.ponto_leitores l where l.branch_id = p_branch and l.ativado_em is not null)
       or not (private.relogio_da_filial(p_branch) or (private.tem_papel('gerente', 'coordenador') and private.pode_ver_filial(p_branch))) then
      return jsonb_build_object('precisa_admin', true);
    end if;
  end if;

  -- o computador mudou de filial: o leitor antigo dele deixa de valer
  if v_atual.id is not null and v_atual.ativo then
    update public.ponto_leitores set ativo = false, segredo_cifrado = null where id = v_atual.id;
    insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_novo)
    values (eu, 'editar', 'ponto_leitores', v_atual.id, jsonb_build_object('leitor', 'trocou de filial'));
  end if;

  v_segredo := encode(gen_random_bytes(32), 'hex');
  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'ponto_digital_chave';
  insert into public.ponto_leitores (branch_id, nome, segredo_cifrado, ativado_em, criado_por)
  values (p_branch, left(p_nome, 100), pgp_sym_encrypt(v_segredo, v_chave), now(), eu)
  returning id into v_id;
  insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_novo)
  values (eu, 'criar', 'ponto_leitores', v_id, jsonb_build_object('branch_id', p_branch, 'leitor', 'ativado ao abrir o relógio'));
  return jsonb_build_object('id', v_id, 'segredo', v_segredo);
end $$;
revoke all on function public.ponto_leitor_garantir(uuid, uuid, text) from public, anon;
grant execute on function public.ponto_leitor_garantir(uuid, uuid, text) to authenticated;

drop function if exists public.ponto_leitor_gerar_codigo(uuid);
drop function if exists public.ponto_leitor_ativar(uuid, text, text);

-- A lista mostra só leitores ativados (códigos antigos que ninguém usou ficam de fora).
create or replace function public.ponto_leitores_lista() returns table (id uuid, branch_id uuid, nome text, ativo boolean, ativado_em timestamptz, codigo_expira timestamptz, ultimo_uso timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, l.branch_id, l.nome, l.ativo, l.ativado_em, l.codigo_expira, l.ultimo_uso
    from public.ponto_leitores l
   where private.sou_admin() and l.ativado_em is not null
   order by l.criado_em desc;
$$;
