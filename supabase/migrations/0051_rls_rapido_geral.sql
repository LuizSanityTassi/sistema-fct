-- Desempenho: o mesmo ajuste da 0050 em TODAS as outras políticas (public + storage).
-- Funções que não dependem da linha passam a rodar uma vez por consulta ("InitPlan"), não uma vez por linha:
--   private.sou_admin()            -> (select private.sou_admin())
--   private.tem_papel(...)         -> (select private.tem_papel(...))
--   private.responde_denuncias()   -> (select private.responde_denuncias())
--   auth.uid()                     -> (select auth.uid())
--   private.pode_ver_filial(col)   -> (col is null or col = any (filiais que posso ver))   [pode_ver_filial(null) = true]
-- employees.emp_sel usava pode_rh_filial(branch_id) = sou_admin() or tem_papel('rh') or (tem_papel('gerente') and
-- pode_ver_filial(b)); fica escrita por extenso no mesmo formato (se pode_rh_filial mudar, mude aqui também).
-- Funções que dependem da linha (pode_ver_ticket, pode_ver_quebra, pode_ver_employee, pode_anexar_*...) ficam como estão.
-- As da 0050 (fin_lancamentos, caixa_sangrias.csg_sel) já estão no formato novo e são puladas.
-- Só troca expressões de política; nenhum dado é alterado.

create or replace function pg_temp.rls_rapido(t text) returns text language sql immutable as $$
  select regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(t,
    'private\.sou_admin\(\)', '(select private.sou_admin())', 'g'),
    'private\.tem_papel\((VARIADIC ARRAY\[[^]]*\])\)', '(select private.tem_papel(\1))', 'g'),
    'private\.responde_denuncias\(\)', '(select private.responde_denuncias())', 'g'),
    'auth\.uid\(\)', '(select auth.uid())', 'g'),
    'private\.pode_ver_filial\(([a-z_.]+)\)', '(\1 IS NULL OR \1 = ANY ((select private.filiais_visiveis())::uuid[]))', 'g');
$$;

do $$
declare
  p record;
  q text;
  w text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname in ('public', 'storage')
       and not (schemaname = 'public' and tablename = 'employees' and policyname = 'emp_sel')
       and coalesce(qual, '') || coalesce(with_check, '') !~ ' AS (sou_admin|tem_papel|filiais_visiveis)\)'
  loop
    q := pg_temp.rls_rapido(p.qual);
    w := pg_temp.rls_rapido(p.with_check);
    if q is distinct from p.qual or w is distinct from p.with_check then
      execute format('alter policy %I on %I.%I%s%s', p.policyname, p.schemaname, p.tablename,
        case when q is not null then ' using (' || q || ')' else '' end,
        case when w is not null then ' with check (' || w || ')' else '' end);
    end if;
  end loop;
end $$;

alter policy emp_sel on public.employees
  using (
    (select private.sou_admin())
    or (select private.tem_papel('rh'))
    or ((select private.tem_papel('gerente')) and branch_id = any ((select private.filiais_visiveis())::uuid[]))
  );
