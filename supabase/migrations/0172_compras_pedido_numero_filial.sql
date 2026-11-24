-- Compras: o número do pré-pedido não é único na rede toda (o Trier numera por empresa: o 20013686 é da Germed na
-- F331 e da Geolab na F006). A chave passa a ser número + filial. Só troca a restrição; nenhum dado muda.
alter table public.cmp_pedidos drop constraint if exists cmp_pedidos_numero_uk;
alter table public.cmp_pedidos add constraint cmp_pedidos_numero_filial_uk unique (numero, filial_codigo);
