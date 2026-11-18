-- 0151 — Férias com início e retorno: a situação do funcionário muda sozinha nas datas.
-- As férias ficam em ponto_ausencias (tipo 'ferias'), as mesmas que o ponto usa (o dia não vira falta).
--   ativo  → ferias  quando há férias cobrindo o dia de hoje;
--   ferias → ativo   quando não há mais férias cobrindo hoje (voltou das férias).
-- Afastado e desligado nunca são tocados. Roda:
--   • na hora, quando férias são lançadas, alteradas ou removidas (gatilho em ponto_ausencias);
--   • todo dia às 00:05 de Brasília (03:05 UTC) pelo pg_cron, para virar a situação no dia marcado.
-- Cada troca vai para audit_logs (user_id = quem lançou; nulo = automático do dia).

create or replace function private.rh_situacao_ferias(p_employee uuid default null, p_hoje date default null)
returns integer
language plpgsql security definer set search_path = private, public as $$
declare
  hoje date := coalesce(p_hoje, (now() at time zone 'America/Sao_Paulo')::date);
  n_ini integer;
  n_fim integer;
begin
  -- começou: ativo com férias cobrindo hoje
  with mud as (
    update public.employees e set status = 'ferias'
     where e.status = 'ativo'
       and (p_employee is null or e.id = p_employee)
       and exists (select 1 from public.ponto_ausencias a
                    where a.employee_id = e.id and a.tipo = 'ferias' and hoje between a.inicio and a.fim)
    returning e.id
  ), log as (
    insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_anterior, valor_novo)
    select auth.uid(), 'editar', 'employees', mud.id, jsonb_build_object('status', 'ativo'),
           jsonb_build_object('status', 'ferias', 'motivo', 'Início das férias (automático pela data)')
      from mud
    returning 1
  )
  select count(*) into n_ini from log;

  -- voltou: em férias sem férias cobrindo hoje. Na rodada geral só quem tem férias lançadas que já terminaram
  -- (situação "férias" posta à mão, sem período, fica como está); para um funcionário só (o gatilho), sempre.
  with mud as (
    update public.employees e set status = 'ativo'
     where e.status = 'ferias'
       and (p_employee is null or e.id = p_employee)
       and not exists (select 1 from public.ponto_ausencias a
                        where a.employee_id = e.id and a.tipo = 'ferias' and hoje between a.inicio and a.fim)
       and (p_employee is not null
            or exists (select 1 from public.ponto_ausencias a
                        where a.employee_id = e.id and a.tipo = 'ferias' and a.fim < hoje))
    returning e.id
  ), log as (
    insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_anterior, valor_novo)
    select auth.uid(), 'editar', 'employees', mud.id, jsonb_build_object('status', 'ferias'),
           jsonb_build_object('status', 'ativo', 'motivo', 'Retorno das férias (automático pela data)')
      from mud
    returning 1
  )
  select count(*) into n_fim from log;

  return n_ini + n_fim;
end $$;

revoke all on function private.rh_situacao_ferias(uuid, date) from public, anon, authenticated;

-- gatilho: lançar, mudar ou remover férias já acerta a situação de hoje
create or replace function private.rh_ferias_ausencia_mudou() returns trigger
language plpgsql security definer set search_path = private, public as $$
begin
  if tg_op <> 'DELETE' and new.tipo = 'ferias' then
    perform private.rh_situacao_ferias(new.employee_id);
  end if;
  if tg_op <> 'INSERT' and old.tipo = 'ferias' and (tg_op = 'DELETE' or old.employee_id <> new.employee_id or new.tipo <> 'ferias') then
    perform private.rh_situacao_ferias(old.employee_id);
  end if;
  return null;
end $$;

drop trigger if exists t_ponto_ausencias_situacao on public.ponto_ausencias;
create trigger t_ponto_ausencias_situacao after insert or update or delete on public.ponto_ausencias
  for each row execute function private.rh_ferias_ausencia_mudou();

-- todo dia 00:05 de Brasília
select cron.unschedule('rh-situacao-ferias') where exists (select 1 from cron.job where jobname = 'rh-situacao-ferias');
select cron.schedule('rh-situacao-ferias', '5 3 * * *', $$select private.rh_situacao_ferias()$$);
