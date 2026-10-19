-- Perfis dos setores que atendem chamados: Manutenção, Compras e Marketing (pedido de 19/10/2026).
-- Valor novo de enum precisa de migração separada (não pode ser usado na mesma transação em que é criado).
alter type public.app_role add value if not exists 'manutencao';
alter type public.app_role add value if not exists 'compras';
alter type public.app_role add value if not exists 'marketing';
-- setor do chamado "Solicitações de Marketing" (antes caía em "outros")
alter type public.ticket_category add value if not exists 'marketing';
