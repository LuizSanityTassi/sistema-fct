-- Venda por horário (Trier Rel_0212, pedido do Luiz 25/11/2026, para a IA): a tela exige a filial, então o robô busca uma
-- filial por vez e guarda aqui o Excel de cada filial e dia (o mais novo substitui). A leitura para a tabela de venda por
-- hora entra depois de conferir o formato. Só o administrador lê; quem grava é o robô (service role).
create table if not exists public.vendas_hora_coletas (
  data         date not null,
  filial       integer not null,
  branch_id    uuid references public.branches (id),
  parcial      boolean not null default false,          -- dia de hoje ainda aberto
  status       text not null check (status in ('ok', 'vazio', 'erro')),
  erro         text,
  arquivo_b64  text,
  tamanho      integer,
  ms           integer,
  coletado_em  timestamptz not null default now(),
  lido_em      timestamptz,
  linhas       integer,
  primary key (data, filial)
);
create index if not exists vendas_hora_coletas_coletado_idx on public.vendas_hora_coletas (coletado_em);
alter table public.vendas_hora_coletas enable row level security;
drop policy if exists vhc_sel on public.vendas_hora_coletas;
create policy vhc_sel on public.vendas_hora_coletas for select to authenticated using ((select private.sou_admin()));

-- o "horario" que entrou na lista do robô de todas as filiais (0178) não é usado: a tela exige a filial
alter table public.vendas_coletas drop constraint if exists vendas_coletas_relatorio_check;
alter table public.vendas_coletas add constraint vendas_coletas_relatorio_check
  check (relatorio = any (array['filiais', 'grupos', 'laboratorios', 'vendedores', 'atendimentos', 'tele_entrega', 'ecommerce', 'receita', 'tele_filial', 'devolucoes', 'horario']));
