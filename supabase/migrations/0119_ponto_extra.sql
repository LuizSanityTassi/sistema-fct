-- Ponto com 4 batidas livres (1ª entrada, 1ª saída, 2ª entrada, 2ª saída: os códigos no banco continuam os mesmos, mudam só os
-- nomes na tela) e entrada e saída extra, que só valem com liberação do RH/DP a partir de um chamado.
alter table public.ponto_marcacoes drop constraint ponto_marcacoes_tipo_check;
alter table public.ponto_marcacoes add constraint ponto_marcacoes_tipo_check
  check (tipo in ('entrada', 'intervalo_inicio', 'intervalo_fim', 'saida', 'entrada_extra', 'saida_extra'));
alter table public.ponto_ajustes drop constraint ponto_ajustes_tipo_marcacao_check;
alter table public.ponto_ajustes add constraint ponto_ajustes_tipo_marcacao_check
  check (tipo_marcacao in ('entrada', 'intervalo_inicio', 'intervalo_fim', 'saida', 'entrada_extra', 'saida_extra'));

-- Cada liberação vale para um dia e uma entrada extra (com a saída dela). O chamado é obrigatório.
create table public.ponto_extras_liberadas (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  dia date not null,
  ticket_id uuid not null references public.tickets (id),
  liberado_por uuid references public.profiles (id) on delete set null,
  liberado_em timestamptz not null default now(),
  cancelado_em timestamptz,
  cancelado_por uuid references public.profiles (id) on delete set null
);
create unique index ponto_extras_uma_por_chamado on public.ponto_extras_liberadas (employee_id, dia, ticket_id) where cancelado_em is null;
create index ponto_extras_ticket_idx on public.ponto_extras_liberadas (ticket_id);
create index ponto_extras_liberado_por_idx on public.ponto_extras_liberadas (liberado_por);
create index ponto_extras_cancelado_por_idx on public.ponto_extras_liberadas (cancelado_por);
alter table public.ponto_extras_liberadas enable row level security;
create policy pext_sel on public.ponto_extras_liberadas for select to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('rh')) or private.pode_ver_ponto_func(employee_id));

-- Quantas entradas extras a pessoa ainda pode bater hoje.
create function private.ponto_extras_disponiveis(p_employee uuid) returns integer
language sql stable security definer set search_path = public as $$
  select greatest(0,
    (select count(*) from public.ponto_extras_liberadas l
      where l.employee_id = p_employee and l.cancelado_em is null and l.dia = (now() at time zone 'America/Sao_Paulo')::date)
    - (select count(*) from public.ponto_marcacoes m
        where m.employee_id = p_employee and not m.anulada and m.tipo = 'entrada_extra'
          and (m.momento at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date))::integer;
$$;

-- A última batida é uma entrada extra, então falta a saída dela (vale mesmo passando da meia-noite, como o turno da noite).
create function private.ponto_em_extra(p_employee uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select m.tipo = 'entrada_extra' from public.ponto_marcacoes m
                    where m.employee_id = p_employee and not m.anulada and m.momento > now() - interval '16 hours'
                    order by m.momento desc limit 1), false);
$$;

-- Confere o tipo da batida. As 4 normais são livres; sem tipo, vale a próxima da sequência, contando só as normais de hoje.
create function private.ponto_tipo_valido(p_employee uuid, p_tipo text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  seq constant text[] := array['entrada', 'intervalo_inicio', 'intervalo_fim', 'saida'];
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  qtd int;
  ultima text;
begin
  if coalesce(p_tipo, '') = '' then
    select count(*) into qtd from public.ponto_marcacoes m
     where m.employee_id = p_employee and not m.anulada and m.tipo = any (seq) and (m.momento at time zone 'America/Sao_Paulo')::date = hoje;
    return seq[(qtd % 4) + 1];
  end if;
  if p_tipo = any (seq) then return p_tipo; end if;
  if p_tipo = 'saida_extra' then
    if not private.ponto_em_extra(p_employee) then
      raise exception 'A saída extra só vale depois de uma entrada extra.' using errcode = 'P0001';
    end if;
    return p_tipo;
  end if;
  if p_tipo = 'entrada_extra' then
    if private.ponto_extras_disponiveis(p_employee) = 0 then
      raise exception 'Entrada extra não liberada para hoje. Peça ao RH/DP por um chamado.' using errcode = 'P0001';
    end if;
    select m.tipo into ultima from public.ponto_marcacoes m
     where m.employee_id = p_employee and not m.anulada and (m.momento at time zone 'America/Sao_Paulo')::date = hoje
     order by m.momento desc limit 1;
    if ultima in ('entrada', 'intervalo_fim', 'entrada_extra') then
      raise exception 'Registre a saída antes da entrada extra.' using errcode = 'P0001';
    end if;
    return p_tipo;
  end if;
  raise exception 'Tipo de marcação inválido.' using errcode = 'P0001';
end $$;
revoke all on function private.ponto_extras_disponiveis(uuid) from public, anon, authenticated;
revoke all on function private.ponto_em_extra(uuid) from public, anon, authenticated;
revoke all on function private.ponto_tipo_valido(uuid, text) from public, anon, authenticated;

-- Botão "Liberar extra" na ficha e na equipe: só RH/DP e administrador, sempre com um chamado aberto desse tipo.
create function public.ponto_extra_liberar(p_employee uuid, p_dia date, p_ticket uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eu uuid := auth.uid();
  e record;
  t record;
  v_id uuid;
begin
  if eu is null or not (private.sou_admin() or private.tem_papel('rh')) then
    raise exception 'Só o RH/DP libera entrada e saída extra.' using errcode = 'P0001';
  end if;
  select id, nome, status into e from public.employees where id = p_employee;
  if e.id is null or e.status = 'desligado' then raise exception 'Funcionário não encontrado ou desligado.' using errcode = 'P0001'; end if;
  if p_dia is null or p_dia < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Escolha hoje ou um dia à frente.' using errcode = 'P0001';
  end if;
  select id, categoria, subcategoria, status into t from public.tickets where id = p_ticket;
  if t.id is null or t.categoria <> 'rh' or t.subcategoria is distinct from 'liberacao_extra' or t.status in ('resolvido', 'cancelado') then
    raise exception 'Escolha um chamado aberto de liberação de extra.' using errcode = 'P0001';
  end if;
  insert into public.ponto_extras_liberadas (employee_id, dia, ticket_id, liberado_por)
  values (e.id, p_dia, t.id, eu)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'Este chamado já liberou a extra desta pessoa neste dia.' using errcode = 'P0001';
  end if;
  insert into public.ticket_comments (ticket_id, author_id, comentario)
  values (t.id, eu, format('Entrada e saída extra liberadas para %s no dia %s.', e.nome, to_char(p_dia, 'DD/MM/YYYY')));
  insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_novo)
  values (eu, 'criar', 'ponto_extras_liberadas', v_id, jsonb_build_object('employee_id', e.id, 'dia', p_dia, 'ticket_id', t.id));
  return v_id;
end $$;
revoke all on function public.ponto_extra_liberar(uuid, date, uuid) from public, anon;
grant execute on function public.ponto_extra_liberar(uuid, date, uuid) to authenticated;

create function public.ponto_extra_cancelar(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  eu uuid := auth.uid();
begin
  if eu is null or not (private.sou_admin() or private.tem_papel('rh')) then
    raise exception 'Só o RH/DP cancela a liberação de extra.' using errcode = 'P0001';
  end if;
  update public.ponto_extras_liberadas set cancelado_em = now(), cancelado_por = eu where id = p_id and cancelado_em is null;
  if found then
    insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_novo)
    values (eu, 'editar', 'ponto_extras_liberadas', p_id, jsonb_build_object('liberacao', 'cancelada'));
  end if;
end $$;
revoke all on function public.ponto_extra_cancelar(uuid) from public, anon;
grant execute on function public.ponto_extra_cancelar(uuid) to authenticated;

-- O relógio passa a saber se a pessoa tem extra liberada; a sugestão conta só as 4 normais.
create or replace function public.ponto_relogio_identificar(p_branch uuid, p_matricula text)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
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
      from public.employees e
     where e.branch_id = p_branch and e.status <> 'desligado' and btrim(e.matricula) = btrim(p_matricula)
     limit 1) end;
$function$;

create or replace function public.ponto_digital_identificar(p_desafio uuid, p_employee uuid, p_dedo smallint, p_assinatura text) returns jsonb
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
             'extra_liberada', private.ponto_extras_disponiveis(e.id) > 0,
             'em_extra', private.ponto_em_extra(e.id),
             'qtd_hoje', (select count(*) from public.ponto_marcacoes m
                           where m.employee_id = e.id and not m.anulada and m.tipo in ('entrada', 'intervalo_inicio', 'intervalo_fim', 'saida')
                             and (m.momento at time zone 'America/Sao_Paulo')::date = v_hoje),
             'ultima', (select jsonb_build_object('tipo', m.tipo, 'momento', m.momento) from public.ponto_marcacoes m
                         where m.employee_id = e.id and not m.anulada and (m.momento at time zone 'America/Sao_Paulo')::date = v_hoje
                         order by m.momento desc limit 1))
      from public.employees e where e.id = p_employee);
end $$;

-- As duas formas de bater o ponto usam a mesma conferência do tipo.
create or replace function public.ponto_registrar(p_employee uuid, p_tipo text, p_metodo text, p_pin text, p_dispositivo text, p_ip text, p_latitude numeric, p_longitude numeric, p_precisao numeric)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
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

  if not (private.pode_ver_filial(e.branch_id) or private.relogio_da_filial(e.branch_id)) then raise exception 'Este relógio não atende a filial do funcionário.' using errcode = 'P0001'; end if;
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

  insert into public.ponto_marcacoes (employee_id, branch_id, momento, tipo, metodo, origem, dispositivo, ip, latitude, longitude, precisao_m, registrado_por)
  values (e.id, e.branch_id, now(), tipo, p_metodo, 'registro', left(p_dispositivo, 300), left(p_ip, 64), p_latitude, p_longitude, p_precisao, eu)
  returning * into nova;
  return jsonb_build_object('id', nova.id, 'nsr', nova.nsr, 'momento', nova.momento, 'tipo', nova.tipo, 'funcionario', e.nome);
end $function$;

create or replace function public.ponto_registrar_digital(p_desafio uuid, p_dedo smallint, p_assinatura text, p_tipo text, p_dispositivo text, p_ip text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
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
  tipo := private.ponto_tipo_valido(e.id, p_tipo);

  insert into public.ponto_marcacoes (employee_id, branch_id, momento, tipo, metodo, origem, dispositivo, ip, registrado_por)
  values (e.id, e.branch_id, now(), tipo, 'biometria', 'registro', left(p_dispositivo, 300), left(p_ip, 64), eu)
  returning * into nova;
  return jsonb_build_object('id', nova.id, 'nsr', nova.nsr, 'momento', nova.momento, 'tipo', nova.tipo, 'funcionario', e.nome);
end $$;
