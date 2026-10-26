-- 0070 — A liberação do mês fechado (ponto.liberar) e o motivo (ponto.motivo) valiam até o fim da transação; agora
-- cada função desliga os dois antes de terminar, para nada que venha depois na mesma transação passar pela trava.

create or replace function public.ponto_decidir_ajuste(p_id uuid, p_aprovar boolean, p_resposta text, p_motivo_fechado text) returns void
language plpgsql security definer set search_path = public as $$
declare
  a public.ponto_ajustes;
  original public.ponto_marcacoes;
  admin boolean := private.sou_admin();
begin
  select * into a from public.ponto_ajustes where id = p_id for update;
  if a.id is null then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
  if a.status <> 'pendente' then raise exception 'Este pedido já foi decidido.' using errcode = 'P0001'; end if;
  if not private.pode_rh_filial(a.branch_id) then raise exception 'Só o gestor da filial, o RH ou o administrador decidem.' using errcode = 'P0001'; end if;
  if not admin and (a.solicitado_por = auth.uid() or a.employee_id = private.meu_employee()) then
    raise exception 'Você não pode decidir um pedido seu ou do seu próprio ponto.' using errcode = 'P0001';
  end if;
  if not p_aprovar and coalesce(btrim(p_resposta), '') = '' then raise exception 'Diga o motivo da recusa.' using errcode = 'P0001'; end if;

  if private.ponto_mes_fechado(a.branch_id, a.data) then
    if not admin or coalesce(btrim(p_motivo_fechado), '') = '' then
      raise exception 'O ponto deste mês está fechado: só o administrador decide, informando o motivo.' using errcode = 'P0001';
    end if;
    perform set_config('ponto.liberar', 'on', true);
  end if;
  perform set_config('ponto.motivo', left(coalesce(nullif(btrim(p_motivo_fechado), ''), 'Ajuste: ' || a.motivo), 300), true);

  if p_aprovar then
    if a.marcacao_id is not null then
      select * into original from public.ponto_marcacoes where id = a.marcacao_id;
      if original.id is null or original.anulada or original.employee_id <> a.employee_id then
        raise exception 'A marcação original não existe mais, já foi anulada ou é de outro funcionário.' using errcode = 'P0001';
      end if;
      update public.ponto_marcacoes
         set anulada = true, anulada_por = auth.uid(), anulada_em = now(), anulada_motivo = left('Ajuste aprovado: ' || a.motivo, 300)
       where id = a.marcacao_id;
    end if;
    if a.acao in ('incluir', 'alterar') then
      insert into public.ponto_marcacoes (employee_id, branch_id, momento, tipo, metodo, origem, registrado_por, ajuste_id)
      values (a.employee_id, a.branch_id, a.horario_solicitado, coalesce(a.tipo_marcacao, original.tipo), 'ajuste', 'ajuste', auth.uid(), a.id);
    end if;
  end if;
  update public.ponto_ajustes
     set status = case when p_aprovar then 'aprovado' else 'recusado' end, decidido_por = auth.uid(), decidido_em = now(), resposta = nullif(btrim(p_resposta), '')
   where id = a.id;
  perform set_config('ponto.liberar', '', true);
  perform set_config('ponto.motivo', '', true);
end $$;

create or replace function public.ponto_fechar_mes(p_competencia date, p_branch uuid, p_resumo jsonb, p_saldos jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  f public.ponto_fechamentos;
  s jsonb;
begin
  if not private.admin_ou_rh() then raise exception 'Só Administrador e RH fecham o ponto.' using errcode = 'P0001'; end if;
  if extract(day from p_competencia) <> 1 then raise exception 'Competência inválida.' using errcode = 'P0001'; end if;
  select * into f from public.ponto_fechamentos where competencia = p_competencia and branch_id = p_branch for update;
  if f.id is not null and f.status = 'fechado' then raise exception 'Este mês já está fechado para esta filial.' using errcode = 'P0001'; end if;
  perform set_config('ponto.liberar', 'on', true);
  if f.id is null then
    insert into public.ponto_fechamentos (competencia, branch_id, status, resumo, fechado_por, fechado_em)
    values (p_competencia, p_branch, 'fechado', p_resumo, auth.uid(), now()) returning * into f;
  else
    delete from public.ponto_banco_movimentos where fechamento_id = f.id;
    update public.ponto_fechamentos set status = 'fechado', resumo = p_resumo, fechado_por = auth.uid(), fechado_em = now() where id = f.id returning * into f;
  end if;
  for s in select * from jsonb_array_elements(coalesce(p_saldos, '[]'::jsonb)) loop
    if (s ->> 'minutos')::int <> 0 then
      if not exists (select 1 from public.employees e where e.id = (s ->> 'employee_id')::uuid) then continue; end if;
      insert into public.ponto_banco_movimentos (employee_id, data, minutos, tipo, descricao, fechamento_id, registrado_por)
      values ((s ->> 'employee_id')::uuid, (p_competencia + interval '1 month - 1 day')::date, (s ->> 'minutos')::int, 'fechamento',
              'Saldo do mês ' || to_char(p_competencia, 'MM/YYYY'), f.id, auth.uid());
    end if;
  end loop;
  perform set_config('ponto.liberar', '', true);
  return f.id;
end $$;

create or replace function public.ponto_reabrir_mes(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not private.sou_admin() then raise exception 'Só o administrador reabre um mês fechado.' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Diga o motivo da reabertura.' using errcode = 'P0001'; end if;
  perform set_config('ponto.liberar', 'on', true);
  perform set_config('ponto.motivo', left(p_motivo, 300), true);
  delete from public.ponto_banco_movimentos where fechamento_id = p_id;
  update public.ponto_fechamentos set status = 'reaberto', reaberto_por = auth.uid(), reaberto_em = now(), motivo_reabertura = left(p_motivo, 500)
   where id = p_id and status = 'fechado';
  if not found then raise exception 'Fechamento não encontrado ou já reaberto.' using errcode = 'P0001'; end if;
  perform set_config('ponto.liberar', '', true);
  perform set_config('ponto.motivo', '', true);
end $$;
