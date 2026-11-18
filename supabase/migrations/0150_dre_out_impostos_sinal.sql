-- 0150 — Outubro/2026, VARELA: (−) Impostos s/ vendas da F004 (+43.372,02) e da F006 (+33.573,82) estavam POSITIVOS.
-- O contador digitou com "-" na frente (11/11 e 16/11) e a regra antiga invertia o sinal. Volta o sinal (mesmo valor,
-- negativo); continua marcado como digitado. A regra da digitação mudou no código: "-" na frente agora vale o sinal da
-- tela (imposto, dedução e despesa ficam negativos com ou sem o "-").
-- Outubro está travado pelo contador: a trava do mês é desligada só nesta transação. Cópia em
-- private.dre_contabil_bkp_2026_11_18_impostos_sinal.
begin;

create table if not exists private.dre_contabil_bkp_2026_11_18_impostos_sinal as
select d.*, now() as copiado_em
  from public.dre_contabil d
  join public.branches b on b.id = d.branch_id
 where d.empresa = 'VARELA' and d.competencia = date '2026-10-01' and d.linha = 'impostos_vendas'
   and b.codigo in ('F004', 'F006') and d.valor > 0;

do $$
begin
  if (select count(*) from private.dre_contabil_bkp_2026_11_18_impostos_sinal) <> 2
     or (select round(sum(valor), 2) from private.dre_contabil_bkp_2026_11_18_impostos_sinal) <> 76945.84 then
    raise exception 'Esperava F004 +43.372,02 e F006 +33.573,82: nada foi feito.';
  end if;
end $$;

alter table public.dre_contabil disable trigger t_contabil_trava;

update public.dre_contabil d
   set valor = -d.valor
  from private.dre_contabil_bkp_2026_11_18_impostos_sinal k
 where d.id = k.id and d.valor > 0;

alter table public.dre_contabil enable trigger t_contabil_trava;

insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_anterior, valor_novo)
select auth.uid(), 'editar', 'dre_contabil', null,
       jsonb_build_object('empresa', 'VARELA', 'competencia', '2026-10', 'linha', 'impostos_vendas',
                          'filiais', jsonb_object_agg(b.codigo, k.valor)),
       jsonb_build_object('empresa', 'VARELA', 'competencia', '2026-10', 'linha', 'impostos_vendas',
                          'filiais', jsonb_object_agg(b.codigo, -k.valor),
                          'motivo', 'Imposto digitado com "-" na frente ficou positivo (regra antiga invertia o sinal). Cópia em private.dre_contabil_bkp_2026_11_18_impostos_sinal')
  from private.dre_contabil_bkp_2026_11_18_impostos_sinal k
  join public.branches b on b.id = k.branch_id;

commit;
