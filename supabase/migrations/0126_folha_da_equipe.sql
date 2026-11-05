-- Seção "Folha" no menu: o gerente consulta os lançamentos só dos colaboradores vinculados a ele (pedido do Luiz em 05/11/2026).
-- Vínculo: as filiais em que a pessoa é a responsável (cadastro da filial) e, para quem tem o papel Gerente, as filiais de
-- acesso dele. A leitura é só por esta função, que devolve nome, matrícula, cargo e os valores do mês: nada de CPF, salário,
-- observação do RH nem gravação. Por isso a liberação direta nas tabelas (0125) volta a ser só de admin e RH.

create or replace function private.filiais_da_equipe() returns uuid[]
language sql stable security definer set search_path = private, public as $$
  select coalesce(array_agg(distinct f.id), '{}'::uuid[]) from (
    select b.id from public.branches b where private.sou_admin()
    union all
    select v.id from unnest(private.filiais_visiveis()) as v(id) where private.tem_papel('gerente')
    union all
    select b.id
      from public.profiles p
      join public.employees e on e.id = p.employee_id and e.status <> 'desligado'
      join public.branches b on b.responsavel_employee_id = e.id
     where p.id = auth.uid() and p.ativo and p.papel <> 'relogio'
  ) f;
$$;
revoke all on function private.filiais_da_equipe() from public, anon;
grant execute on function private.filiais_da_equipe() to authenticated;

create or replace function public.folha_equipe(p_competencia date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_filiais uuid[];
  v_fim date;
begin
  if auth.uid() is null then raise exception 'Entre no sistema para ver a folha.' using errcode = 'P0001'; end if;
  if p_competencia is null or extract(day from p_competencia) <> 1 then raise exception 'Mês inválido.' using errcode = 'P0001'; end if;
  v_filiais := private.filiais_da_equipe();
  v_fim := (p_competencia + interval '1 month' - interval '1 day')::date;
  return jsonb_build_object(
    'eventos', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'unidade', e.unidade) order by e.ordem, e.nome), '[]'::jsonb)
                  from public.folha_eventos e where e.ativo and cardinality(v_filiais) > 0),
    'filiais', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'codigo', b.codigo, 'nome', b.nome) order by b.codigo), '[]'::jsonb)
                  from public.branches b where b.id = any (v_filiais)),
    'funcionarios', (select coalesce(jsonb_agg(jsonb_build_object(
                              'id', e.id, 'nome', e.nome, 'matricula', e.matricula, 'cargo', e.cargo, 'filial', e.branch_id,
                              'no_mes', e.data_admissao is null or e.data_admissao <= v_fim,
                              'valores', coalesce(v.valores, '{}'::jsonb)) order by e.nome), '[]'::jsonb)
                       from public.employees e
                       left join lateral (select jsonb_object_agg(l.evento_id, l.valor) as valores
                                            from public.folha_lancamentos l
                                           where l.employee_id = e.id and l.competencia = p_competencia) v on true
                      where e.branch_id = any (v_filiais) and e.status <> 'desligado'
                        and (e.data_admissao is null or e.data_admissao <= v_fim or v.valores is not null)));
end $$;
revoke all on function public.folha_equipe(date) from public, anon;
grant execute on function public.folha_equipe(date) to authenticated;

-- as tabelas voltam a ser só de admin e RH
drop policy if exists flanc_sel on public.folha_lancamentos;
create policy flanc_sel on public.folha_lancamentos for select to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('rh')));

drop policy if exists fev_sel on public.folha_eventos;
create policy fev_sel on public.folha_eventos for select to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('rh')));
