-- Bater o ponto só com o dedo: o relógio não pede mais a matrícula, o programa do leitor descobre quem é entre as digitais da
-- filial. Nada de digital aberta sai do banco: cada digital vai cifrada com uma chave que depende do segredo do computador, da
-- leitura e do dono da digital. Trocar no navegador o dono de uma digital faz a abertura falhar, então não sai assinatura em nome
-- de outra pessoa. A leitura só nasce quando já tem um dedo no leitor (a espera do dedo não passa pelo servidor).
alter table public.ponto_digital_desafios alter column employee_id drop not null;

-- A conferência de uma pessoa só (matrícula + dedo) saiu do relógio.
drop function public.ponto_digital_iniciar(uuid, uuid);

create function public.ponto_digital_iniciar_filial(p_branch uuid, p_leitor uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_leitor record;
  v_chave text;
  v_segredo text;
  v_desafio uuid := gen_random_uuid();
  v_nonce text := encode(gen_random_bytes(16), 'hex');
  v_digitais jsonb;
begin
  if auth.uid() is null then raise exception 'Entre no sistema para registrar o ponto.' using errcode = 'P0001'; end if;
  if not (private.pode_ver_filial(p_branch) or private.relogio_da_filial(p_branch)) then
    raise exception 'Este relógio não atende esta filial.' using errcode = 'P0001';
  end if;
  select id, branch_id, segredo_cifrado into v_leitor from public.ponto_leitores where id = p_leitor and ativo and segredo_cifrado is not null;
  if v_leitor.id is null or v_leitor.branch_id <> p_branch then
    raise exception 'O leitor deste computador não está ativado para esta filial.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.ponto_digital_desafios d where d.leitor_id = v_leitor.id and d.criado_em > now() - interval '15 minutes') >= 120 then
    raise exception 'Muitas tentativas com a digital. Espere alguns minutos ou use a matrícula e o PIN.' using errcode = 'P0001';
  end if;
  delete from public.ponto_digital_desafios where expira < now() - interval '1 day';

  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'ponto_digital_chave';
  v_segredo := pgp_sym_decrypt(v_leitor.segredo_cifrado, v_chave);
  select jsonb_agg(jsonb_build_object(
           'employee', d.employee_id,
           'dedo', d.dedo,
           'iv', translate(encode(x.iv, 'base64'), E'\n', ''),
           'cifra', translate(encode(encrypt_iv(
              convert_to(pgp_sym_decrypt(d.template_cifrado, v_chave), 'UTF8'),
              digest(v_segredo || ':' || v_desafio::text || ':' || d.employee_id::text || ':' || d.dedo::text, 'sha256'),
              x.iv, 'aes-cbc/pad:pkcs'), 'base64'), E'\n', '')))
    into v_digitais
    from public.ponto_digitais d
    join public.employees e on e.id = d.employee_id
   cross join lateral (select gen_random_bytes(16) as iv where d.dedo is not null) x
   where e.branch_id = p_branch and e.status <> 'desligado';
  if v_digitais is null then raise exception 'Nenhuma digital cadastrada nesta filial.' using errcode = 'P0001'; end if;

  insert into public.ponto_digital_desafios (id, leitor_id, nonce, expira)
  values (v_desafio, v_leitor.id, v_nonce, now() + interval '3 minutes');
  return jsonb_build_object('desafio', v_desafio, 'nonce', v_nonce, 'digitais', v_digitais);
end $$;
revoke all on function public.ponto_digital_iniciar_filial(uuid, uuid) from public, anon;
grant execute on function public.ponto_digital_iniciar_filial(uuid, uuid) to authenticated;

-- Depois da assinatura do programa do leitor: a leitura fica presa àquela pessoa e o relógio recebe o nome e a sugestão do tipo.
create function public.ponto_digital_identificar(p_desafio uuid, p_employee uuid, p_dedo smallint, p_assinatura text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  d record;
  v_chave text;
  v_segredo text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if auth.uid() is null then raise exception 'Entre no sistema para registrar o ponto.' using errcode = 'P0001'; end if;
  select x.id, x.employee_id, x.leitor_id, x.nonce, x.expira, x.usado_em, l.ativo, l.branch_id, l.segredo_cifrado into d
    from public.ponto_digital_desafios x join public.ponto_leitores l on l.id = x.leitor_id
   where x.id = p_desafio for update of x;
  if d.id is null or d.usado_em is not null or d.expira < now() or d.employee_id is not null then
    raise exception 'A leitura da digital venceu. Coloque o dedo de novo.' using errcode = 'P0001';
  end if;
  if not (private.pode_ver_filial(d.branch_id) or private.relogio_da_filial(d.branch_id)) then
    raise exception 'Este relógio não atende a filial do leitor.' using errcode = 'P0001';
  end if;
  if not d.ativo or d.segredo_cifrado is null then
    raise exception 'O leitor deste computador foi desativado. Use a matrícula e o PIN.' using errcode = 'P0001';
  end if;

  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'ponto_digital_chave';
  v_segredo := pgp_sym_decrypt(d.segredo_cifrado, v_chave);
  if lower(coalesce(p_assinatura, '')) <> encode(hmac(d.id::text || '|' || d.nonce || '|' || p_employee::text || '|' || p_dedo::text, v_segredo, 'sha256'), 'hex')
     or not exists (select 1 from public.ponto_digitais x join public.employees e on e.id = x.employee_id
                     where x.employee_id = p_employee and x.dedo = p_dedo and e.branch_id = d.branch_id and e.status <> 'desligado') then
    update public.ponto_digital_desafios set usado_em = now() where id = d.id;
    insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_novo)
    values (auth.uid(), 'editar', 'ponto_digital_desafios', d.id, jsonb_build_object('employee_id', p_employee, 'digital', 'assinatura recusada'));
    return jsonb_build_object('erro', 'Não foi possível confirmar a digital. Tente de novo ou use a matrícula e o PIN.');
  end if;
  update public.ponto_digital_desafios set employee_id = p_employee where id = d.id;

  return (
    select jsonb_build_object(
             'id', e.id, 'nome', e.nome,
             'tem_pin', exists (select 1 from public.ponto_pins p where p.employee_id = e.id),
             'tem_digital', true,
             'qtd_hoje', (select count(*) from public.ponto_marcacoes m
                           where m.employee_id = e.id and not m.anulada and (m.momento at time zone 'America/Sao_Paulo')::date = v_hoje),
             'ultima', (select jsonb_build_object('tipo', m.tipo, 'momento', m.momento) from public.ponto_marcacoes m
                         where m.employee_id = e.id and not m.anulada and (m.momento at time zone 'America/Sao_Paulo')::date = v_hoje
                         order by m.momento desc limit 1))
      from public.employees e where e.id = p_employee);
end $$;
revoke all on function public.ponto_digital_identificar(uuid, uuid, smallint, text) from public, anon;
grant execute on function public.ponto_digital_identificar(uuid, uuid, smallint, text) to authenticated;

-- A assinatura agora inclui a pessoa. As regras de repetição e de sequência continuam as de ponto_registrar.
create or replace function public.ponto_registrar_digital(p_desafio uuid, p_dedo smallint, p_assinatura text, p_tipo text, p_dispositivo text, p_ip text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  eu uuid := auth.uid();
  d record;
  e record;
  v_chave text;
  v_segredo text;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  qtd int;
  ultima timestamptz;
  seq text[] := array['entrada', 'intervalo_inicio', 'intervalo_fim', 'saida'];
  tipo text;
  nova public.ponto_marcacoes;
begin
  if eu is null then raise exception 'Entre no sistema para registrar o ponto.' using errcode = 'P0001'; end if;
  select x.id, x.employee_id, x.leitor_id, x.nonce, x.expira, x.usado_em, l.ativo, l.segredo_cifrado into d
    from public.ponto_digital_desafios x join public.ponto_leitores l on l.id = x.leitor_id
   where x.id = p_desafio for update of x;
  if d.id is null or d.employee_id is null or d.usado_em is not null or d.expira < now() then
    raise exception 'A leitura da digital venceu. Coloque o dedo de novo.' using errcode = 'P0001';
  end if;
  select id, nome, branch_id, status into e from public.employees where id = d.employee_id;
  if e.id is null or e.status = 'desligado' then raise exception 'Funcionário não encontrado ou desligado.' using errcode = 'P0001'; end if;
  if not (private.pode_ver_filial(e.branch_id) or private.relogio_da_filial(e.branch_id)) then
    raise exception 'Este relógio não atende a filial do funcionário.' using errcode = 'P0001';
  end if;
  if not d.ativo or d.segredo_cifrado is null then
    raise exception 'O leitor deste computador foi desativado. Use a matrícula e o PIN.' using errcode = 'P0001';
  end if;

  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'ponto_digital_chave';
  v_segredo := pgp_sym_decrypt(d.segredo_cifrado, v_chave);
  update public.ponto_digital_desafios set usado_em = now() where id = d.id;
  if lower(coalesce(p_assinatura, '')) <> encode(hmac(d.id::text || '|' || d.nonce || '|' || e.id::text || '|' || p_dedo::text, v_segredo, 'sha256'), 'hex')
     or not exists (select 1 from public.ponto_digitais x where x.employee_id = e.id and x.dedo = p_dedo) then
    insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_novo)
    values (eu, 'editar', 'ponto_digital_desafios', d.id, jsonb_build_object('employee_id', e.id, 'digital', 'assinatura recusada'));
    return jsonb_build_object('erro', 'Não foi possível confirmar a digital. Tente de novo ou use a matrícula e o PIN.');
  end if;
  update public.ponto_leitores set ultimo_uso = now() where id = d.leitor_id;

  select max(momento) into ultima from public.ponto_marcacoes where employee_id = e.id and not anulada;
  if ultima is not null and now() - ultima < interval '1 minute' then
    raise exception 'Marcação repetida: a última foi há menos de 1 minuto.' using errcode = 'P0001';
  end if;
  select count(*) into qtd from public.ponto_marcacoes
   where employee_id = e.id and not anulada and (momento at time zone 'America/Sao_Paulo')::date = hoje;
  tipo := coalesce(nullif(p_tipo, ''), seq[(qtd % 4) + 1]);
  if not tipo = any (seq) then raise exception 'Tipo de marcação inválido.' using errcode = 'P0001'; end if;

  insert into public.ponto_marcacoes (employee_id, branch_id, momento, tipo, metodo, origem, dispositivo, ip, registrado_por)
  values (e.id, e.branch_id, now(), tipo, 'biometria', 'registro', left(p_dispositivo, 300), left(p_ip, 64), eu)
  returning * into nova;
  return jsonb_build_object('id', nova.id, 'nsr', nova.nsr, 'momento', nova.momento, 'tipo', nova.tipo, 'funcionario', e.nome);
end $$;
