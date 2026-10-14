-- 0018 — Conciliação DDA (Itaú) × Contas a pagar (Trier), dentro do Sistema FCT (Etapa C1).
-- Substitui o app PHP "conciliacao.farmaciafct.com.br": arquivos ficam no Storage privado, o resto em tabelas.
--  • conc_arquivos: .RET do Itaú, planilha "Boletos Recebidos" do portal, relatório do Trier (PDF/XLS), planilha gerada p/ Omie
--  • conc_conciliacoes + conc_itens: cada rodada e a foto de cada conta (para pendências, comparação e painel)
--  • conc_pendencias: divergências com status/histórico (chave = conta: boleto+filial ou título do Trier)
--  • conc_depara / conc_aprendizado: boleto em nome de terceiro → fornecedor real; fornecedor Trier ↔ CNPJ aprendido
--  • conc_enviados_omie: contas já enviadas ao Omie (não mandar duas vezes); conc_config: categoria/conta padrão etc.
--  • conc_agentes: tokens (hash) do agente que manda os .RET do PC com o Itaú Mailbox
-- Quem vê: admin, financeiro, contador. Quem mexe: admin e financeiro (config e agentes: só admin).

create type conc_tipo_arquivo as enum ('dda_ret', 'dda_planilha', 'trier', 'omie');
create type conc_status_pendencia as enum ('pendente', 'em_analise', 'resolvido', 'justificado');

create table public.conc_arquivos (
  id             uuid primary key default gen_random_uuid(),
  tipo           conc_tipo_arquivo not null,
  nome           text not null,
  extensao       text not null,
  sha256         text not null,
  tamanho        bigint not null,
  storage_path   text not null,
  meta           jsonb not null default '{}'::jsonb,     -- empresa, cnpj, geracao, vencIni, vencFim, qtd, total
  filial         integer,                                 -- código Trier (301…) quando o arquivo é de UMA filial
  origem         text not null default 'upload' check (origem in ('upload', 'agente', 'robo_trier', 'sistema')),
  enviado_por    uuid references public.profiles(id) on delete set null,
  enviado_em     timestamptz not null default now(),
  vezes          integer not null default 1,              -- quantas vezes o mesmo arquivo foi enviado
  arquivado_em   timestamptz,
  arquivado_por  uuid references public.profiles(id) on delete set null,
  motivo_arquivo text,
  unique (sha256, tipo)
);
create index conc_arquivos_tipo_idx on public.conc_arquivos (tipo, enviado_em desc);

create table public.conc_conciliacoes (
  id               uuid primary key default gen_random_uuid(),
  titulo           text,
  criado_por       uuid references public.profiles(id) on delete set null,
  criado_em        timestamptz not null default now(),
  fil_min          integer not null,
  fil_max          integer not null,
  arquivos         uuid[] not null default '{}',
  resumo           jsonb not null default '{}'::jsonb,   -- contagens/valores por categoria, descontos, taxas aprendidas
  qtd_trier        integer not null default 0,
  qtd_dda          integer not null default 0,
  total_trier      numeric(16,2) not null default 0,
  total_dda        numeric(16,2) not null default 0,
  total_so_dda     numeric(16,2) not null default 0,
  pct_bateu        numeric(6,4),
  pct_valor_bateu  numeric(6,4),
  venc_ini         date,
  venc_fim         date,
  duracao_ms       integer
);
create index conc_conciliacoes_criado_idx on public.conc_conciliacoes (criado_em desc);

create table public.conc_itens (
  id              uuid primary key default gen_random_uuid(),
  conciliacao_id  uuid not null references public.conc_conciliacoes(id) on delete cascade,
  chave           text not null,                          -- Omie.chave(): DDA<hash barras>|filial ou TR<fil>-<doc>|filial
  grupo           text not null check (grupo in ('exato', 'aproximado', 'so_trier', 'so_dda')),
  categoria       text not null,                          -- EXATO, TAXA, …, SO_TRIER, SEM_ARQUIVO, SO_DDA
  filial          integer,
  branch_id       uuid references public.branches(id) on delete set null,
  fornecedor      text,                                   -- nome no Trier
  beneficiario    text,                                   -- nome no boleto
  cnpj            text,                                   -- CNPJ do beneficiário (boleto)
  documento       text,                                   -- documentos do Trier (DOC/PARC, …)
  numdoc          text,                                   -- nº do documento no boleto
  barra           text,
  valor           numeric(14,2) not null,                 -- valor da conta (boleto, ou título quando só no Trier)
  valor_trier     numeric(14,2),
  diferenca       numeric(14,2),
  vencimento      date,
  taxa            numeric(8,2),
  desconto        jsonb,
  alerta          text,
  fornecedor_real text,                                   -- do de-para
  dados           jsonb not null default '{}'::jsonb
);
create index conc_itens_conc_idx on public.conc_itens (conciliacao_id, grupo);
create index conc_itens_chave_idx on public.conc_itens (chave);

create table public.conc_pendencias (
  chave           text primary key,
  problema        text not null,                          -- SO_TRIER, SO_DDA, VALOR, DOCUMENTO, FILIAL, VALOR_DATA, DATA
  filial          integer,
  branch_id       uuid references public.branches(id) on delete set null,
  beneficiario    text,
  cnpj            text,
  documento       text,
  valor           numeric(14,2) not null default 0,
  vencimento      date,
  detalhe         text,
  status          conc_status_pendencia not null default 'pendente',
  auto            boolean not null default false,         -- resolvida pelo sistema (conciliou/enviou ao Omie)
  motivo          text,
  decidido_por    uuid references public.profiles(id) on delete set null,
  decidido_em     timestamptz,
  responsavel     uuid references public.profiles(id) on delete set null,
  atribuido_em    timestamptz,
  conciliacao_id  uuid references public.conc_conciliacoes(id) on delete set null,
  criado_em       timestamptz not null default now(),
  visto_em        timestamptz not null default now(),
  historico       jsonb not null default '[]'::jsonb
);
create index conc_pendencias_status_idx on public.conc_pendencias (status, vencimento);

create table public.conc_depara (
  id           uuid primary key default gen_random_uuid(),
  dda          text not null,                             -- começo do nome do beneficiário no DDA
  fornecedores text[] not null default '{}',              -- fornecedor(es) real(is) no Trier
  alerta       text,
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger t_conc_depara_upd before update on public.conc_depara for each row execute function public.set_updated_at();

create table public.conc_aprendizado (
  id             uuid primary key default gen_random_uuid(),
  fornecedor     text not null,                           -- nome do fornecedor no Trier
  raiz           char(8) not null,                        -- raiz do CNPJ do beneficiário
  beneficiario   text,
  taxas          integer[] not null default '{}',         -- tarifas em centavos vistas (139, 150…)
  vezes          integer not null default 0,
  bloqueado      boolean not null default false,
  confirmado     boolean not null default false,
  atualizado_em  timestamptz not null default now(),
  unique (fornecedor, raiz)
);

create table public.conc_enviados_omie (
  chave           text primary key,
  enviado_em      timestamptz not null default now(),
  enviado_por     uuid references public.profiles(id) on delete set null,
  conciliacao_id  uuid references public.conc_conciliacoes(id) on delete set null,
  arquivo_id      uuid references public.conc_arquivos(id) on delete set null,
  via             text not null default 'planilha' check (via in ('planilha', 'api')),
  empresa         text,                                   -- nazario | varela
  filial          integer,
  valor           numeric(14,2),
  vencimento      date,
  beneficiario    text,
  grupo           text,
  omie_codigo     text,
  desfeito_em     timestamptz,
  desfeito_por    uuid references public.profiles(id) on delete set null,
  motivo_desfazer text
);

create table public.conc_config (
  chave          text primary key,
  valor          jsonb not null,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references public.profiles(id) on delete set null
);

create table public.conc_agentes (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  token_hash  text not null unique,
  criado_por  uuid references public.profiles(id) on delete set null,
  criado_em   timestamptz not null default now(),
  revogado_em timestamptz,
  ultimo_uso  timestamptz,
  uploads     integer not null default 0
);

-- ---------- RLS ----------
alter table public.conc_arquivos       enable row level security;
alter table public.conc_conciliacoes   enable row level security;
alter table public.conc_itens          enable row level security;
alter table public.conc_pendencias     enable row level security;
alter table public.conc_depara         enable row level security;
alter table public.conc_aprendizado    enable row level security;
alter table public.conc_enviados_omie  enable row level security;
alter table public.conc_config         enable row level security;
alter table public.conc_agentes        enable row level security;

create policy carq_sel on public.conc_arquivos for select to authenticated using (private.sou_admin() or private.tem_papel('financeiro', 'contador'));
create policy carq_wr  on public.conc_arquivos for all    to authenticated using (private.sou_admin() or private.tem_papel('financeiro')) with check (private.sou_admin() or private.tem_papel('financeiro'));

create policy cconc_sel on public.conc_conciliacoes for select to authenticated using (private.sou_admin() or private.tem_papel('financeiro', 'contador'));
create policy cconc_wr  on public.conc_conciliacoes for all    to authenticated using (private.sou_admin() or private.tem_papel('financeiro')) with check (private.sou_admin() or private.tem_papel('financeiro'));

create policy citem_sel on public.conc_itens for select to authenticated using (private.sou_admin() or private.tem_papel('financeiro', 'contador'));
create policy citem_wr  on public.conc_itens for all    to authenticated using (private.sou_admin() or private.tem_papel('financeiro')) with check (private.sou_admin() or private.tem_papel('financeiro'));

create policy cpend_sel on public.conc_pendencias for select to authenticated using (private.sou_admin() or private.tem_papel('financeiro', 'contador'));
create policy cpend_wr  on public.conc_pendencias for all    to authenticated using (private.sou_admin() or private.tem_papel('financeiro')) with check (private.sou_admin() or private.tem_papel('financeiro'));

create policy cdep_sel on public.conc_depara for select to authenticated using (private.sou_admin() or private.tem_papel('financeiro', 'contador'));
create policy cdep_wr  on public.conc_depara for all    to authenticated using (private.sou_admin() or private.tem_papel('financeiro')) with check (private.sou_admin() or private.tem_papel('financeiro'));

create policy capr_sel on public.conc_aprendizado for select to authenticated using (private.sou_admin() or private.tem_papel('financeiro', 'contador'));
create policy capr_wr  on public.conc_aprendizado for all    to authenticated using (private.sou_admin() or private.tem_papel('financeiro')) with check (private.sou_admin() or private.tem_papel('financeiro'));

create policy cenv_sel on public.conc_enviados_omie for select to authenticated using (private.sou_admin() or private.tem_papel('financeiro', 'contador'));
create policy cenv_wr  on public.conc_enviados_omie for all    to authenticated using (private.sou_admin() or private.tem_papel('financeiro')) with check (private.sou_admin() or private.tem_papel('financeiro'));

create policy ccfg_sel on public.conc_config for select to authenticated using (private.sou_admin() or private.tem_papel('financeiro', 'contador'));
create policy ccfg_wr  on public.conc_config for all    to authenticated using (private.sou_admin()) with check (private.sou_admin());

create policy cag_all on public.conc_agentes for all to authenticated using (private.sou_admin()) with check (private.sou_admin());

-- ---------- Storage privado ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('conciliacao', 'conciliacao', false, 41943040)
on conflict (id) do nothing;

create policy conciliacao_select on storage.objects for select to authenticated
  using (bucket_id = 'conciliacao' and (private.sou_admin() or private.tem_papel('financeiro', 'contador')));
create policy conciliacao_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'conciliacao' and (private.sou_admin() or private.tem_papel('financeiro')));
create policy conciliacao_update on storage.objects for update to authenticated
  using (bucket_id = 'conciliacao' and (private.sou_admin() or private.tem_papel('financeiro')));

-- ---------- De-para inicial (lista do financeiro, 05/10/2026, usada hoje na ferramenta em produção) ----------
insert into public.conc_depara (dda, fornecedores, alerta) values
  ('ALIANCA CRED FUNDO INVEST', '{AGAPE INDUSTRIA E COM}', null),
  ('ARMATTURE ADMINISTRACAO FINANCEIRA', '{RIOMED DISTRIBUICAO}', null),
  ('BANCO SOFISA', '{DISPAR DISTRIBUIDORA DE MEDICA}', null),
  ('CARTAO DE COMPRA', '{BRITANIA}', null),
  ('CLAVE INTERNET', '{}', 'INDEVIDO - não pagar'),
  ('CSK ADMINISTRACAO FINANCEIRA', '{RIOMED DISTRIBUICAO}', null),
  ('MERCANTIL NP FUNDO DE INVESTIM', '{NEOSUL}', null),
  ('MULTIPLIKE SECURITIZADORA', '{QUALYBLESS DO BRASIL}', null),
  ('RED S', '{D CENTER DISTRIBUIDORA}', null),
  ('SENSIVE TRANSPORTE', '{HANNAS}', null),
  ('STARS BANK FIDC', '{DISPAR}', null),
  ('TEMPLI SECURITIZADORA', '{MULTIMED}', null),
  ('TRADEMASTER SERVICOS', '{FRONERI BRASIL}', null),
  ('TRANSENSIVE', '{HANNAS}', null),
  ('ASPER PARTICIPACOES', '{NEOBRAS}', null),
  ('PORTO LOCACOES', '{DROGASUL}', null),
  ('G SERVICOS', '{CONVCARD}', null),
  ('SC DISTRIBUICAO', '{PANPHARMA}', null),
  ('LAVILLE', '{BRILHO ATIVO}', null),
  ('AGAPE', '{AGAPE,ELEAH}', null);

insert into public.conc_config (chave, valor) values
  ('omie', '{"categoria": "Boletos Pagos Fornecedores", "conta": "Itaú Principal"}'::jsonb),
  ('faixas', '[{"nome": "Nazário", "min": 301, "max": 504}, {"nome": "Varela", "min": 1, "max": 112}, {"nome": "Itajaí", "min": 201, "max": 205}]'::jsonb);
