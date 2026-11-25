-- Robô de vendas: novo relatório "horario" (Trier Rel_0212, Relatório de Vendas Por Horário), para a IA responder venda
-- por hora (pedido do Luiz, 25/11/2026). Só acrescenta o nome na lista aceita; nenhum dado muda.
alter table public.vendas_coletas drop constraint if exists vendas_coletas_relatorio_check;
alter table public.vendas_coletas add constraint vendas_coletas_relatorio_check
  check (relatorio = any (array['filiais', 'grupos', 'laboratorios', 'vendedores', 'atendimentos', 'tele_entrega', 'ecommerce', 'receita', 'tele_filial', 'devolucoes', 'horario']));
