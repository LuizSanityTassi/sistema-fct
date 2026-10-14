-- 0015 — Papel "contador" (contabilidade externa): financeiro de todas as unidades, sem excluir nem fechar mês.
-- Em migração separada porque um valor novo de enum só pode ser usado depois de commitado.
alter type app_role add value if not exists 'contador';
