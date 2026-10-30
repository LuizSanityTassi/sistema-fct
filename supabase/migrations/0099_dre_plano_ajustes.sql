-- Ajustes do plano de contas da DRE pedidos em 30/10/2026:
--   "Reembolso por Acordo" (Outras Entradas no Omie) entra em Outras Receitas;
--   "Pagamento FGI" sai das Despesas Financeiras (é pagamento do empréstimo, não despesa; "Pagamento Antecipação"
--   já estava fora).
insert into public.dre_plano_contas (categoria, linha) values ('reembolso por acordo', 'outras_receitas')
on conflict do nothing;
delete from public.dre_plano_contas where categoria in ('pagamento fgi', 'pagamento antecipação');
