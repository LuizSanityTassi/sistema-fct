-- 0072 — Ponto: quem enxerga quem, sem abrir a tabela employees.
--
-- employees só é lida por admin, RH e gerente. O ponto precisa que o próprio funcionário ache o seu cadastro (Meu
-- ponto) e que o coordenador veja a equipe da regional. Em vez de afrouxar o RLS de employees (que vale para o RH
-- inteiro), estas funções devolvem só o que o ponto usa — nome, matrícula, cargo, filial, departamento, situação,
-- admissão/desligamento — e nunca CPF, salário ou contato.

create function public.ponto_equipe(p_branch uuid, p_departamento uuid, p_q text, p_ids uuid[], p_desligados boolean)
returns table (
  id uuid, nome text, matricula text, cargo text, branch_id uuid, department_id uuid, status text,
  data_admissao date, data_desligamento date, filial_codigo text, filial_nome text, departamento text
)
language sql stable security definer set search_path = public as $$
  select e.id, e.nome, e.matricula, e.cargo, e.branch_id, e.department_id, e.status::text, e.data_admissao, e.data_desligamento,
         b.codigo, b.nome, d.nome
    from public.employees e
    join public.branches b on b.id = e.branch_id
    left join public.departments d on d.id = e.department_id
   where (e.id = private.meu_employee() or private.pode_ponto_filial(e.branch_id))
     and (p_branch is null or e.branch_id = p_branch)
     and (p_departamento is null or e.department_id = p_departamento)
     and (p_ids is null or e.id = any (p_ids))
     and (coalesce(p_desligados, false) or e.status <> 'desligado')
     and (p_q is null or e.nome ilike '%' || p_q || '%')
   order by e.nome, e.id;
$$;
revoke all on function public.ponto_equipe(uuid, uuid, text, uuid[], boolean) from public, anon;
grant execute on function public.ponto_equipe(uuid, uuid, text, uuid[], boolean) to authenticated;

-- Nomes de quem pediu, decidiu, fechou ou reabriu algo do ponto que o usuário enxerga (profiles é restrito).
create function public.ponto_nomes(p_ids uuid[]) returns table (id uuid, nome text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nome
    from public.profiles p
   where p.id = any (p_ids)
     and (
       exists (select 1 from public.ponto_ajustes a
                where (a.solicitado_por = p.id or a.decidido_por = p.id)
                  and (a.employee_id = private.meu_employee() or a.solicitado_por = auth.uid() or private.pode_ponto_filial(a.branch_id)))
       or exists (select 1 from public.ponto_fechamentos f
                   where (f.fechado_por = p.id or f.reaberto_por = p.id) and private.pode_ponto_filial(f.branch_id))
     );
$$;
revoke all on function public.ponto_nomes(uuid[]) from public, anon;
grant execute on function public.ponto_nomes(uuid[]) to authenticated;

-- O funcionário precisa saber se o mês da filial dele está fechado (o banco de horas dele usa o lançamento do
-- fechamento no lugar do cálculo). O resumo do fechamento só tem totais da filial, sem dados de outras pessoas.
drop policy pfec_sel on public.ponto_fechamentos;
create policy pfec_sel on public.ponto_fechamentos for select to authenticated
  using ((select private.pode_ponto_filial(branch_id)) or branch_id = (select private.filial_do_func(private.meu_employee())));
