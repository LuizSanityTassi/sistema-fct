-- 0159 — Link do relógio permanente e sempre visível ao administrador (Luiz, 23/11/2026: "não quero que o link expire").
-- O link nunca venceu: vale até alguém gerar outro ou desativar. Agora ele também fica guardado para o administrador
-- copiar de novo quando quiser (só administrador lê a tabela; o link dá acesso só ao relógio da filial).
alter table public.relogio_links add column if not exists token text;
