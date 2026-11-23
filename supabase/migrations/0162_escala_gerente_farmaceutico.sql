-- Escala: função "gerente farmacêutico" (aparece como gerente e conta como farmacêutico na cobertura).
alter table public.esc_colaboradores drop constraint esc_colaboradores_funcao_check;
alter table public.esc_colaboradores add constraint esc_colaboradores_funcao_check
  check (funcao = any (array['farmaceutico', 'atendente', 'caixa', 'gerente', 'gerente_farmaceutico', 'estoquista',
                             'motorista', 'auditor', 'servicos_gerais', 'outros']));

create or replace function private.esc_funcao_do_cargo(p text)
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  select case
    when c like '%gerente%' and c like '%farmaceut%' then 'gerente_farmaceutico'
    when c like '%farmaceut%' then 'farmaceutico'
    when c like '%gerente%' then 'gerente'
    when c like '%estoqu%' then 'estoquista'
    when c like '%caixa%' or c like '%operador%' then 'caixa'
    when c like '%motorista%' or c like '%entregador%' or c like '%motoboy%' then 'motorista'
    when c like '%auditor%' then 'auditor'
    when c like '%servicos gerais%' or c like '%limpeza%' or c like '%zelador%' then 'servicos_gerais'
    when c like '%atendente%' or c like '%balconista%' or c like '%vendedor%' or c like '%perfumista%' then 'atendente'
    else 'outros' end
  from (select lower(translate(coalesce(p, ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')) c) x
$function$;
