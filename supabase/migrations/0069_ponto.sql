-- 0069 — Módulo Ponto (controle de jornada). Reaproveita o que já existe: employees (cadastro do RH), branches,
-- departments, profiles (profiles.employee_id = o funcionário do usuário) e as regras de acesso por filial
-- (private.pode_rh_filial / pode_ver_filial / coordena_filial). Nada do RH é duplicado aqui.
--
-- Regras de ouro:
--   • marcação nunca é apagada nem reescrita: correção = marcação nova + a antiga ANULADA (quem, quando, motivo);
--   • marcação só entra pelas funções (ponto_registrar / ponto_decidir_ajuste), nunca por insert direto;
--   • mês fechado (por filial) trava marcações, ajustes, ausências, programação e banco — só o administrador libera,
--     com motivo;
--   • tudo que muda o ponto vai para audit_logs (trigger), com o registro anterior e o novo.

-- ============================================================================================ acesso
-- vê o ponto da filial: admin, RH, gerente da filial, coordenador da regional
create function private.pode_ponto_filial(b uuid) returns boolean
language sql stable security definer set search_path = private, public as $$
  select private.pode_rh_filial(b) or private.coordena_filial(b);
$$;
-- o funcionário do usuário logado (null se o usuário não é funcionário)
create function private.meu_employee() returns uuid
language sql stable security definer set search_path = private, public as $$
  select employee_id from public.profiles where id = auth.uid();
$$;
-- vê o ponto deste funcionário: ele mesmo ou quem vê a filial dele
create function private.pode_ver_ponto_func(emp uuid) returns boolean
language sql stable security definer set search_path = private, public as $$
  select emp = private.meu_employee()
      or exists (select 1 from public.employees e where e.id = emp and private.pode_ponto_filial(e.branch_id));
$$;
-- gere o ponto deste funcionário (jornada, escala, ausências, aprovar ajustes): admin, RH, gerente da filial
create function private.gere_ponto_func(emp uuid) returns boolean
language sql stable security definer set search_path = private, public as $$
  select exists (select 1 from public.employees e where e.id = emp and private.pode_rh_filial(e.branch_id));
$$;
create function private.admin_ou_rh() returns boolean
language sql stable security definer set search_path = private, public as $$
  select private.sou_admin() or private.tem_papel('rh');
$$;
-- filial do funcionário (sem depender de o usuário enxergar a tabela employees)
create function private.filial_do_func(emp uuid) returns uuid
language sql stable security definer set search_path = private, public as $$
  select branch_id from public.employees where id = emp;
$$;

-- ============================================================================================ jornadas
-- Modelo de jornada: semanal (por dia da semana) ou ciclo (escala 12x36, 6x1… a partir de data_base).
create table public.ponto_jornadas (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (length(btrim(nome)) between 2 and 80),
  descricao      text check (descricao is null or length(descricao) <= 300),
  tipo           text not null check (tipo in ('semanal', 'ciclo')),
  branch_id      uuid references public.branches(id) on delete cascade,  -- null = vale para todas as filiais
  ciclo_dias     smallint check (ciclo_dias between 1 and 62),
  data_base      date,
  tolerancia_min smallint not null default 10 check (tolerancia_min between 0 and 60),
  ativo          boolean not null default true,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check ((tipo = 'semanal' and ciclo_dias is null) or (tipo = 'ciclo' and ciclo_dias is not null and data_base is not null))
);
create index ponto_jornadas_branch_idx on public.ponto_jornadas (branch_id);
create index ponto_jornadas_created_by_idx on public.ponto_jornadas (created_by);
create trigger t_ponto_jornadas_upd before update on public.ponto_jornadas for each row execute function public.set_updated_at();

-- Dias do modelo: semanal → posicao 0 = domingo … 6 = sábado; ciclo → 0 … ciclo_dias-1. Saída menor que a entrada =
-- vira a noite.
create table public.ponto_jornada_dias (
  jornada_id       uuid not null references public.ponto_jornadas(id) on delete cascade,
  posicao          smallint not null check (posicao between 0 and 61),
  folga            boolean not null default false,
  entrada          time,
  intervalo_inicio time,
  intervalo_fim    time,
  saida            time,
  primary key (jornada_id, posicao),
  check (folga or (entrada is not null and saida is not null)),
  check ((intervalo_inicio is null) = (intervalo_fim is null))
);

-- Jornada de cada funcionário ao longo do tempo (troca = fecha a anterior e abre outra; nada é sobrescrito).
create table public.ponto_vinculos (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  jornada_id   uuid not null references public.ponto_jornadas(id),
  inicio       date not null,
  fim          date,
  definido_por uuid references public.profiles(id) on delete set null,
  definido_em  timestamptz not null default now(),
  check (fim is null or fim >= inicio)
);
create index ponto_vinculos_employee_idx on public.ponto_vinculos (employee_id, inicio);
create index ponto_vinculos_jornada_idx on public.ponto_vinculos (jornada_id);
create index ponto_vinculos_definido_por_idx on public.ponto_vinculos (definido_por);

-- Jornada padrão da filial (quem não tem vínculo usa esta) e opções do relógio.
create table public.ponto_config_filial (
  branch_id            uuid primary key references public.branches(id) on delete cascade,
  jornada_padrao_id    uuid references public.ponto_jornadas(id) on delete set null,
  exige_localizacao    boolean not null default false,
  atualizado_por       uuid references public.profiles(id) on delete set null,
  atualizado_em        timestamptz not null default now()
);
create index ponto_config_filial_jornada_idx on public.ponto_config_filial (jornada_padrao_id);
create index ponto_config_filial_atualizado_por_idx on public.ponto_config_filial (atualizado_por);

-- Escala do mês / troca de um dia: vale no lugar da jornada naquele dia.
create table public.ponto_programacao (
  employee_id      uuid not null references public.employees(id) on delete cascade,
  data             date not null,
  folga            boolean not null default false,
  entrada          time,
  intervalo_inicio time,
  intervalo_fim    time,
  saida            time,
  motivo           text check (motivo is null or length(motivo) <= 200),
  definido_por     uuid references public.profiles(id) on delete set null,
  definido_em      timestamptz not null default now(),
  primary key (employee_id, data),
  check (folga or (entrada is not null and saida is not null)),
  check ((intervalo_inicio is null) = (intervalo_fim is null))
);
create index ponto_programacao_definido_por_idx on public.ponto_programacao (definido_por);

-- Feriados: branch_id null = todas as filiais (nacional); com filial = municipal/da loja.
create table public.ponto_feriados (
  id          uuid primary key default gen_random_uuid(),
  data        date not null,
  nome        text not null check (length(btrim(nome)) between 2 and 80),
  abrangencia text not null default 'nacional' check (abrangencia in ('nacional', 'estadual', 'municipal', 'empresa')),
  branch_id   uuid references public.branches(id) on delete cascade,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index ponto_feriados_unico on public.ponto_feriados (data, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index ponto_feriados_branch_idx on public.ponto_feriados (branch_id);
create index ponto_feriados_created_by_idx on public.ponto_feriados (created_by);

-- Ausências com período (férias, afastamento, atestado…): o dia não conta como falta. Folga compensatória tira o
-- previsto do banco de horas. O status atual do funcionário continua em employees.status (RH).
create table public.ponto_ausencias (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees(id) on delete cascade,
  tipo           text not null check (tipo in ('ferias', 'afastamento', 'atestado', 'licenca', 'abono', 'folga_compensatoria')),
  inicio         date not null,
  fim            date not null,
  observacao     text check (observacao is null or length(observacao) <= 300),
  registrado_por uuid references public.profiles(id) on delete set null,
  registrado_em  timestamptz not null default now(),
  check (fim >= inicio)
);
create index ponto_ausencias_employee_idx on public.ponto_ausencias (employee_id, inicio);
create index ponto_ausencias_registrado_por_idx on public.ponto_ausencias (registrado_por);

-- ============================================================================================ marcações
create table public.ponto_marcacoes (
  id             uuid primary key default gen_random_uuid(),
  nsr            bigint generated always as identity unique,  -- número sequencial do registro
  employee_id    uuid not null references public.employees(id) on delete restrict,
  branch_id      uuid not null references public.branches(id),
  momento        timestamptz not null,
  tipo           text not null check (tipo in ('entrada', 'intervalo_inicio', 'intervalo_fim', 'saida')),
  -- métodos previstos (o protótipo usa web e relogio_pin; os outros entram sem mudar a tabela)
  metodo         text not null check (metodo in ('web', 'relogio_pin', 'celular', 'qrcode', 'biometria', 'facial', 'importacao', 'ajuste')),
  origem         text not null default 'registro' check (origem in ('registro', 'ajuste', 'importacao')),
  dispositivo    text check (dispositivo is null or length(dispositivo) <= 300),
  ip             text check (ip is null or length(ip) <= 64),
  latitude       numeric(9, 6),
  longitude      numeric(9, 6),
  precisao_m     numeric(8, 1),
  registrado_por uuid references public.profiles(id) on delete set null,
  ajuste_id      uuid,
  anulada        boolean not null default false,
  anulada_por    uuid references public.profiles(id) on delete set null,
  anulada_em     timestamptz,
  anulada_motivo text,
  created_at     timestamptz not null default now()
);
create index ponto_marcacoes_employee_idx on public.ponto_marcacoes (employee_id, momento);
create index ponto_marcacoes_branch_idx on public.ponto_marcacoes (branch_id, momento);
create index ponto_marcacoes_registrado_por_idx on public.ponto_marcacoes (registrado_por);
create index ponto_marcacoes_anulada_por_idx on public.ponto_marcacoes (anulada_por);

-- Pedidos de correção (funcionário ou gestor pede; gestor aprova ou recusa).
create table public.ponto_ajustes (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        uuid not null references public.employees(id) on delete cascade,
  branch_id          uuid not null references public.branches(id),
  data               date not null,
  acao               text not null check (acao in ('incluir', 'alterar', 'anular')),
  tipo_marcacao      text check (tipo_marcacao in ('entrada', 'intervalo_inicio', 'intervalo_fim', 'saida')),
  marcacao_id        uuid references public.ponto_marcacoes(id),
  horario_original   timestamptz,
  horario_solicitado timestamptz,
  motivo_tipo        text not null check (motivo_tipo in ('esqueci_entrada', 'esqueci_saida', 'horario_incorreto', 'trabalho_externo', 'problema_sistema', 'autorizado_gestor', 'outro')),
  motivo             text not null check (length(btrim(motivo)) between 3 and 500),
  status             text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado', 'cancelado')),
  solicitado_por     uuid references public.profiles(id) on delete set null,
  solicitado_em      timestamptz not null default now(),
  decidido_por       uuid references public.profiles(id) on delete set null,
  decidido_em        timestamptz,
  resposta           text check (resposta is null or length(resposta) <= 500),
  check (acao <> 'incluir' or (tipo_marcacao is not null and horario_solicitado is not null)),
  check (acao <> 'alterar' or (marcacao_id is not null and horario_solicitado is not null)),
  check (acao <> 'anular' or marcacao_id is not null)
);
create index ponto_ajustes_employee_idx on public.ponto_ajustes (employee_id, data);
create index ponto_ajustes_branch_status_idx on public.ponto_ajustes (branch_id, status);
create index ponto_ajustes_marcacao_idx on public.ponto_ajustes (marcacao_id);
create index ponto_ajustes_solicitado_por_idx on public.ponto_ajustes (solicitado_por);
create index ponto_ajustes_decidido_por_idx on public.ponto_ajustes (decidido_por);
alter table public.ponto_marcacoes add constraint ponto_marcacoes_ajuste_fk foreign key (ajuste_id) references public.ponto_ajustes(id);
create index ponto_marcacoes_ajuste_idx on public.ponto_marcacoes (ajuste_id);

-- ============================================================================================ banco e fechamento
create table public.ponto_fechamentos (
  id                uuid primary key default gen_random_uuid(),
  competencia       date not null check (extract(day from competencia) = 1),
  branch_id         uuid not null references public.branches(id) on delete cascade,
  status            text not null check (status in ('fechado', 'reaberto')),
  resumo            jsonb,
  fechado_por       uuid references public.profiles(id) on delete set null,
  fechado_em        timestamptz,
  reaberto_por      uuid references public.profiles(id) on delete set null,
  reaberto_em       timestamptz,
  motivo_reabertura text,
  unique (competencia, branch_id)
);
create index ponto_fechamentos_branch_idx on public.ponto_fechamentos (branch_id);
create index ponto_fechamentos_fechado_por_idx on public.ponto_fechamentos (fechado_por);
create index ponto_fechamentos_reaberto_por_idx on public.ponto_fechamentos (reaberto_por);

-- Movimentos do banco de horas. Meses abertos são calculados das marcações; no fechamento o saldo do mês vira um
-- movimento 'fechamento'. Compensação, pagamento em folha e ajustes manuais entram aqui direto.
create table public.ponto_banco_movimentos (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees(id) on delete cascade,
  data           date not null,
  minutos        integer not null check (minutos <> 0),
  tipo           text not null check (tipo in ('fechamento', 'compensacao', 'pagamento', 'ajuste', 'saldo_inicial')),
  descricao      text check (descricao is null or length(descricao) <= 300),
  fechamento_id  uuid references public.ponto_fechamentos(id) on delete cascade,
  registrado_por uuid references public.profiles(id) on delete set null,
  registrado_em  timestamptz not null default now()
);
create index ponto_banco_employee_idx on public.ponto_banco_movimentos (employee_id, data);
create index ponto_banco_fechamento_idx on public.ponto_banco_movimentos (fechamento_id);
create index ponto_banco_registrado_por_idx on public.ponto_banco_movimentos (registrado_por);

-- PIN do relógio da filial: só o hash (bcrypt). Ninguém lê esta tabela; só as funções.
create table public.ponto_pins (
  employee_id   uuid primary key references public.employees(id) on delete cascade,
  pin_hash      text not null,
  definido_por  uuid references public.profiles(id) on delete set null,
  definido_em   timestamptz not null default now(),
  tentativas    smallint not null default 0,
  bloqueado_ate timestamptz
);
create index ponto_pins_definido_por_idx on public.ponto_pins (definido_por);

-- ============================================================================================ trava do mês fechado
-- O mês do dia `d` da filial `b` está fechado? (a liberação do administrador vale só na transação: ponto.liberar)
create function private.ponto_mes_fechado(b uuid, d date) returns boolean
language sql stable security definer set search_path = private, public as $$
  select coalesce(current_setting('ponto.liberar', true), '') <> 'on'
     and exists (select 1 from public.ponto_fechamentos f
                  where f.branch_id = b and f.competencia = date_trunc('month', d)::date and f.status = 'fechado');
$$;

create function private.ponto_travar_fechado() returns trigger
language plpgsql security definer set search_path = private, public as $$
declare
  linha jsonb := to_jsonb(coalesce(new, old));
  b uuid;
  d date;
begin
  if tg_table_name = 'ponto_marcacoes' then
    b := (linha ->> 'branch_id')::uuid;
    d := ((linha ->> 'momento')::timestamptz at time zone 'America/Sao_Paulo')::date;
  elsif tg_table_name = 'ponto_ajustes' then
    if tg_op = 'UPDATE' and new.status = old.status then return new; end if;
    b := (linha ->> 'branch_id')::uuid;
    d := (linha ->> 'data')::date;
  else
    select e.branch_id into b from public.employees e where e.id = (linha ->> 'employee_id')::uuid;
    d := coalesce((linha ->> 'data')::date, (linha ->> 'inicio')::date);
    if tg_table_name = 'ponto_banco_movimentos' and (linha ->> 'tipo') = 'fechamento' then return coalesce(new, old); end if;
  end if;
  if private.ponto_mes_fechado(b, d) then
    raise exception 'Ponto de % fechado para esta filial. Peça ao administrador para liberar (com motivo).', to_char(d, 'MM/YYYY')
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

create trigger t_ponto_marcacoes_fechado before insert or update on public.ponto_marcacoes for each row execute function private.ponto_travar_fechado();
create trigger t_ponto_ajustes_fechado before update on public.ponto_ajustes for each row execute function private.ponto_travar_fechado();
create trigger t_ponto_ausencias_fechado before insert or update or delete on public.ponto_ausencias for each row execute function private.ponto_travar_fechado();
create trigger t_ponto_programacao_fechado before insert or update or delete on public.ponto_programacao for each row execute function private.ponto_travar_fechado();
create trigger t_ponto_banco_fechado before insert or update or delete on public.ponto_banco_movimentos for each row execute function private.ponto_travar_fechado();

-- marcação não se apaga e não se reescreve: só pode ser anulada (anulada/anulada_*)
create function private.ponto_marcacao_imutavel() returns trigger
language plpgsql set search_path = private, public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Marcação de ponto não se apaga: anule com motivo.' using errcode = 'P0001';
  end if;
  if (new.employee_id, new.branch_id, new.momento, new.tipo, new.metodo, new.origem, new.nsr, new.dispositivo, new.ip,
      new.latitude, new.longitude, new.precisao_m, new.registrado_por, new.ajuste_id, new.created_at) is distinct from
     (old.employee_id, old.branch_id, old.momento, old.tipo, old.metodo, old.origem, old.nsr, old.dispositivo, old.ip,
      old.latitude, old.longitude, old.precisao_m, old.registrado_por, old.ajuste_id, old.created_at)
     or (old.anulada and not new.anulada) then
    raise exception 'Marcação de ponto não se altera: anule e registre outra (pedido de ajuste).' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger t_ponto_marcacoes_imutavel before update or delete on public.ponto_marcacoes for each row execute function private.ponto_marcacao_imutavel();

-- ============================================================================================ auditoria
create function private.ponto_auditar() returns trigger
language plpgsql security definer set search_path = private, public as $$
declare
  antes jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  depois jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  base jsonb := coalesce(depois, antes);
begin
  insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_anterior, valor_novo)
  values (
    auth.uid(),
    case tg_op when 'INSERT' then 'criar' when 'UPDATE' then 'editar' else 'excluir' end,
    tg_table_name,
    coalesce((base ->> 'id')::uuid, (base ->> 'employee_id')::uuid, (base ->> 'jornada_id')::uuid, (base ->> 'branch_id')::uuid),
    antes,
    depois || jsonb_build_object('motivo', nullif(current_setting('ponto.motivo', true), ''))
  );
  return coalesce(new, old);
end $$;

create trigger t_ponto_jornadas_audit after insert or update or delete on public.ponto_jornadas for each row execute function private.ponto_auditar();
create trigger t_ponto_jornada_dias_audit after insert or update or delete on public.ponto_jornada_dias for each row execute function private.ponto_auditar();
create trigger t_ponto_vinculos_audit after insert or update or delete on public.ponto_vinculos for each row execute function private.ponto_auditar();
create trigger t_ponto_config_audit after insert or update or delete on public.ponto_config_filial for each row execute function private.ponto_auditar();
create trigger t_ponto_programacao_audit after insert or update or delete on public.ponto_programacao for each row execute function private.ponto_auditar();
create trigger t_ponto_feriados_audit after insert or update or delete on public.ponto_feriados for each row execute function private.ponto_auditar();
create trigger t_ponto_ausencias_audit after insert or update or delete on public.ponto_ausencias for each row execute function private.ponto_auditar();
create trigger t_ponto_marcacoes_audit after insert or update on public.ponto_marcacoes for each row execute function private.ponto_auditar();
create trigger t_ponto_ajustes_audit after insert or update on public.ponto_ajustes for each row execute function private.ponto_auditar();
create trigger t_ponto_fechamentos_audit after insert or update or delete on public.ponto_fechamentos for each row execute function private.ponto_auditar();
create trigger t_ponto_banco_audit after insert or update or delete on public.ponto_banco_movimentos for each row execute function private.ponto_auditar();

-- ============================================================================================ RLS
alter table public.ponto_jornadas         enable row level security;
alter table public.ponto_jornada_dias     enable row level security;
alter table public.ponto_vinculos         enable row level security;
alter table public.ponto_config_filial    enable row level security;
alter table public.ponto_programacao      enable row level security;
alter table public.ponto_feriados         enable row level security;
alter table public.ponto_ausencias        enable row level security;
alter table public.ponto_marcacoes        enable row level security;
alter table public.ponto_ajustes          enable row level security;
alter table public.ponto_fechamentos      enable row level security;
alter table public.ponto_banco_movimentos enable row level security;
alter table public.ponto_pins             enable row level security;  -- sem política: ninguém lê nem grava direto

-- modelos de jornada, dias, feriados e configuração da filial: qualquer usuário lê; admin e RH gravam
create policy pjor_sel on public.ponto_jornadas for select to authenticated using (true);
create policy pjor_ins on public.ponto_jornadas for insert to authenticated with check ((select private.admin_ou_rh()));
create policy pjor_upd on public.ponto_jornadas for update to authenticated using ((select private.admin_ou_rh())) with check ((select private.admin_ou_rh()));
create policy pjor_del on public.ponto_jornadas for delete to authenticated using ((select private.admin_ou_rh()));

create policy pjd_sel on public.ponto_jornada_dias for select to authenticated using (true);
create policy pjd_ins on public.ponto_jornada_dias for insert to authenticated with check ((select private.admin_ou_rh()));
create policy pjd_upd on public.ponto_jornada_dias for update to authenticated using ((select private.admin_ou_rh())) with check ((select private.admin_ou_rh()));
create policy pjd_del on public.ponto_jornada_dias for delete to authenticated using ((select private.admin_ou_rh()));

create policy pfer_sel on public.ponto_feriados for select to authenticated using (true);
create policy pfer_ins on public.ponto_feriados for insert to authenticated with check ((select private.admin_ou_rh()));
create policy pfer_upd on public.ponto_feriados for update to authenticated using ((select private.admin_ou_rh())) with check ((select private.admin_ou_rh()));
create policy pfer_del on public.ponto_feriados for delete to authenticated using ((select private.admin_ou_rh()));

create policy pcfg_sel on public.ponto_config_filial for select to authenticated using (true);
create policy pcfg_ins on public.ponto_config_filial for insert to authenticated with check ((select private.admin_ou_rh()));
create policy pcfg_upd on public.ponto_config_filial for update to authenticated using ((select private.admin_ou_rh())) with check ((select private.admin_ou_rh()));
create policy pcfg_del on public.ponto_config_filial for delete to authenticated using ((select private.admin_ou_rh()));

-- jornada do funcionário, escala do dia e ausências: vê quem vê o ponto dele; grava quem gere (admin, RH, gerente)
create policy pvin_sel on public.ponto_vinculos for select to authenticated using ((select private.pode_ver_ponto_func(employee_id)));
create policy pvin_ins on public.ponto_vinculos for insert to authenticated with check ((select private.gere_ponto_func(employee_id)));
create policy pvin_upd on public.ponto_vinculos for update to authenticated using ((select private.gere_ponto_func(employee_id))) with check ((select private.gere_ponto_func(employee_id)));
create policy pvin_del on public.ponto_vinculos for delete to authenticated using ((select private.gere_ponto_func(employee_id)));

create policy pprg_sel on public.ponto_programacao for select to authenticated using ((select private.pode_ver_ponto_func(employee_id)));
create policy pprg_ins on public.ponto_programacao for insert to authenticated with check ((select private.gere_ponto_func(employee_id)));
create policy pprg_upd on public.ponto_programacao for update to authenticated using ((select private.gere_ponto_func(employee_id))) with check ((select private.gere_ponto_func(employee_id)));
create policy pprg_del on public.ponto_programacao for delete to authenticated using ((select private.gere_ponto_func(employee_id)));

create policy paus_sel on public.ponto_ausencias for select to authenticated using ((select private.pode_ver_ponto_func(employee_id)));
create policy paus_ins on public.ponto_ausencias for insert to authenticated with check ((select private.gere_ponto_func(employee_id)));
create policy paus_upd on public.ponto_ausencias for update to authenticated using ((select private.gere_ponto_func(employee_id))) with check ((select private.gere_ponto_func(employee_id)));
create policy paus_del on public.ponto_ausencias for delete to authenticated using ((select private.gere_ponto_func(employee_id)));

-- marcações: lê o próprio funcionário e quem vê a filial; gravar só pelas funções
create policy pmar_sel on public.ponto_marcacoes for select to authenticated
  using (employee_id = (select private.meu_employee()) or (select private.pode_ponto_filial(branch_id)));

-- ajustes: lê o funcionário, quem pediu e quem vê a filial; pedir = o próprio funcionário ou quem vê a filial;
-- decidir/cancelar só pelas funções
create policy paj_sel on public.ponto_ajustes for select to authenticated
  using (employee_id = (select private.meu_employee()) or solicitado_por = (select auth.uid()) or (select private.pode_ponto_filial(branch_id)));
create policy paj_ins on public.ponto_ajustes for insert to authenticated
  with check (
    status = 'pendente' and solicitado_por = (select auth.uid()) and decidido_por is null
    and (employee_id = (select private.meu_employee()) or (select private.pode_ponto_filial(branch_id)))
    and branch_id = (select private.filial_do_func(employee_id))
  );

-- banco: lê quem vê o ponto do funcionário; movimento manual = admin e RH (o fechamento grava pela função)
create policy pban_sel on public.ponto_banco_movimentos for select to authenticated using ((select private.pode_ver_ponto_func(employee_id)));
create policy pban_ins on public.ponto_banco_movimentos for insert to authenticated
  with check ((select private.admin_ou_rh()) and tipo <> 'fechamento' and fechamento_id is null);
create policy pban_del on public.ponto_banco_movimentos for delete to authenticated
  using ((select private.admin_ou_rh()) and tipo <> 'fechamento');

create policy pfec_sel on public.ponto_fechamentos for select to authenticated using ((select private.pode_ponto_filial(branch_id)));

-- ============================================================================================ funções
-- Registrar o ponto. Quem pode: o próprio funcionário (web/celular) ou, no relógio da filial, um usuário que vê a
-- filial + o PIN do funcionário. Tipo vazio = o próximo da sequência do dia (entrada → intervalo → retorno → saída).
-- PIN errado devolve {erro} em vez de exceção, para a tentativa contar (exceção desfaria a contagem).
create function public.ponto_registrar(
  p_employee uuid, p_tipo text, p_metodo text, p_pin text, p_dispositivo text, p_ip text,
  p_latitude numeric, p_longitude numeric, p_precisao numeric
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
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
    if not private.pode_ver_filial(e.branch_id) then raise exception 'Este relógio não atende a filial do funcionário.' using errcode = 'P0001'; end if;
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
end $$;
revoke all on function public.ponto_registrar(uuid, text, text, text, text, text, numeric, numeric, numeric) from public, anon;
grant execute on function public.ponto_registrar(uuid, text, text, text, text, text, numeric, numeric, numeric) to authenticated;

-- Funcionário pelo relógio da filial: matrícula → id (só filiais que o usuário vê; não revela nada além do nome).
create function public.ponto_relogio_identificar(p_branch uuid, p_matricula text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not private.pode_ver_filial(p_branch) then null else (
    select jsonb_build_object('id', e.id, 'nome', e.nome, 'tem_pin', exists (select 1 from public.ponto_pins p where p.employee_id = e.id))
      from public.employees e
     where e.branch_id = p_branch and e.status <> 'desligado' and btrim(e.matricula) = btrim(p_matricula)
     limit 1) end;
$$;
revoke all on function public.ponto_relogio_identificar(uuid, text) from public, anon;
grant execute on function public.ponto_relogio_identificar(uuid, text) to authenticated;

-- PIN (4 a 6 dígitos): o próprio funcionário ou quem gere a filial dele.
create function public.ponto_definir_pin(p_employee uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null or not (p_employee = private.meu_employee() or private.gere_ponto_func(p_employee)) then
    raise exception 'Sem permissão para definir o PIN deste funcionário.' using errcode = 'P0001';
  end if;
  if p_pin !~ '^\d{4,6}$' then raise exception 'O PIN tem de ter de 4 a 6 números.' using errcode = 'P0001'; end if;
  insert into public.ponto_pins (employee_id, pin_hash, definido_por, definido_em, tentativas, bloqueado_ate)
  values (p_employee, crypt(p_pin, gen_salt('bf', 8)), auth.uid(), now(), 0, null)
  on conflict (employee_id) do update set pin_hash = excluded.pin_hash, definido_por = excluded.definido_por, definido_em = now(), tentativas = 0, bloqueado_ate = null;
  insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_novo)
  values (auth.uid(), 'editar', 'ponto_pins', p_employee, jsonb_build_object('pin', 'definido'));
end $$;
revoke all on function public.ponto_definir_pin(uuid, text) from public, anon;
grant execute on function public.ponto_definir_pin(uuid, text) to authenticated;

-- Quem tem PIN (sem revelar o PIN): para a ficha e o relógio.
create function public.ponto_tem_pin(p_employees uuid[]) returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.employee_id from public.ponto_pins p where p.employee_id = any (p_employees) and private.pode_ver_ponto_func(p.employee_id);
$$;
revoke all on function public.ponto_tem_pin(uuid[]) from public, anon;
grant execute on function public.ponto_tem_pin(uuid[]) to authenticated;

-- Decidir um pedido de ajuste. Quem gere a filial; ninguém decide o próprio pedido nem o próprio ponto (só o
-- administrador). Período fechado: só o administrador, informando o motivo da exceção.
create function public.ponto_decidir_ajuste(p_id uuid, p_aprovar boolean, p_resposta text, p_motivo_fechado text) returns void
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
end $$;
revoke all on function public.ponto_decidir_ajuste(uuid, boolean, text, text) from public, anon;
grant execute on function public.ponto_decidir_ajuste(uuid, boolean, text, text) to authenticated;

-- Quem pediu desiste (só pendente).
create function public.ponto_cancelar_ajuste(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.ponto_ajustes set status = 'cancelado', decidido_por = auth.uid(), decidido_em = now()
   where id = p_id and status = 'pendente' and (solicitado_por = auth.uid() or private.sou_admin());
  if not found then raise exception 'Só quem pediu cancela, e só enquanto está pendente.' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.ponto_cancelar_ajuste(uuid) from public, anon;
grant execute on function public.ponto_cancelar_ajuste(uuid) to authenticated;

-- Fechar o mês da filial: grava o resumo e o saldo do mês de cada funcionário no banco de horas (calculados pela
-- aplicação com as mesmas regras do espelho). Admin e RH. Refazer um mês reaberto substitui os saldos.
create function public.ponto_fechar_mes(p_competencia date, p_branch uuid, p_resumo jsonb, p_saldos jsonb) returns uuid
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
  return f.id;
end $$;
revoke all on function public.ponto_fechar_mes(date, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.ponto_fechar_mes(date, uuid, jsonb, jsonb) to authenticated;

-- Reabrir: só o administrador, com motivo. Os saldos do fechamento saem do banco (voltam a ser calculados).
create function public.ponto_reabrir_mes(p_id uuid, p_motivo text) returns void
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
end $$;
revoke all on function public.ponto_reabrir_mes(uuid, text) from public, anon;
grant execute on function public.ponto_reabrir_mes(uuid, text) to authenticated;

-- ============================================================================================ feriados nacionais
insert into public.ponto_feriados (data, nome, abrangencia) values
  ('2026-01-01', 'Confraternização Universal', 'nacional'),
  ('2026-04-03', 'Sexta-feira Santa', 'nacional'),
  ('2026-04-21', 'Tiradentes', 'nacional'),
  ('2026-05-01', 'Dia do Trabalho', 'nacional'),
  ('2026-09-07', 'Independência do Brasil', 'nacional'),
  ('2026-10-12', 'Nossa Senhora Aparecida', 'nacional'),
  ('2026-11-02', 'Finados', 'nacional'),
  ('2026-11-15', 'Proclamação da República', 'nacional'),
  ('2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional'),
  ('2026-12-25', 'Natal', 'nacional'),
  ('2027-01-01', 'Confraternização Universal', 'nacional'),
  ('2027-03-26', 'Sexta-feira Santa', 'nacional'),
  ('2027-04-21', 'Tiradentes', 'nacional'),
  ('2027-05-01', 'Dia do Trabalho', 'nacional'),
  ('2027-09-07', 'Independência do Brasil', 'nacional'),
  ('2027-10-12', 'Nossa Senhora Aparecida', 'nacional'),
  ('2027-11-02', 'Finados', 'nacional'),
  ('2027-11-15', 'Proclamação da República', 'nacional'),
  ('2027-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional'),
  ('2027-12-25', 'Natal', 'nacional');
