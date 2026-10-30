-- "Vale Refeição" (Despesas com Pessoal no Omie) entra em Despesas com Pessoal na DRE (pedido de 30/10/2026).
insert into public.dre_plano_contas (categoria, linha) values ('vale refeição', 'despesas_pessoal')
on conflict do nothing;
