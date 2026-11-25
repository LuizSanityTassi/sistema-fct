-- Venda por horário (Trier Rel_0212, pedido do Luiz 25/11/2026): a venda de cada filial em cada hora do dia, lida do
-- Excel que o robô guarda em vendas_hora_coletas. Conferido: F011 em 24/11/2026 soma R$ 17.443,73 em 198 vendas e 736
-- produtos, igual a vendas_filial_dia. É o total da filial no Trier (com o que a televendas lançou nela). Quem grava é
-- só o servidor (chave de serviço); a leitura segue a regra das outras tabelas de vendas (0180).

create table public.vendas_hora_dia (
  branch_id uuid not null references public.branches (id) on delete cascade,
  data date not null,
  hora smallint not null check (hora between 0 and 23),
  vendas integer not null default 0,
  produtos numeric(14, 3) not null default 0,
  valor numeric(14, 2) not null default 0,
  primary key (branch_id, data, hora)
);
create index vendas_hora_dia_data_idx on public.vendas_hora_dia (data);

alter table public.vendas_hora_dia enable row level security;
revoke all on public.vendas_hora_dia from anon;
create policy vhd_sel on public.vendas_hora_dia for select to authenticated using (
  (select private.sou_admin()) or (select private.tem_papel('financeiro'))
  or branch_id = any ((select private.filiais_da_coordenacao())::uuid[])
  or ((select private.tem_papel('gerente')) and branch_id = any ((select private.filiais_visiveis())::uuid[]))
);
