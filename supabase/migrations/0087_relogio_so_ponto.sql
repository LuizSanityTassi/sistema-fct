-- Login do relógio (papel 'relogio'): não enxerga nada da filial pelo RLS; só identifica a matrícula
-- e registra o ponto com PIN no relógio da própria filial.

-- 1) pode_ver_filial: o relógio fica de fora (antes, ter branch_id já liberava a filial)
create or replace function private.pode_ver_filial(b uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'private', 'public'
as $function$
  select case
    when (select papel from public.profiles where id = auth.uid()) = 'relogio' then false
    when b is null then true
    when (select papel from public.profiles where id = auth.uid()) in ('admin','rh','ti','financeiro') then true
    when coalesce((select admin_sistema from public.profiles where id = auth.uid()), false) then true
    when exists (select 1 from public.profiles p where p.id = auth.uid() and p.branch_id = b) then true
    when exists (select 1 from public.user_branch_access u where u.user_id = auth.uid() and u.branch_id = b) then true
    when private.coordena_filial(b) then true
    else false end;
$function$;

-- 2) é o login do relógio desta filial?
create or replace function private.relogio_da_filial(b uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'private', 'public'
as $function$
  select b is not null and exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.ativo and p.papel = 'relogio' and p.branch_id = b
  );
$function$;
revoke all on function private.relogio_da_filial(uuid) from public;
grant execute on function private.relogio_da_filial(uuid) to authenticated;

-- 3) identificar a matrícula: aceita o login do relógio e já devolve as marcações de hoje
--    (o relógio não lê ponto_marcacoes; a sugestão do próximo tipo sai daqui)
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

-- 4) registrar com PIN: o login do relógio também atende a própria filial
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
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  qtd int;
  ultima timestamptz;
  seq text[] := array['entrada', 'intervalo_inicio', 'intervalo_fim', 'saida'];
  tipo text;
  nova public.ponto_marcacoes;
begin
  if eu is null then raise exception 'Entre no sistema para registrar o ponto.' using errcode = 'P0001'; end if;
  select id, nome, branch_id, status into e from public.employees where id = p_employee;
  if e.id is null or e.status = 'desligado' then raise exception 'Funcionário não encontrado ou desligado.' using errcode = 'P0001'; end if;
  if p_metodo not in ('web', 'relogio_pin', 'celular') then raise exception 'Método de registro não disponível.' using errcode = 'P0001'; end if;

  if p_metodo = 'relogio_pin' then
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
  elsif e.id is distinct from private.meu_employee() then
    raise exception 'Você só pode registrar o seu próprio ponto. No relógio da filial, use matrícula e PIN.' using errcode = 'P0001';
  end if;

  select max(momento) into ultima from public.ponto_marcacoes where employee_id = e.id and not anulada;
  if ultima is not null and now() - ultima < interval '1 minute' then
    raise exception 'Marcação repetida: a última foi há menos de 1 minuto.' using errcode = 'P0001';
  end if;
  select count(*) into qtd from public.ponto_marcacoes
   where employee_id = e.id and not anulada and (momento at time zone 'America/Sao_Paulo')::date = hoje;
  tipo := coalesce(nullif(p_tipo, ''), seq[(qtd % 4) + 1]);
  if not tipo = any (seq) then raise exception 'Tipo de marcação inválido.' using errcode = 'P0001'; end if;

  insert into public.ponto_marcacoes (employee_id, branch_id, momento, tipo, metodo, origem, dispositivo, ip, latitude, longitude, precisao_m, registrado_por)
  values (e.id, e.branch_id, now(), tipo, p_metodo, 'registro', left(p_dispositivo, 300), left(p_ip, 64), p_latitude, p_longitude, p_precisao, eu)
  returning * into nova;
  return jsonb_build_object('id', nova.id, 'nsr', nova.nsr, 'momento', nova.momento, 'tipo', nova.tipo, 'funcionario', e.nome);
end $function$;
