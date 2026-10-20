-- Competência da quebra de caixa: do dia 21 do mês anterior ao dia 20 do mês (pedido do usuário, 20/10/2026) —
-- o mesmo ciclo da planilha do POS. Ex.: caixa aberto em 20/10 → outubro; em 21/10 → novembro.
-- Vale pela data de abertura do caixa (dia); competencia_folha (lançamento à mão / planilha) continua mandando.
-- A troca da expressão não dispara o gatilho da folha: quem mudou de mês é ressincronizado no fim
-- (sai da folha antiga e entra na nova). Em 20/10/2026 todas as quebras são de 14–15/10: nenhuma muda.

create temp table _quebra_comp_antes on commit drop as
  select id, employee_id, competencia from public.caixa_diferencas;

alter table public.caixa_diferencas
  alter column competencia set expression as (
    coalesce(
      competencia_folha,
      case
        when extract(day from dia) >= 21 then (date_trunc('month', dia::timestamp) + interval '1 month')::date
        else date_trunc('month', dia::timestamp)::date
      end
    )
  );

select private.caixa_sincronizar_folha(x.employee_id, x.competencia)
  from (
    select a.employee_id, a.competencia from _quebra_comp_antes a join public.caixa_diferencas d on d.id = a.id
     where d.competencia is distinct from a.competencia and a.employee_id is not null
    union
    select d.employee_id, d.competencia from _quebra_comp_antes a join public.caixa_diferencas d on d.id = a.id
     where d.competencia is distinct from a.competencia and d.employee_id is not null
  ) x;
