-- 0071 — Ponto: data de início do controle na filial e auditoria do ponto para RH e gestores.
--
-- inicio_controle: a jornada padrão da filial só vale a partir desta data (antes dela ninguém tem falta). Sem isso,
-- ligar a jornada padrão numa filial geraria faltas em todos os dias passados.

alter table public.ponto_config_filial add column inicio_controle date not null default current_date;

-- Histórico de alterações do ponto (audit_logs só é lido pelo administrador). Admin e RH veem tudo; gerente e
-- coordenador veem o que é da filial deles (pela filial do registro ou pela filial do funcionário).
create function public.ponto_auditoria(p_branch uuid, p_de date, p_ate date, p_entidade text, p_limite int, p_pagina int)
returns table (
  id uuid, criado_em timestamptz, autor text, acao text, entidade text, registro_id uuid,
  valor_anterior jsonb, valor_novo jsonb, branch_id uuid, funcionario text, total bigint
)
language sql stable security definer set search_path = public as $$
  with base as (
    select a.id, a.created_at, a.user_id, a.acao, a.entidade, a.registro_id, a.valor_anterior, a.valor_novo,
           coalesce((coalesce(a.valor_novo, a.valor_anterior) ->> 'branch_id')::uuid, e.branch_id) as filial,
           e.nome as func
      from public.audit_logs a
      left join public.employees e
        on e.id = coalesce((coalesce(a.valor_novo, a.valor_anterior) ->> 'employee_id')::uuid,
                           case when a.entidade = 'ponto_pins' then a.registro_id end)
     where a.entidade like 'ponto\_%'
       and (p_entidade is null or a.entidade = p_entidade)
       and (p_de is null or a.created_at >= (p_de::timestamp at time zone 'America/Sao_Paulo'))
       and (p_ate is null or a.created_at < ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo'))
  ), vis as (
    select b.* from base b
     where (private.admin_ou_rh() or (b.filial is not null and private.pode_ponto_filial(b.filial)))
       and (p_branch is null or b.filial = p_branch)
  )
  select v.id, v.created_at, coalesce(p.nome, 'Sistema'), v.acao, v.entidade, v.registro_id, v.valor_anterior, v.valor_novo,
         v.filial, v.func, count(*) over ()
    from vis v
    left join public.profiles p on p.id = v.user_id
   order by v.created_at desc
   limit least(greatest(coalesce(p_limite, 50), 1), 500)
  offset greatest(coalesce(p_pagina, 1) - 1, 0) * least(greatest(coalesce(p_limite, 50), 1), 500);
$$;
revoke all on function public.ponto_auditoria(uuid, date, date, text, int, int) from public, anon;
grant execute on function public.ponto_auditoria(uuid, date, date, text, int, int) to authenticated;
