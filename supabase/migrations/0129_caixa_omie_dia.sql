-- 0129 — Caixa do Omie dia a dia (pedido do Luiz em 05/11/2026): o Caixa contábil é guardado por mês; para o backup por
-- dia, o robô lê no Omie cada movimento da conta corrente (pagamentos, recebimentos e lançamentos direto no extrato) pela
-- data de pagamento, nas duas empresas, e guarda somado por dia, natureza, categoria e departamento (filial).
-- Tabelas novas, nada existente muda. Leitura: administrador, financeiro e contador. Gravação: só o robô (chave de serviço).

create table if not exists public.fin_caixa_omie (
  id bigint generated always as identity primary key,
  empresa text not null check (empresa in ('varela', 'nazario')),
  data date not null,
  natureza text not null check (natureza in ('P', 'R')),
  grupo text not null default '',
  categoria_codigo text not null default '',
  categoria_nome text,
  departamento_codigo text not null default '',
  departamento_nome text,
  branch_id uuid references public.branches(id) on delete set null,
  valor numeric(18, 4) not null,
  movimentos integer not null default 0,
  coletado_em timestamptz not null default now()
);
create index if not exists fin_caixa_omie_dia_idx on public.fin_caixa_omie (empresa, data);
create index if not exists fin_caixa_omie_data_idx on public.fin_caixa_omie (data);

-- um registro por empresa e dia lido inteiro (o robô só grava depois de conferir o total de movimentos do Omie)
create table if not exists public.fin_caixa_omie_dias (
  empresa text not null check (empresa in ('varela', 'nazario')),
  data date not null,
  movimentos integer not null,
  total_pago numeric(18, 2),
  total_recebido numeric(18, 2),
  coletado_em timestamptz not null default now(),
  primary key (empresa, data)
);

alter table public.fin_caixa_omie enable row level security;
alter table public.fin_caixa_omie_dias enable row level security;
drop policy if exists fco_sel on public.fin_caixa_omie;
create policy fco_sel on public.fin_caixa_omie for select to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));
drop policy if exists fcod_sel on public.fin_caixa_omie_dias;
create policy fcod_sel on public.fin_caixa_omie_dias for select to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));
revoke insert, update, delete on public.fin_caixa_omie, public.fin_caixa_omie_dias from anon, authenticated;

-- Agendador: das 20h às 6h50 (Brasília = UTC−3), a cada 10 minutos. Mesma senha do robô de vendas de hoje (Vault).
select cron.schedule(
  'caixa-omie',
  '*/10 0-9,23 * * *',
  $$select net.http_get(
      url := 'https://portal.farmaciafct.com.br/api/cron/caixa-omie',
      headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'vendas_hoje_token')),
      timeout_milliseconds := 30000
    )$$
);
