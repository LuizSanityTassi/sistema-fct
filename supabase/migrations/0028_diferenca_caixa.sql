-- 0028 — Diferença de caixa (substitui a "Pesquisar Diferença de Caixa" da Zanini).
-- O robô do Trier lê o "Relatório de Diferenças de Caixa" (Rel_0122) de cada filial e grava um registro por caixa.
-- Regras da empresa:
--   • diferença = calculado do DINHEIRO no Trier (positivo = falta, negativo = sobra), a mesma conta da Zanini;
--   • até R$ 2,00 (para mais ou para menos) é tolerância: só o financeiro vê;
--   • acima de R$ 2,00 vira QUEBRA na hora: entra no desconto "Desc. Quebra de caixa" da folha do funcionário
--     (falta ou sobra; farmacêutico não tem quebra) e aparece para o colaborador do caixa, o responsável pela filial
--     ou o gerente justificar; o financeiro decide (mantém o desconto ou abona).
-- ADITIVA: só cria tabelas, funções e um campo novo em profiles (employee_id); afrouxa o check de origem da folha
-- para aceitar 'caixa'. Nada existente é apagado.

-- usuário do sistema ↔ cadastro de funcionário (quem é o colaborador do caixa no sistema)
alter table public.profiles add column if not exists employee_id uuid unique references public.employees(id) on delete set null;

-- o próprio usuário não troca o funcionário ligado a ele (só o administrador)
create or replace function private.proteger_campos_perfil()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
begin
  -- administrador (e o próprio banco/serviço, sem usuário na requisição) altera tudo
  if auth.uid() is null or private.sou_admin() then
    return new;
  end if;
  new.id := old.id;
  new.papel := old.papel;
  new.branch_id := old.branch_id;
  new.ativo := old.ativo;
  new.email := old.email;
  new.employee_id := old.employee_id;
  return new;
end;
$$;

-- operador do Trier (código único na rede) → funcionário do cadastro
create table public.caixa_operadores (
  cod_operador  integer primary key,
  nome_trier    text not null,
  employee_id   uuid references public.employees(id) on delete set null,
  vinculado_por uuid references public.profiles(id) on delete set null,
  vinculado_em  timestamptz,
  visto_em      timestamptz not null default now()
);
create index caixa_operadores_employee_idx on public.caixa_operadores (employee_id);

-- um registro por caixa do Trier (número do caixa é único na filial)
create table public.caixa_diferencas (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references public.branches(id) on delete restrict,
  numero_caixa  integer not null,
  dia           date not null,                        -- abertura do caixa
  fechamento    date,
  cod_operador  integer references public.caixa_operadores(cod_operador) on delete set null,
  nome_operador text not null,
  employee_id   uuid references public.employees(id) on delete set null,
  informado     numeric(12, 2) not null,              -- "Declarado" (dinheiro informado pelo operador)
  diferenca     numeric(12, 2) not null,              -- calculado do dinheiro: + falta, − sobra
  formas        jsonb not null default '[]'::jsonb,   -- todas as formas de pagamento do relatório
  classe        text generated always as (
                  case when abs(diferenca) < 0.005 then 'sem_diferenca'
                       when abs(diferenca) <= 2 then 'tolerancia'
                       else 'quebra' end) stored,
  valor_quebra  numeric(12, 2) generated always as (case when abs(diferenca) > 2 then abs(diferenca) else 0 end) stored,
  competencia   date generated always as ((date_trunc('month', dia::timestamp))::date) stored,
  andamento     text not null default 'pendente' check (andamento in ('pendente', 'justificada', 'mantida', 'abonada')),
  justificativa text check (length(justificativa) <= 2000),
  justificada_por uuid references public.profiles(id) on delete set null,
  justificada_em  timestamptz,
  decisao_obs   text check (length(decisao_obs) <= 2000),
  decidida_por  uuid references public.profiles(id) on delete set null,
  decidida_em   timestamptz,
  coletado_em   timestamptz not null default now(),
  unique (branch_id, numero_caixa)
);
create index caixa_dif_dia_idx on public.caixa_diferencas (dia desc, branch_id);
create index caixa_dif_employee_idx on public.caixa_diferencas (employee_id, competencia);
create index caixa_dif_quebra_idx on public.caixa_diferencas (andamento) where classe = 'quebra';

-- cada busca do robô: filial × dia (para saber o que já foi lido e o que deu erro)
create table public.caixa_coletas (
  dia          date not null,
  branch_id    uuid not null references public.branches(id) on delete cascade,
  status       text not null check (status in ('ok', 'erro')),
  caixas       integer not null default 0,
  mensagem     text,
  duracao_ms   integer,
  coletado_por uuid references public.profiles(id) on delete set null default auth.uid(),
  coletado_em  timestamptz not null default now(),
  primary key (dia, branch_id)
);

-- quem pode ver e justificar a quebra: o colaborador do caixa, o responsável pela filial ou o gerente dela
create or replace function private.pode_justificar_caixa(p_employee uuid, p_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.ativo and (
           (p_employee is not null and p.employee_id = p_employee)
        or (p.employee_id is not null and p.employee_id = (select b.responsavel_employee_id from public.branches b where b.id = p_branch))
        or (p.papel = 'gerente' and (p.branch_id = p_branch or exists (select 1 from public.user_branch_access u where u.user_id = p.id and u.branch_id = p_branch)))
     )
  );
$$;
grant execute on function private.pode_justificar_caixa(uuid, uuid) to authenticated;

alter table public.caixa_operadores enable row level security;
alter table public.caixa_diferencas enable row level security;
alter table public.caixa_coletas    enable row level security;
revoke all on public.caixa_operadores, public.caixa_diferencas, public.caixa_coletas from anon;

create policy cop_sel on public.caixa_operadores for select to authenticated using (private.sou_admin() or private.tem_papel('financeiro'));
create policy cop_wr  on public.caixa_operadores for all    to authenticated using (private.sou_admin() or private.tem_papel('financeiro')) with check (private.sou_admin() or private.tem_papel('financeiro'));
create policy ccol_sel on public.caixa_coletas   for select to authenticated using (private.sou_admin() or private.tem_papel('financeiro'));
create policy ccol_wr  on public.caixa_coletas   for all    to authenticated using (private.sou_admin() or private.tem_papel('financeiro')) with check (private.sou_admin() or private.tem_papel('financeiro'));
-- financeiro vê tudo (inclusive a tolerância); colaborador/gestor só as quebras do seu caixa ou da sua filial
create policy cdif_sel on public.caixa_diferencas for select to authenticated
  using (private.sou_admin() or private.tem_papel('financeiro') or (classe = 'quebra' and private.pode_justificar_caixa(employee_id, branch_id)));
create policy cdif_wr  on public.caixa_diferencas for all to authenticated
  using (private.sou_admin() or private.tem_papel('financeiro')) with check (private.sou_admin() or private.tem_papel('financeiro'));

-- justificativa de quem responde pelo caixa (não dá para mexer em valores, só no texto, até o financeiro decidir)
create or replace function public.caixa_justificar(p_id uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare r public.caixa_diferencas;
begin
  select * into r from public.caixa_diferencas where id = p_id;
  if r.id is null or r.classe <> 'quebra' then raise exception 'Quebra de caixa não encontrada.'; end if;
  if not (private.pode_justificar_caixa(r.employee_id, r.branch_id) or private.sou_admin() or private.tem_papel('financeiro')) then
    raise exception 'Você não responde por este caixa.';
  end if;
  if r.andamento in ('mantida', 'abonada') then raise exception 'O financeiro já decidiu esta quebra.'; end if;
  if length(coalesce(trim(p_texto), '')) < 10 then raise exception 'Escreva a justificativa (pelo menos 10 letras).'; end if;
  update public.caixa_diferencas
     set justificativa = left(trim(p_texto), 2000), justificada_por = auth.uid(), justificada_em = now(), andamento = 'justificada'
   where id = p_id;
end;
$$;
revoke all on function public.caixa_justificar(uuid, text) from public, anon;
grant execute on function public.caixa_justificar(uuid, text) to authenticated;

-- origem 'caixa' na folha: lançamento feito pelas quebras de caixa (o RH pode sobrescrever à mão)
alter table public.folha_lancamentos drop constraint if exists folha_lancamentos_origem_check;
alter table public.folha_lancamentos add constraint folha_lancamentos_origem_check check (origem in ('manual', 'importacao', 'caixa'));

-- soma das quebras do mês (exceto abonadas) → "Desc. Quebra de caixa" do funcionário. Não mexe se o RH lançou à mão.
create or replace function private.caixa_sincronizar_folha(p_employee uuid, p_competencia date)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_evento uuid;
  v_branch uuid;
  v_cargo  text;
  v_origem text;
  v_soma   numeric(12, 2);
begin
  if p_employee is null or p_competencia is null then return; end if;
  select id into v_evento from public.folha_eventos where chave = 'quebra_caixa';
  select branch_id, cargo into v_branch, v_cargo from public.employees where id = p_employee;
  if v_evento is null or v_branch is null then return; end if;
  select origem into v_origem from public.folha_lancamentos where competencia = p_competencia and employee_id = p_employee and evento_id = v_evento;
  if v_origem is not null and v_origem <> 'caixa' then return; end if;
  if upper(coalesce(v_cargo, '')) ~ 'FARMAC[EÊ]UTIC' then
    v_soma := 0; -- farmacêutico não tem quebra de caixa
  else
    select coalesce(sum(valor_quebra), 0) into v_soma from public.caixa_diferencas
     where employee_id = p_employee and competencia = p_competencia and classe = 'quebra' and andamento <> 'abonada';
  end if;
  if v_soma > 0 then
    insert into public.folha_lancamentos (competencia, employee_id, branch_id, evento_id, valor, origem, created_by, updated_by)
    values (p_competencia, p_employee, v_branch, v_evento, v_soma, 'caixa', auth.uid(), auth.uid())
    on conflict (competencia, employee_id, evento_id)
      do update set valor = excluded.valor, updated_by = excluded.updated_by where public.folha_lancamentos.origem = 'caixa';
  else
    delete from public.folha_lancamentos where competencia = p_competencia and employee_id = p_employee and evento_id = v_evento and origem = 'caixa';
  end if;
end;
$$;
revoke all on function private.caixa_sincronizar_folha(uuid, date) from public, anon, authenticated;

create or replace function private.t_caixa_folha()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform private.caixa_sincronizar_folha(old.employee_id, old.competencia); end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.employee_id is distinct from old.employee_id or new.competencia is distinct from old.competencia
       or new.valor_quebra is distinct from old.valor_quebra or new.andamento is distinct from old.andamento) then
    perform private.caixa_sincronizar_folha(new.employee_id, new.competencia);
  end if;
  return null;
end;
$$;
revoke all on function private.t_caixa_folha() from public, anon, authenticated;
create trigger t_caixa_dif_folha after insert or update or delete on public.caixa_diferencas for each row execute function private.t_caixa_folha();

-- ao ligar (ou trocar) o funcionário de um operador, as quebras ainda não decididas passam para ele
create or replace function private.t_caixa_operador_vinculo()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
begin
  if new.employee_id is distinct from old.employee_id then
    update public.caixa_diferencas set employee_id = new.employee_id where cod_operador = new.cod_operador and andamento in ('pendente', 'justificada');
  end if;
  return null;
end;
$$;
revoke all on function private.t_caixa_operador_vinculo() from public, anon, authenticated;
create trigger t_caixa_op_vinculo after update on public.caixa_operadores for each row execute function private.t_caixa_operador_vinculo();
