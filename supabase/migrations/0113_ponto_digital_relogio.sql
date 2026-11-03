-- Bater o ponto com o dedo no relógio da filial. A comparação do dedo só pode rodar no computador da loja (a biblioteca do
-- leitor é do Windows), então cada computador ativado ganha um segredo que fica só nele e aqui, cifrado. O banco entrega a
-- digital cifrada com esse segredo e só aceita a marcação com a assinatura feita por ele: quem está logado no relógio não lê
-- a digital pelo navegador nem registra o ponto de outra pessoa sem o dedo dela. Cada leitura vale uma vez e vence em 3 minutos.
create table public.ponto_leitores (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  nome text,
  segredo_cifrado bytea,
  codigo_hash text,
  codigo_expira timestamptz,
  ativo boolean not null default true,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  ativado_em timestamptz,
  ultimo_uso timestamptz
);
create index ponto_leitores_branch_idx on public.ponto_leitores (branch_id);
create index ponto_leitores_criado_por_idx on public.ponto_leitores (criado_por);
alter table public.ponto_leitores enable row level security;

create table public.ponto_digital_desafios (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  leitor_id uuid not null references public.ponto_leitores (id) on delete cascade,
  nonce text not null,
  expira timestamptz not null,
  usado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index ponto_digital_desafios_employee_idx on public.ponto_digital_desafios (employee_id, criado_em);
create index ponto_digital_desafios_leitor_idx on public.ponto_digital_desafios (leitor_id);
create index ponto_digital_desafios_expira_idx on public.ponto_digital_desafios (expira);
alter table public.ponto_digital_desafios enable row level security;

-- Código de uso único que o administrador gera para ativar o leitor de uma filial (vence em 30 minutos).
create function public.ponto_leitor_gerar_codigo(p_branch uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := gen_random_bytes(8);
  v_codigo text := '';
  v_id uuid;
begin
  if auth.uid() is null or not private.sou_admin() then
    raise exception 'Só administradores ativam leitor de digital.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_branch) then
    raise exception 'Filial não encontrada.' using errcode = 'P0001';
  end if;
  for i in 0..7 loop
    v_codigo := v_codigo || substr(alfabeto, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  delete from public.ponto_leitores where branch_id = p_branch and ativado_em is null;
  insert into public.ponto_leitores (branch_id, codigo_hash, codigo_expira, criado_por)
  values (p_branch, encode(digest(v_codigo, 'sha256'), 'hex'), now() + interval '30 minutes', auth.uid())
  returning id into v_id;
  insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_novo)
  values (auth.uid(), 'criar', 'ponto_leitores', v_id, jsonb_build_object('branch_id', p_branch, 'codigo', 'gerado'));
  return v_codigo;
end $$;
revoke all on function public.ponto_leitor_gerar_codigo(uuid) from public, anon;
grant execute on function public.ponto_leitor_gerar_codigo(uuid) to authenticated;

-- O relógio troca o código pelo segredo, que vai para o programa do leitor e não sai mais daqui.
create function public.ponto_leitor_ativar(p_branch uuid, p_codigo text, p_nome text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
  v_chave text;
  v_segredo text := encode(gen_random_bytes(32), 'hex');
begin
  if auth.uid() is null or not (private.pode_ver_filial(p_branch) or private.relogio_da_filial(p_branch)) then
    raise exception 'Este relógio não atende esta filial.' using errcode = 'P0001';
  end if;
  select id into v_id from public.ponto_leitores
   where branch_id = p_branch and ativado_em is null and codigo_expira > now()
     and codigo_hash = encode(digest(upper(btrim(coalesce(p_codigo, ''))), 'sha256'), 'hex')
   for update;
  if v_id is null then
    raise exception 'Código inválido ou vencido. Gere outro em Ponto > Relógio da filial.' using errcode = 'P0001';
  end if;
  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'ponto_digital_chave';
  update public.ponto_leitores
     set segredo_cifrado = pgp_sym_encrypt(v_segredo, v_chave), codigo_hash = null, codigo_expira = null, ativado_em = now(), nome = left(p_nome, 100)
   where id = v_id;
  insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_novo)
  values (auth.uid(), 'editar', 'ponto_leitores', v_id, jsonb_build_object('leitor', 'ativado'));
  return jsonb_build_object('id', v_id, 'segredo', v_segredo);
end $$;
revoke all on function public.ponto_leitor_ativar(uuid, text, text) from public, anon;
grant execute on function public.ponto_leitor_ativar(uuid, text, text) to authenticated;

create function public.ponto_leitor_revogar(p_leitor uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not private.sou_admin() then
    raise exception 'Só administradores desativam leitor de digital.' using errcode = 'P0001';
  end if;
  update public.ponto_leitores set ativo = false, segredo_cifrado = null, codigo_hash = null, codigo_expira = null where id = p_leitor;
  insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_novo)
  values (auth.uid(), 'editar', 'ponto_leitores', p_leitor, jsonb_build_object('leitor', 'desativado'));
end $$;
revoke all on function public.ponto_leitor_revogar(uuid) from public, anon;
grant execute on function public.ponto_leitor_revogar(uuid) to authenticated;

create function public.ponto_leitores_lista() returns table (id uuid, branch_id uuid, nome text, ativo boolean, ativado_em timestamptz, codigo_expira timestamptz, ultimo_uso timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, l.branch_id, l.nome, l.ativo, l.ativado_em, l.codigo_expira, l.ultimo_uso
    from public.ponto_leitores l
   where private.sou_admin() and (l.ativado_em is not null or l.codigo_expira > now())
   order by l.criado_em desc;
$$;
revoke all on function public.ponto_leitores_lista() from public, anon;
grant execute on function public.ponto_leitores_lista() to authenticated;

-- Abre uma leitura: devolve as digitais cifradas com uma chave desta leitura, que só o programa do leitor consegue abrir.
create function public.ponto_digital_iniciar(p_employee uuid, p_leitor uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  e record;
  v_leitor record;
  v_chave text;
  v_segredo text;
  v_chave_cifra bytea;
  v_desafio uuid := gen_random_uuid();
  v_nonce text := encode(gen_random_bytes(16), 'hex');
  v_digitais jsonb;
begin
  if auth.uid() is null then raise exception 'Entre no sistema para registrar o ponto.' using errcode = 'P0001'; end if;
  select id, branch_id, status into e from public.employees where id = p_employee;
  if e.id is null or e.status = 'desligado' then raise exception 'Funcionário não encontrado ou desligado.' using errcode = 'P0001'; end if;
  if not (private.pode_ver_filial(e.branch_id) or private.relogio_da_filial(e.branch_id)) then
    raise exception 'Este relógio não atende a filial do funcionário.' using errcode = 'P0001';
  end if;
  select id, branch_id, segredo_cifrado into v_leitor from public.ponto_leitores where id = p_leitor and ativo and segredo_cifrado is not null;
  if v_leitor.id is null or v_leitor.branch_id <> e.branch_id then
    raise exception 'O leitor deste computador não está ativado para esta filial.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.ponto_digital_desafios d where d.employee_id = e.id and d.criado_em > now() - interval '15 minutes') >= 20 then
    raise exception 'Muitas tentativas com a digital. Espere alguns minutos ou use o PIN.' using errcode = 'P0001';
  end if;
  delete from public.ponto_digital_desafios where expira < now() - interval '1 day';

  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'ponto_digital_chave';
  v_segredo := pgp_sym_decrypt(v_leitor.segredo_cifrado, v_chave);
  v_chave_cifra := digest(v_segredo || ':' || v_desafio::text, 'sha256');
  select jsonb_agg(jsonb_build_object(
           'dedo', d.dedo,
           'iv', translate(encode(x.iv, 'base64'), E'\n', ''),
           'cifra', translate(encode(encrypt_iv(convert_to(pgp_sym_decrypt(d.template_cifrado, v_chave), 'UTF8'), v_chave_cifra, x.iv, 'aes-cbc/pad:pkcs'), 'base64'), E'\n', '')))
    into v_digitais
    from public.ponto_digitais d
   cross join lateral (select gen_random_bytes(16) as iv where d.dedo is not null) x
   where d.employee_id = e.id;
  if v_digitais is null then raise exception 'Este funcionário não tem digital cadastrada.' using errcode = 'P0001'; end if;

  insert into public.ponto_digital_desafios (id, employee_id, leitor_id, nonce, expira)
  values (v_desafio, e.id, v_leitor.id, v_nonce, now() + interval '3 minutes');
  return jsonb_build_object('desafio', v_desafio, 'nonce', v_nonce, 'digitais', v_digitais);
end $$;
revoke all on function public.ponto_digital_iniciar(uuid, uuid) from public, anon;
grant execute on function public.ponto_digital_iniciar(uuid, uuid) to authenticated;

-- Registra a marcação depois que o programa do leitor assinou a leitura. As regras de repetição e de sequência são as de ponto_registrar.
create function public.ponto_registrar_digital(p_desafio uuid, p_dedo smallint, p_assinatura text, p_tipo text, p_dispositivo text, p_ip text) returns jsonb
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
  if d.id is null or d.usado_em is not null or d.expira < now() then
    raise exception 'A leitura da digital venceu. Coloque o dedo de novo.' using errcode = 'P0001';
  end if;
  select id, nome, branch_id, status into e from public.employees where id = d.employee_id;
  if e.id is null or e.status = 'desligado' then raise exception 'Funcionário não encontrado ou desligado.' using errcode = 'P0001'; end if;
  if not (private.pode_ver_filial(e.branch_id) or private.relogio_da_filial(e.branch_id)) then
    raise exception 'Este relógio não atende a filial do funcionário.' using errcode = 'P0001';
  end if;
  if not d.ativo or d.segredo_cifrado is null then
    raise exception 'O leitor deste computador foi desativado. Use o PIN.' using errcode = 'P0001';
  end if;

  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'ponto_digital_chave';
  v_segredo := pgp_sym_decrypt(d.segredo_cifrado, v_chave);
  update public.ponto_digital_desafios set usado_em = now() where id = d.id;
  if lower(coalesce(p_assinatura, '')) <> encode(hmac(d.id::text || '|' || d.nonce || '|' || p_dedo::text, v_segredo, 'sha256'), 'hex')
     or not exists (select 1 from public.ponto_digitais x where x.employee_id = e.id and x.dedo = p_dedo) then
    insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_novo)
    values (eu, 'editar', 'ponto_digital_desafios', d.id, jsonb_build_object('employee_id', e.id, 'digital', 'assinatura recusada'));
    return jsonb_build_object('erro', 'Não foi possível confirmar a digital. Tente de novo ou use o PIN.');
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
revoke all on function public.ponto_registrar_digital(uuid, smallint, text, text, text, text) from public, anon;
grant execute on function public.ponto_registrar_digital(uuid, smallint, text, text, text, text) to authenticated;

-- O relógio passa a saber se a pessoa tem digital cadastrada.
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
             'qtd_hoje', (select count(*) from public.ponto_marcacoes m
                           where m.employee_id = e.id and not m.anulada
                             and (m.momento at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date),
             'ultima', (select jsonb_build_object('tipo', m.tipo, 'momento', m.momento) from public.ponto_marcacoes m
                         where m.employee_id = e.id and not m.anulada
                           and (m.momento at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
                         order by m.momento desc limit 1))
      from public.employees e
     where e.branch_id = p_branch and e.status <> 'desligado' and btrim(e.matricula) = btrim(p_matricula)
     limit 1) end;
$function$;
