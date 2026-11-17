-- 0149 — Ponto do escritório em qualquer filial (pedido do Luiz em 17/11/2026: "a gente bate o ponto na 1000, a matriz do
-- escritório, e consegue bater em qualquer uma"). Funcionário de unidade marcada com `ponto_qualquer_filial` (o escritório)
-- bate o ponto no relógio de QUALQUER filial, pela digital ou pela matrícula + PIN. A marcação continua na unidade dele
-- (é lá que o ponto é apurado); a filial do relógio onde bateu fica em `ponto_marcacoes.relogio_branch_id`.
-- Pela matrícula, o funcionário da própria filial vem primeiro; o do escritório só entra se a matrícula não for de ninguém da
-- filial e for de uma pessoa só no escritório (senão, pela digital).

alter table public.branches add column if not exists ponto_qualquer_filial boolean not null default false;
comment on column public.branches.ponto_qualquer_filial is 'Escritório: os funcionários desta unidade batem o ponto no relógio de qualquer filial.';
update public.branches set ponto_qualquer_filial = true where codigo in ('ADM', 'F016');

alter table public.ponto_marcacoes add column if not exists relogio_branch_id uuid references public.branches (id);
comment on column public.ponto_marcacoes.relogio_branch_id is 'Filial do relógio onde a marcação foi feita (quando o relógio informa).';

create or replace function private.ponto_livre(p_func_branch uuid) returns boolean
 language sql stable security definer set search_path to 'private', 'public' as $$
  select exists (select 1 from public.branches b where b.id = p_func_branch and b.ponto_qualquer_filial);
$$;

-- O relógio desta filial atende este funcionário? (a filial dele, ou o escritório em qualquer relógio que a pessoa logada opera)
create or replace function private.ponto_relogio_atende(p_func_branch uuid, p_relogio_branch uuid) returns boolean
 language sql stable security definer set search_path to 'private', 'public' as $$
  select private.pode_ver_filial(p_func_branch) or private.relogio_da_filial(p_func_branch)
      or (p_relogio_branch is not null and private.ponto_livre(p_func_branch)
          and (private.pode_ver_filial(p_relogio_branch) or private.relogio_da_filial(p_relogio_branch)));
$$;

-- matrícula → funcionário: da filial ou do escritório
create or replace function public.ponto_relogio_identificar(p_branch uuid, p_matricula text)
 returns jsonb language sql stable security definer set search_path to 'public' as $function$
  with c as (
    select e.id, e.nome, (e.branch_id = p_branch) propria
      from public.employees e
     where e.status <> 'desligado' and btrim(e.matricula) = btrim(p_matricula)
       and (e.branch_id = p_branch or private.ponto_livre(e.branch_id))
  ), escolhido as (
    select id, nome from c
     where propria or (not exists (select 1 from c where propria) and (select count(*) from c) = 1)
     order by propria desc limit 1
  )
  select case when not (private.pode_ver_filial(p_branch) or private.relogio_da_filial(p_branch)) then null else (
    select jsonb_build_object(
             'id', e.id, 'nome', e.nome,
             'tem_pin', exists (select 1 from public.ponto_pins p where p.employee_id = e.id),
             'tem_digital', exists (select 1 from public.ponto_digitais d where d.employee_id = e.id),
             'extra_liberada', private.ponto_extras_disponiveis(e.id) > 0,
             'em_extra', private.ponto_em_extra(e.id),
             'qtd_hoje', (select count(*) from public.ponto_marcacoes m
                           where m.employee_id = e.id and not m.anulada and m.tipo in ('entrada', 'intervalo_inicio', 'intervalo_fim', 'saida')
                             and (m.momento at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date),
             'ultima', (select jsonb_build_object('tipo', m.tipo, 'momento', m.momento) from public.ponto_marcacoes m
                         where m.employee_id = e.id and not m.anulada
                           and (m.momento at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
                         order by m.momento desc limit 1))
      from escolhido e) end;
$function$;

-- PIN: o relógio passa a filial dele (p_branch); sem ela, vale a regra antiga (só a filial do funcionário)
drop function if exists public.ponto_registrar(uuid, text, text, text, text, text, numeric, numeric, numeric);
create function public.ponto_registrar(p_employee uuid, p_tipo text, p_metodo text, p_pin text, p_dispositivo text, p_ip text,
                                       p_latitude numeric, p_longitude numeric, p_precisao numeric, p_branch uuid default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare
  eu uuid := auth.uid();
  e record;
  pin record;
  ultima timestamptz;
  tipo text;
  nova public.ponto_marcacoes;
begin
  if eu is null then raise exception 'Entre no sistema para registrar o ponto.' using errcode = 'P0001'; end if;
  if p_metodo is distinct from 'relogio_pin' then
    raise exception 'O ponto é registrado só no relógio da loja, com a matrícula e o PIN.' using errcode = 'P0001';
  end if;
  select id, nome, branch_id, status into e from public.employees where id = p_employee;
  if e.id is null or e.status = 'desligado' then raise exception 'Funcionário não encontrado ou desligado.' using errcode = 'P0001'; end if;

  if not private.ponto_relogio_atende(e.branch_id, p_branch) then raise exception 'Este relógio não atende a filial do funcionário.' using errcode = 'P0001'; end if;
  select * into pin from public.ponto_pins where employee_id = e.id;
  if pin.employee_id is null then raise exception 'Funcionário sem PIN cadastrado. Peça ao gestor para cadastrar.' using errcode = 'P0001'; end if;
  if pin.bloqueado_ate is not null and pin.bloqueado_ate > now() then
    raise exception 'PIN bloqueado por tentativas erradas. Tente de novo às %.', to_char(pin.bloqueado_ate at time zone 'America/Sao_Paulo', 'HH24:MI') using errcode = 'P0001';
  end if;
  if p_pin is null or crypt(p_pin, pin.pin_hash) <> pin.pin_hash then
    update public.ponto_pins set tentativas = tentativas + 1,
           bloqueado_ate = case when tentativas + 1 >= 5 then now() + interval '15 minutes' end
     where employee_id = e.id;
    return jsonb_build_object('erro', case when pin.tentativas + 1 >= 5 then 'PIN incorreto. Bloqueado por 15 minutos.'
                                            else 'PIN incorreto. Restam ' || (4 - pin.tentativas) || ' tentativa(s).' end);
  end if;
  update public.ponto_pins set tentativas = 0, bloqueado_ate = null where employee_id = e.id and (tentativas > 0 or bloqueado_ate is not null);

  select max(momento) into ultima from public.ponto_marcacoes where employee_id = e.id and not anulada;
  if ultima is not null and now() - ultima < interval '1 minute' then
    raise exception 'Marcação repetida: a última foi há menos de 1 minuto.' using errcode = 'P0001';
  end if;
  tipo := private.ponto_tipo_valido(e.id, p_tipo);

  insert into public.ponto_marcacoes (employee_id, branch_id, momento, tipo, metodo, origem, dispositivo, ip, latitude, longitude, precisao_m, registrado_por, relogio_branch_id)
  values (e.id, e.branch_id, now(), tipo, p_metodo, 'registro', left(p_dispositivo, 300), left(p_ip, 64), p_latitude, p_longitude, p_precisao, eu, p_branch)
  returning * into nova;
  return jsonb_build_object('id', nova.id, 'nsr', nova.nsr, 'momento', nova.momento, 'tipo', nova.tipo, 'funcionario', e.nome);
end $function$;
revoke all on function public.ponto_registrar(uuid, text, text, text, text, text, numeric, numeric, numeric, uuid) from public, anon;
grant execute on function public.ponto_registrar(uuid, text, text, text, text, text, numeric, numeric, numeric, uuid) to authenticated;

-- digital: a leitura leva também as digitais do escritório
create or replace function public.ponto_digital_iniciar_filial(p_branch uuid, p_leitor uuid) returns jsonb
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
   where (e.branch_id = p_branch or private.ponto_livre(e.branch_id)) and e.status <> 'desligado';
  if v_digitais is null then raise exception 'Nenhuma digital cadastrada nesta filial.' using errcode = 'P0001'; end if;

  insert into public.ponto_digital_desafios (id, leitor_id, nonce, expira)
  values (v_desafio, v_leitor.id, v_nonce, now() + interval '3 minutes');
  return jsonb_build_object('desafio', v_desafio, 'nonce', v_nonce, 'digitais', v_digitais);
end $$;

create or replace function public.ponto_digital_identificar(p_desafio uuid, p_employee uuid, p_dedo smallint, p_assinatura text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $function$
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
                     where x.employee_id = p_employee and x.dedo = p_dedo and e.status <> 'desligado'
                       and (e.branch_id = d.branch_id or private.ponto_livre(e.branch_id))) then
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
             'extra_liberada', private.ponto_extras_disponiveis(e.id) > 0,
             'em_extra', private.ponto_em_extra(e.id),
             'qtd_hoje', (select count(*) from public.ponto_marcacoes m
                           where m.employee_id = e.id and not m.anulada and m.tipo in ('entrada', 'intervalo_inicio', 'intervalo_fim', 'saida')
                             and (m.momento at time zone 'America/Sao_Paulo')::date = v_hoje),
             'ultima', (select jsonb_build_object('tipo', m.tipo, 'momento', m.momento) from public.ponto_marcacoes m
                         where m.employee_id = e.id and not m.anulada and (m.momento at time zone 'America/Sao_Paulo')::date = v_hoje
                         order by m.momento desc limit 1))
      from public.employees e where e.id = p_employee);
end $function$;

create or replace function public.ponto_registrar_digital(p_desafio uuid, p_dedo smallint, p_assinatura text, p_tipo text, p_dispositivo text, p_ip text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare
  eu uuid := auth.uid();
  d record;
  e record;
  v_chave text;
  v_segredo text;
  ultima timestamptz;
  tipo text;
  nova public.ponto_marcacoes;
begin
  if eu is null then raise exception 'Entre no sistema para registrar o ponto.' using errcode = 'P0001'; end if;
  select x.id, x.employee_id, x.leitor_id, x.nonce, x.expira, x.usado_em, l.ativo, l.segredo_cifrado, l.branch_id as leitor_branch into d
    from public.ponto_digital_desafios x join public.ponto_leitores l on l.id = x.leitor_id
   where x.id = p_desafio for update of x;
  if d.id is null or d.employee_id is null or d.usado_em is not null or d.expira < now() then
    raise exception 'A leitura da digital venceu. Coloque o dedo de novo.' using errcode = 'P0001';
  end if;
  select id, nome, branch_id, status into e from public.employees where id = d.employee_id;
  if e.id is null or e.status = 'desligado' then raise exception 'Funcionário não encontrado ou desligado.' using errcode = 'P0001'; end if;
  if not private.ponto_relogio_atende(e.branch_id, d.leitor_branch) then
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
  tipo := private.ponto_tipo_valido(e.id, p_tipo);

  insert into public.ponto_marcacoes (employee_id, branch_id, momento, tipo, metodo, origem, dispositivo, ip, registrado_por, relogio_branch_id)
  values (e.id, e.branch_id, now(), tipo, 'biometria', 'registro', left(p_dispositivo, 300), left(p_ip, 64), eu, d.leitor_branch)
  returning * into nova;
  return jsonb_build_object('id', nova.id, 'nsr', nova.nsr, 'momento', nova.momento, 'tipo', nova.tipo, 'funcionario', e.nome);
end $function$;

-- a filial do relógio também não se altera depois de gravada
create or replace function private.ponto_marcacao_imutavel()
 returns trigger language plpgsql set search_path to 'private', 'public' as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'Marcação de ponto não se apaga: anule com motivo.' using errcode = 'P0001';
  end if;
  if (new.employee_id, new.branch_id, new.momento, new.tipo, new.metodo, new.origem, new.nsr, new.dispositivo, new.ip,
      new.latitude, new.longitude, new.precisao_m, new.registrado_por, new.ajuste_id, new.created_at, new.relogio_branch_id) is distinct from
     (old.employee_id, old.branch_id, old.momento, old.tipo, old.metodo, old.origem, old.nsr, old.dispositivo, old.ip,
      old.latitude, old.longitude, old.precisao_m, old.registrado_por, old.ajuste_id, old.created_at, old.relogio_branch_id)
     or (old.anulada and not new.anulada) then
    raise exception 'Marcação de ponto não se altera: anule e registre outra (pedido de ajuste).' using errcode = 'P0001';
  end if;
  return new;
end $function$;
