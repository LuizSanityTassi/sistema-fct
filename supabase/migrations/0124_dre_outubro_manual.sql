-- DRE contábil: outubro/2026 liberado como setembro (pedido do Luiz em 05/11/2026). As contas "amarelas" vêm do Omie pelo
-- plano de contas ou são digitadas, e a importação da planilha do contador não mexe nelas. Nada é apagado nem zerado:
-- outubro ainda não tem nenhum valor na DRE, e setembro segue como está.
create or replace function private.dre_manual(p_competencia date, p_linha text)
 returns boolean
 language sql
 immutable
as $function$
  select p_competencia in (date '2026-09-01', date '2026-10-01')
     and p_linha in ('devolucoes', 'comissoes', 'despesas_pessoal', 'despesas_administrativas', 'despesas_comerciais',
                     'outras_despesas', 'depreciacao', 'receita_financeira', 'outras_receitas', 'despesas_financeiras');
$function$;
