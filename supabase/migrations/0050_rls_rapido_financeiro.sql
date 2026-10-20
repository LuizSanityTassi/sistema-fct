-- Desempenho: as políticas de fin_lancamentos (e de caixa_sangrias) chamavam sou_admin()/tem_papel()/
-- pode_ver_filial() UMA VEZ POR LINHA — com ~18 mil lançamentos o DRE levava ~1 s para o admin e ~7,5 s
-- para o gerente (sem RLS: 16 ms). Mesma regra, agora avaliada uma vez por consulta:
--   * (select f()) vira "InitPlan" no Postgres e roda uma vez só;
--   * pode_ver_filial(branch_id) por linha vira "branch_id = any(lista das filiais que posso ver)",
--     lista calculada uma vez pela própria pode_ver_filial — o resultado é idêntico (branch_id é not null
--     e referencia branches).
-- Só troca expressões de política; nenhum dado é alterado.

create or replace function private.filiais_visiveis()
returns uuid[]
language sql
stable
security definer
set search_path = private, public
as $$
  select coalesce(array_agg(b.id), '{}'::uuid[]) from public.branches b where private.pode_ver_filial(b.id);
$$;
revoke all on function private.filiais_visiveis() from public, anon;
grant execute on function private.filiais_visiveis() to authenticated;

alter policy flan_sel on public.fin_lancamentos
  using (
    (select private.sou_admin())
    or (select private.tem_papel('financeiro', 'contador'))
    or ((select private.tem_papel('gerente', 'coordenador')) and branch_id = any ((select private.filiais_visiveis())::uuid[]))
  );

alter policy flan_ins on public.fin_lancamentos
  with check ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));

alter policy flan_upd on public.fin_lancamentos
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')))
  with check ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));

alter policy flan_del on public.fin_lancamentos
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro')));

alter policy csg_sel on public.caixa_sangrias
  using (
    (select private.sou_admin())
    or (select private.tem_papel('financeiro', 'contador'))
    or ((select private.tem_papel('gerente', 'usuario', 'coordenador')) and branch_id = any ((select private.filiais_visiveis())::uuid[]))
  );
