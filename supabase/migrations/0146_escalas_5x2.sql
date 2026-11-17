-- Escalas 5x2: simulador de escala por filial. Horário de cada filial, equipe da escala (ligada à ficha do RH quando
-- encontrada), opções do mês geradas pelo sistema, ajustes dia a dia e a escala oficial publicada.
-- Só cria coisas novas.

-- quem usa: administrador e RH (todas as filiais), coordenador (filiais da regional) e gerente (a filial dele)
create or replace function private.escala_acessa(b uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select private.sou_admin() or private.tem_papel('rh') or (private.tem_papel('coordenador', 'gerente') and private.pode_ver_filial(b));
$$;
revoke all on function private.escala_acessa(uuid) from public, anon;
grant execute on function private.escala_acessa(uuid) to authenticated;

create or replace function private.esc_carimbar()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
begin
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  new.atualizado_em := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Funcionamento da filial
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.esc_filiais (
  branch_id                uuid primary key references public.branches (id) on delete cascade,
  -- segunda a sexta (vazio = horário pendente); sábado e domingo vazios = loja fechada
  semana_abre              time,
  semana_fecha             time,
  sabado_abre              time,
  sabado_fecha             time,
  domingo_abre             time,
  domingo_fecha            time,
  min_farmaceuticos        smallint not null default 1 check (min_farmaceuticos between 0 and 9),
  acordo_jornada_estendida boolean not null default false,
  folgas_permitidas        smallint[] not null default '{2,3,4}'
                           check (folgas_permitidas <@ '{0,1,2,3,4,5,6}'::smallint[] and cardinality(folgas_permitidas) between 1 and 7),
  origem                   text check (char_length(origem) <= 200),
  atualizado_por           uuid references public.profiles (id) on delete set null,
  atualizado_em            timestamptz not null default now(),
  constraint esc_filiais_semana_ck check ((semana_abre is null) = (semana_fecha is null) and (semana_abre is null or semana_fecha > semana_abre)),
  constraint esc_filiais_sabado_ck check ((sabado_abre is null) = (sabado_fecha is null) and (sabado_abre is null or sabado_fecha > sabado_abre)),
  constraint esc_filiais_domingo_ck check ((domingo_abre is null) = (domingo_fecha is null) and (domingo_abre is null or domingo_fecha > domingo_abre))
);
drop trigger if exists esc_filiais_carimbo on public.esc_filiais;
create trigger esc_filiais_carimbo before insert or update on public.esc_filiais for each row execute function private.esc_carimbar();

alter table public.esc_filiais enable row level security;
create policy escfil_sel on public.esc_filiais for select to authenticated using (private.escala_acessa(branch_id));
create policy escfil_ins on public.esc_filiais for insert to authenticated with check (private.escala_acessa(branch_id));
create policy escfil_upd on public.esc_filiais for update to authenticated using (private.escala_acessa(branch_id)) with check (private.escala_acessa(branch_id));
create policy escfil_del on public.esc_filiais for delete to authenticated using ((select private.sou_admin()) or (select private.tem_papel('rh')));

-- ---------------------------------------------------------------------------------------------------------------
-- Equipe da escala
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.esc_colaboradores (
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid not null references public.branches (id) on delete cascade,
  employee_id     uuid references public.employees (id) on delete set null,
  nome            text not null check (char_length(btrim(nome)) between 2 and 120),
  funcao          text not null check (funcao in ('farmaceutico', 'atendente', 'caixa', 'gerente', 'estoquista', 'motorista', 'auditor', 'servicos_gerais', 'outros')),
  cargo_origem    text check (char_length(cargo_origem) <= 120),
  situacao        text not null default 'ativo' check (situacao in ('ativo', 'afastado', 'inativo')),
  horas_dia       numeric(4, 2) check (horas_dia between 1 and 12),
  intervalo_min   smallint not null default 60 check (intervalo_min between 0 and 240),
  registro        text check (char_length(registro) <= 40),
  observacoes     text check (char_length(observacoes) <= 500),
  -- textos de horário da planilha de origem: { "semana": "...", "sabado": "...", "domingo": "..." }
  horario_origem  jsonb,
  origem          text not null default 'manual' check (origem in ('planilha', 'manual', 'rh')),
  revisar         boolean not null default false,
  ordem           integer not null default 0,
  atualizado_por  uuid references public.profiles (id) on delete set null,
  atualizado_em   timestamptz not null default now(),
  criado_em       timestamptz not null default now()
);
create index if not exists esc_colaboradores_filial_idx on public.esc_colaboradores (branch_id, ordem);
create index if not exists esc_colaboradores_func_idx on public.esc_colaboradores (employee_id) where employee_id is not null;
create unique index if not exists esc_colaboradores_func_filial_uidx on public.esc_colaboradores (branch_id, employee_id) where employee_id is not null;
drop trigger if exists esc_colaboradores_carimbo on public.esc_colaboradores;
create trigger esc_colaboradores_carimbo before insert or update on public.esc_colaboradores for each row execute function private.esc_carimbar();

alter table public.esc_colaboradores enable row level security;
create policy esccol_sel on public.esc_colaboradores for select to authenticated using (private.escala_acessa(branch_id));
create policy esccol_ins on public.esc_colaboradores for insert to authenticated with check (private.escala_acessa(branch_id));
create policy esccol_upd on public.esc_colaboradores for update to authenticated using (private.escala_acessa(branch_id)) with check (private.escala_acessa(branch_id));
create policy esccol_del on public.esc_colaboradores for delete to authenticated using (private.escala_acessa(branch_id));

-- ---------------------------------------------------------------------------------------------------------------
-- Opções geradas e escala oficial
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.esc_simulacoes (
  id                uuid primary key default gen_random_uuid(),
  -- opções geradas juntas (uma filial ou várias)
  lote              uuid not null,
  branch_id         uuid not null references public.branches (id) on delete cascade,
  opcao             smallint not null check (opcao between 1 and 4),
  ano               smallint not null check (ano between 2024 and 2035),
  mes               smallint not null check (mes between 1 and 12),
  jornada_semanal   smallint not null check (jornada_semanal in (40, 42, 44)),
  folgas_permitidas smallint[] not null,
  -- horário e mínimos da filial no momento da geração (os ajustes recalculam com eles)
  config            jsonb not null,
  equipe            jsonb not null,
  cobertura         jsonb not null,
  alertas           jsonb not null default '[]',
  alertas_base      jsonb,
  analise           jsonb,
  analise_pendente  boolean not null default false,
  analisado_em      timestamptz,
  situacao          text not null default 'rascunho' check (situacao in ('rascunho', 'oficial', 'substituida')),
  publicado_por     uuid references public.profiles (id) on delete set null,
  publicado_em      timestamptz,
  criado_por        uuid references public.profiles (id) on delete set null,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  unique (lote, branch_id, opcao)
);
create index if not exists esc_simulacoes_lote_idx on public.esc_simulacoes (lote);
create index if not exists esc_simulacoes_filial_idx on public.esc_simulacoes (branch_id, ano, mes);
create index if not exists esc_simulacoes_data_idx on public.esc_simulacoes (criado_em desc);
-- uma escala oficial por filial e mês
create unique index if not exists esc_simulacoes_oficial_uidx on public.esc_simulacoes (branch_id, ano, mes) where situacao = 'oficial';

create or replace function private.esc_simulacao_regras()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.situacao <> 'rascunho' then
      raise exception 'A opção nasce como rascunho.';
    end if;
    new.criado_por := coalesce(auth.uid(), new.criado_por);
    new.criado_em := now();
    new.atualizado_em := now();
    return new;
  end if;
  -- escala oficial (ou substituída) não muda: só passa de oficial para substituída quando outra é publicada
  if old.situacao <> 'rascunho' then
    if old.situacao = 'oficial' and new.situacao = 'substituida' then
      new := old;
      new.situacao := 'substituida';
      new.atualizado_em := now();
      return new;
    end if;
    raise exception 'Escala oficial não pode ser alterada. Gere uma nova opção e publique.';
  end if;
  if new.situacao = 'substituida' then
    raise exception 'Só uma escala oficial pode ser substituída.';
  end if;
  if new.situacao = 'oficial' then
    if new.analise_pendente then
      raise exception 'Atualize as pendências antes de publicar.';
    end if;
    if jsonb_array_length(coalesce(new.alertas, '[]'::jsonb)) > 0 then
      raise exception 'Resolva as pendências da auditoria antes de publicar a escala oficial.';
    end if;
    new.publicado_por := auth.uid();
    new.publicado_em := now();
  end if;
  -- o que identifica a opção não muda
  new.lote := old.lote;
  new.branch_id := old.branch_id;
  new.opcao := old.opcao;
  new.ano := old.ano;
  new.mes := old.mes;
  new.jornada_semanal := old.jornada_semanal;
  new.folgas_permitidas := old.folgas_permitidas;
  new.config := old.config;
  new.criado_por := old.criado_por;
  new.criado_em := old.criado_em;
  new.atualizado_em := now();
  return new;
end;
$$;
drop trigger if exists esc_simulacoes_regras on public.esc_simulacoes;
create trigger esc_simulacoes_regras before insert or update on public.esc_simulacoes for each row execute function private.esc_simulacao_regras();

alter table public.esc_simulacoes enable row level security;
create policy escsim_sel on public.esc_simulacoes for select to authenticated using (private.escala_acessa(branch_id));
create policy escsim_ins on public.esc_simulacoes for insert to authenticated with check (private.escala_acessa(branch_id));
create policy escsim_upd on public.esc_simulacoes for update to authenticated using (private.escala_acessa(branch_id)) with check (private.escala_acessa(branch_id));
-- só rascunho é descartado; a oficial fica no histórico
create policy escsim_del on public.esc_simulacoes for delete to authenticated using (situacao = 'rascunho' and private.escala_acessa(branch_id));
