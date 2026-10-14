-- 0024 — Lançamentos da folha para a contabilidade: o RH preenche durante o mês os eventos variáveis de cada
-- funcionário (horas extras, adicional noturno, quebra de caixa, farmácia, VT…) e o sistema gera, por CNPJ,
-- a planilha "RELAÇÃO DE VALORES PARA FOLHA DE PAGAMENTO" que a contabilidade importa na Domínio.
-- ADITIVA: só cria tabelas novas (nada existente é alterado ou apagado). Acesso: admin e RH (mesma regra da folha).

-- Catálogo de eventos (rubricas). Cada evento com código vira uma coluna da planilha, na ordem de `ordem`.
create table public.folha_eventos (
  id          uuid primary key default gen_random_uuid(),
  chave       text not null unique,                      -- identificador estável usado pela importação
  codigo      integer unique,                            -- código do evento na Domínio (null = ainda não informado)
  nome        text not null,                             -- cabeçalho da coluna na planilha
  unidade     text not null default 'valor' check (unidade in ('horas', 'valor')),
  ordem       smallint not null default 0,
  na_planilha boolean not null default true,             -- sai como coluna na planilha da contabilidade
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (not na_planilha or codigo is not null)
);
create trigger t_folha_eventos_upd before update on public.folha_eventos for each row execute function public.set_updated_at();

-- Dados de cada CNPJ (filial) na Domínio: código da empresa e a razão social que sai no cabeçalho.
create table public.folha_empresas_dominio (
  branch_id      uuid primary key references public.branches(id) on delete cascade,
  codigo_dominio integer check (codigo_dominio > 0),
  razao_social   text,                                    -- null = usa a razão social do cadastro da filial
  updated_by     uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger t_folha_emp_dom_upd before update on public.folha_empresas_dominio for each row execute function public.set_updated_at();

-- Valor de um evento para um funcionário numa competência (dia 1 do mês). branch_id = CNPJ de registro do
-- funcionário no momento do lançamento (é por ele que a planilha é separada).
create table public.folha_lancamentos (
  id          uuid primary key default gen_random_uuid(),
  competencia date not null check (extract(day from competencia) = 1),
  employee_id uuid not null references public.employees(id) on delete restrict,
  branch_id   uuid not null references public.branches(id) on delete restrict,
  evento_id   uuid not null references public.folha_eventos(id) on delete restrict,
  valor       numeric(12, 2) not null check (valor > 0),
  origem      text not null default 'manual' check (origem in ('manual', 'importacao')),
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (competencia, employee_id, evento_id)
);
create index folha_lanc_comp_branch_idx on public.folha_lancamentos (competencia, branch_id);
create index folha_lanc_employee_idx on public.folha_lancamentos (employee_id);
create index folha_lanc_evento_idx on public.folha_lancamentos (evento_id);
create trigger t_folha_lanc_upd before update on public.folha_lancamentos for each row execute function public.set_updated_at();

-- Anotação do mês por funcionário (falta a apurar, reembolso pedido, valor a conferir…). pendente = precisa de ação.
create table public.folha_observacoes (
  competencia date not null check (extract(day from competencia) = 1),
  employee_id uuid not null references public.employees(id) on delete restrict,
  texto       text not null check (length(texto) <= 2000),
  pendente    boolean not null default true,
  updated_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (competencia, employee_id)
);
create index folha_obs_employee_idx on public.folha_observacoes (employee_id);
create trigger t_folha_obs_upd before update on public.folha_observacoes for each row execute function public.set_updated_at();

alter table public.folha_eventos          enable row level security;
alter table public.folha_empresas_dominio enable row level security;
alter table public.folha_lancamentos      enable row level security;
alter table public.folha_observacoes      enable row level security;

create policy fev_sel   on public.folha_eventos          for select to authenticated using (private.sou_admin() or private.tem_papel('rh'));
create policy fev_wr    on public.folha_eventos          for all    to authenticated using (private.sou_admin() or private.tem_papel('rh')) with check (private.sou_admin() or private.tem_papel('rh'));
create policy fed_sel   on public.folha_empresas_dominio for select to authenticated using (private.sou_admin() or private.tem_papel('rh'));
create policy fed_wr    on public.folha_empresas_dominio for all    to authenticated using (private.sou_admin() or private.tem_papel('rh')) with check (private.sou_admin() or private.tem_papel('rh'));
create policy flanc_sel on public.folha_lancamentos      for select to authenticated using (private.sou_admin() or private.tem_papel('rh'));
create policy flanc_wr  on public.folha_lancamentos      for all    to authenticated using (private.sou_admin() or private.tem_papel('rh')) with check (private.sou_admin() or private.tem_papel('rh'));
create policy fobs_sel  on public.folha_observacoes      for select to authenticated using (private.sou_admin() or private.tem_papel('rh'));
create policy fobs_wr   on public.folha_observacoes      for all    to authenticated using (private.sou_admin() or private.tem_papel('rh')) with check (private.sou_admin() or private.tem_papel('rh'));

-- Eventos e códigos da planilha da contabilidade (modelo de 09/2026 da filial /0032). Horas extras 75% aparece
-- na planilha do RH (Chapecó, Joaçaba, Maravilha), mas ainda não tem código na Domínio: fica fora da planilha
-- até alguém informar o código na tela de configuração.
insert into public.folha_eventos (chave, codigo, nome, unidade, ordem, na_planilha) values
  ('he50',            150,  'Horas Extras 50%',      'horas',  10, true),
  ('he60',            160,  'Horas Extras 60%',      'horas',  20, true),
  ('he75',            null, 'Horas Extras 75%',      'horas',  25, false),
  ('he100',           200,  'Horas Extras 100%',     'horas',  30, true),
  ('adc_noturno',     2,    'Horas Noturnas',        'horas',  40, true),
  ('feriado',         259,  'Feriado trabalhado',    'horas',  50, true),
  ('domingo',         262,  'Domingo trabalhado',    'horas',  60, true),
  ('comissoes',       37,   'Comissoes',             'valor',  70, true),
  ('faltas_parciais', 8069, 'Faltas Parciais',       'horas',  80, true),
  ('adiantamento',    981,  'Adiant.Salario',        'valor',  90, true),
  ('farmacia',        231,  'Farmacia',              'valor', 100, true),
  ('quebra_caixa',    238,  'Desc. Quebra de caixa', 'valor', 110, true),
  ('vale_transporte', 48,   'Vale transporte',       'valor', 120, true),
  ('consignado',      265,  'Consignado',            'valor', 130, true),
  ('outros',          9999, 'Outros eventos',        'valor', 140, true);

-- Razão social da Varela como sai na planilha (o cadastro das filiais está sem o "LTDA") e o código Domínio
-- conhecido (801 = 30.598.529/0032-16, filial F112 UPA). Os demais códigos são informados na tela.
insert into public.folha_empresas_dominio (branch_id, codigo_dominio, razao_social, updated_by)
select b.id,
       case when regexp_replace(b.cnpj, '\D', '', 'g') = '30598529003216' then 801 end,
       'VARELA DA ROSA & RODRIGUES COMERCIO DE MEDICAMENTOS LTDA',
       null
  from public.branches b
 where left(regexp_replace(coalesce(b.cnpj, ''), '\D', '', 'g'), 8) = '30598529';
