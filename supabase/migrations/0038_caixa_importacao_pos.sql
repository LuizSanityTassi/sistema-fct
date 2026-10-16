-- 0038 — Importar a planilha do financeiro "POS Folha de Quebra de Caixa" (vendas pagas em outras modalidades:
-- PIX CNPJ, cartão POS, débito online, boleto…) e lançar cada venda como quebra (origem 'manual', motivo com a venda).
--  • chave_importacao: uma venda entra uma vez só (a planilha da semana seguinte repete as anteriores);
--  • competencia_folha: a planilha vai de 21 a 20 (21/08 a 20/09 = folha de setembro); quando preenchida, manda na
--    competência da quebra (senão continua o mês do dia, como antes);
--  • lote_importacao: para desfazer uma importação inteira (só o que o financeiro ainda não decidiu).
-- ADITIVA: três colunas novas; a expressão da competência passa a olhar competencia_folha (igual para o que já existe,
-- porque ela está vazia em tudo).

alter table public.caixa_diferencas add column if not exists chave_importacao text unique;
alter table public.caixa_diferencas add column if not exists competencia_folha date check (competencia_folha is null or extract(day from competencia_folha) = 1);
alter table public.caixa_diferencas add column if not exists lote_importacao uuid;
create index if not exists caixa_dif_lote_idx on public.caixa_diferencas (lote_importacao) where lote_importacao is not null;

alter table public.caixa_diferencas alter column competencia set expression as (coalesce(competencia_folha, (date_trunc('month', dia::timestamp))::date));
