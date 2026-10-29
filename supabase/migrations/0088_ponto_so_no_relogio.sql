-- Ponto só no relógio da loja (decisão de 29/10/2026): o funcionário não registra mais pelo próprio login
-- ("Meu ponto", computador ou celular). Só o método relogio_pin (matrícula + PIN) é aceito. As marcações
-- antigas feitas pela web continuam no histórico.
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
  select count(*) into qtd from public.ponto_marcacoes
   where employee_id = e.id and not anulada and (momento at time zone 'America/Sao_Paulo')::date = hoje;
  tipo := coalesce(nullif(p_tipo, ''), seq[(qtd % 4) + 1]);
  if not tipo = any (seq) then raise exception 'Tipo de marcação inválido.' using errcode = 'P0001'; end if;

  insert into public.ponto_marcacoes (employee_id, branch_id, momento, tipo, metodo, origem, dispositivo, ip, latitude, longitude, precisao_m, registrado_por)
  values (e.id, e.branch_id, now(), tipo, p_metodo, 'registro', left(p_dispositivo, 300), left(p_ip, 64), p_latitude, p_longitude, p_precisao, eu)
  returning * into nova;
  return jsonb_build_object('id', nova.id, 'nsr', nova.nsr, 'momento', nova.momento, 'tipo', nova.tipo, 'funcionario', e.nome);
end $function$;
