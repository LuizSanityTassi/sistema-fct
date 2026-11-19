-- 0155 — Vendas: "Alta rentabilidade" (grupo 113 do Trier) no lugar do Premium G47 (pedido do Luiz, 19/11/2026).
-- Em 03–04/11/2026 o Trier juntou os produtos do Premium (grupo 47) e da Marca Própria no grupo 113, que passou a se
-- chamar ALTA RENTABILIDADE (lista na planilha "GRUPO 113 E MARCA PROPRIA ATUALIZADO"). O grupo 47 não vende mais desde
-- 02/11, então a coluna "premium" das consultas zerou. A coluna (mesmo nome, para não mexer no resto) passa a somar os
-- grupos 47 e 113: depois da mudança é o grupo 113 inteiro; antes, Premium + Marca Própria — o mesmo conjunto, e as
-- comparações com os meses anteriores continuam valendo.
-- Troca só o filtro "grupo_codigo = 47" das três consultas (vendas_filiais, vendas_serie, vendas_tele_por_filial),
-- sobre a definição que está no banco; confere que cada uma tinha o filtro.
do $$
declare
  r record;
  nova text;
begin
  for r in
    select p.oid, p.proname, pg_get_functiondef(p.oid) def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('vendas_filiais', 'vendas_serie', 'vendas_tele_por_filial')
  loop
    nova := replace(r.def, 'grupo_codigo = 47)', 'grupo_codigo in (47, 113))');
    if nova = r.def then
      raise exception 'Filtro do grupo 47 não encontrado em %', r.proname;
    end if;
    execute nova;
  end loop;
end
$$;

do $$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('vendas_filiais', 'vendas_serie', 'vendas_tele_por_filial')
         and p.prosrc like '%grupo_codigo in (47, 113))%') <> 3 then
    raise exception 'Alguma consulta de vendas ficou sem o grupo 113.';
  end if;
end
$$;
