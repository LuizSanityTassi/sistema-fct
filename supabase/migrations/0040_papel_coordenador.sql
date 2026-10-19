-- 0040 — Papel novo: coordenador de vendas (um por regional: Sul, Serra, Oeste). ALTER TYPE ... ADD VALUE precisa
-- ficar numa migração só dele (o valor novo não pode ser usado na mesma transação). As permissões vêm na 0041.
-- ADITIVA: um valor novo no enum app_role.
alter type public.app_role add value if not exists 'coordenador';
