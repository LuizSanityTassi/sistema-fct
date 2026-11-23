-- 0156 — Filial da folha, filial do ponto e gerente responsável separados (pedido do Luiz, 23/11/2026).
-- Até aqui employees.branch_id decidia tudo. Agora:
--   * branch_id            = filial da FOLHA (CNPJ/empresa, Domínio, lançamentos, quebra de caixa) — sem mudança;
--   * ponto_branch_id      = filial do PONTO (relógio, matrícula, digital, espelho, ajustes, fechamento, escala);
--                            vazio = a mesma da folha;
--   * ponto_filial_id      = coluna calculada: coalesce(ponto_branch_id, branch_id) — é ela que o ponto usa;
--   * gerente_employee_id  = gerente responsável pela pessoa; vazio = o responsável da filial do ponto.
--                            Quem é escolhido (com papel gerente/líder/coordenador) vê e gere o ponto dela, decide os
--                            ajustes e vê a pessoa na Folha da equipe, mesmo sendo de outra filial.
-- Ninguém muda de lugar com esta migração: ponto_branch_id e gerente_employee_id começam vazios.

alter table public.employees
  add column if not exists ponto_branch_id uuid references public.branches (id) on delete set null,
  add column if not exists gerente_employee_id uuid references public.employees (id) on delete set null;
alter table public.employees
  add column if not exists ponto_filial_id uuid generated always as (coalesce(ponto_branch_id, branch_id)) stored;
alter table public.employees drop constraint if exists employees_gerente_nao_proprio;
alter table public.employees add constraint employees_gerente_nao_proprio check (gerente_employee_id is null or gerente_employee_id <> id);
create index if not exists employees_ponto_filial_idx on public.employees (ponto_filial_id);
create index if not exists employees_gerente_idx on public.employees (gerente_employee_id) where gerente_employee_id is not null;
comment on column public.employees.branch_id is 'Filial da folha (empresa/CNPJ, Domínio, lançamentos).';
comment on column public.employees.ponto_branch_id is 'Filial do ponto; vazio = a mesma da folha.';
comment on column public.employees.ponto_filial_id is 'Filial usada pelo ponto: coalesce(ponto_branch_id, branch_id).';
comment on column public.employees.gerente_employee_id is 'Gerente responsável; vazio = responsável da filial do ponto.';

-- Pessoas que o usuário logado gere por ser o gerente responsável escolhido na ficha (só com papel de gestão).
create or replace function private.equipe_do_gerente()
returns uuid[]
language sql
stable
security definer
set search_path = private, public
as $$
  select coalesce(array_agg(e.id), '{}'::uuid[])
    from public.employees e
   where e.gerente_employee_id is not null
     and e.gerente_employee_id = private.meu_employee()
     and private.tem_papel('gerente', 'coordenador');
$$;

create or replace function private.gerencio_func(emp uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select emp = any (private.equipe_do_gerente());
$$;

-- Funções pequenas: reescritas inteiras.
create or replace function private.filial_do_func(emp uuid)
returns uuid
language sql
stable
security definer
set search_path = private, public
as $$
  select ponto_filial_id from public.employees where id = emp;
$$;

create or replace function private.gere_ponto_func(emp uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select exists (select 1 from public.employees e where e.id = emp and private.pode_rh_filial(e.ponto_filial_id))
      or private.gerencio_func(emp);
$$;

create or replace function private.pode_ver_ponto_func(emp uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select emp = private.meu_employee()
      or exists (select 1 from public.employees e where e.id = emp and private.pode_ponto_filial(e.ponto_filial_id))
      or private.gerencio_func(emp);
$$;

create or replace function public.ponto_equipe(p_branch uuid, p_departamento uuid, p_q text, p_ids uuid[], p_desligados boolean)
returns table (id uuid, nome text, matricula text, cargo text, branch_id uuid, department_id uuid, status text, data_admissao date,
               data_desligamento date, filial_codigo text, filial_nome text, departamento text)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.nome, e.matricula, e.cargo, e.ponto_filial_id, e.department_id, e.status::text, e.data_admissao, e.data_desligamento,
         b.codigo, b.nome, d.nome
    from public.employees e
    join public.branches b on b.id = e.ponto_filial_id
    left join public.departments d on d.id = e.department_id
   where (e.id = private.meu_employee() or private.pode_ponto_filial(e.ponto_filial_id) or e.id = any ((select private.equipe_do_gerente())::uuid[]))
     and (p_branch is null or e.ponto_filial_id = p_branch)
     and (p_departamento is null or e.department_id = p_departamento)
     and (p_ids is null or e.id = any (p_ids))
     and (coalesce(p_desligados, false) or e.status <> 'desligado')
     and (p_q is null or e.nome ilike '%' || p_q || '%')
   order by e.nome, e.id;
$$;

-- Folha da equipe: quem trabalha nas filiais da pessoa (pela filial do ponto) e quem a tem como gerente responsável.
create or replace function public.folha_equipe(p_competencia date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_filiais uuid[];
  v_eu uuid := private.meu_employee();
  v_fim date;
begin
  if auth.uid() is null then raise exception 'Entre no sistema para ver a folha.' using errcode = 'P0001'; end if;
  if p_competencia is null or extract(day from p_competencia) <> 1 then raise exception 'Mês inválido.' using errcode = 'P0001'; end if;
  v_filiais := private.filiais_da_equipe();
  v_fim := (p_competencia + interval '1 month' - interval '1 day')::date;
  return (
    with equipe as (
      select e.*
        from public.employees e
       where (e.ponto_filial_id = any (v_filiais) or (v_eu is not null and e.gerente_employee_id = v_eu))
         and e.status <> 'desligado'
    )
    select jsonb_build_object(
      'eventos', (select coalesce(jsonb_agg(jsonb_build_object('id', ev.id, 'nome', ev.nome, 'unidade', ev.unidade) order by ev.ordem, ev.nome), '[]'::jsonb)
                    from public.folha_eventos ev where ev.ativo and exists (select 1 from equipe)),
      'filiais', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'codigo', b.codigo, 'nome', b.nome) order by b.codigo), '[]'::jsonb)
                    from public.branches b where b.id = any (v_filiais) or b.id in (select q.ponto_filial_id from equipe q)),
      'funcionarios', (select coalesce(jsonb_agg(jsonb_build_object(
                                'id', q.id, 'nome', q.nome, 'matricula', q.matricula, 'cargo', q.cargo, 'filial', q.ponto_filial_id,
                                'no_mes', q.data_admissao is null or q.data_admissao <= v_fim,
                                'valores', coalesce(v.valores, '{}'::jsonb)) order by q.nome), '[]'::jsonb)
                         from equipe q
                         left join lateral (select jsonb_object_agg(l.evento_id, l.valor) as valores
                                              from public.folha_lancamentos l
                                             where l.employee_id = q.id and l.competencia = p_competencia) v on true
                        where q.data_admissao is null or q.data_admissao <= v_fim or v.valores is not null)));
end
$$;

-- Funções grandes: troca só os trechos que leem a filial do funcionário, conferindo quantas vezes cada um aparece.
do $$
declare
  t record;
  def text;
  nova text;
  achados integer;
begin
  for t in
    select * from (values
      ('public', 'ponto_registrar', 'select id, nome, branch_id, status into e from public.employees where id = p_employee;',
                                    'select id, nome, ponto_filial_id as branch_id, status into e from public.employees where id = p_employee;', 1),
      ('public', 'ponto_registrar_digital', 'select id, nome, branch_id, status into e from public.employees where id = d.employee_id;',
                                            'select id, nome, ponto_filial_id as branch_id, status into e from public.employees where id = d.employee_id;', 1),
      ('public', 'ponto_relogio_identificar', 'e.branch_id', 'e.ponto_filial_id', 3),
      ('public', 'ponto_digital_identificar', 'e.branch_id', 'e.ponto_filial_id', 2),
      ('public', 'ponto_digital_iniciar_filial', 'e.branch_id', 'e.ponto_filial_id', 2),
      ('public', 'ponto_auditoria', 'e.branch_id) as filial', 'e.ponto_filial_id) as filial', 1),
      ('private', 'ponto_travar_fechado', 'select e.branch_id into b from public.employees e', 'select e.ponto_filial_id into b from public.employees e', 1),
      ('public', 'ponto_decidir_ajuste', 'if not private.pode_rh_filial(a.branch_id) then',
                                         'if not (private.pode_rh_filial(a.branch_id) or private.gerencio_func(a.employee_id)) then', 1),
      ('public', 'ponto_nomes', 'or private.pode_ponto_filial(a.branch_id)))',
                                'or private.pode_ponto_filial(a.branch_id) or private.gerencio_func(a.employee_id)))', 1),
      ('private', 'esc_incluir_do_rh', 'select id, nome, cargo, status::text as status, branch_id into e from public.employees where id = p_employee;',
                                       'select id, nome, cargo, status::text as status, ponto_filial_id as branch_id into e from public.employees where id = p_employee;', 1),
      ('private', 'esc_sincronizar_rh', 'elsif new.branch_id is distinct from old.branch_id then',
                                        'elsif new.ponto_filial_id is distinct from old.ponto_filial_id then', 1),
      ('private', 'esc_sincronizar_rh', 'perform private.esc_retirar_do_rh(new.id, new.branch_id,',
                                        'perform private.esc_retirar_do_rh(new.id, new.ponto_filial_id,', 1)
    ) as x(esquema, nome, de, para, qtd)
  loop
    select pg_get_functiondef(p.oid) into def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = t.esquema and p.proname = t.nome;
    if def is null then raise exception 'Função %.% não encontrada.', t.esquema, t.nome; end if;
    achados := (length(def) - length(replace(def, t.de, ''))) / length(t.de);
    if achados <> t.qtd then
      raise exception '%.%: esperava % trecho(s) "%", achei %.', t.esquema, t.nome, t.qtd, t.de, achados;
    end if;
    nova := replace(def, t.de, t.para);
    execute nova;
  end loop;
end
$$;

-- Escala segue a filial do ponto: o gatilho também olha a troca da filial do ponto.
drop trigger if exists t_employees_escala on public.employees;
create trigger t_employees_escala
  after insert or update of status, branch_id, ponto_branch_id, nome, cargo on public.employees
  for each row execute function private.esc_sincronizar_rh();

-- Quem vê a ficha: o gerente também vê quem trabalha (ponto) nas filiais dele e quem o tem como gerente responsável.
drop policy if exists emp_sel on public.employees;
create policy emp_sel on public.employees for select to authenticated using (
  (select private.sou_admin())
  or (select private.tem_papel('rh'))
  or ((select private.tem_papel('gerente'))
      and (branch_id = any ((select private.filiais_visiveis())::uuid[]) or ponto_filial_id = any ((select private.filiais_visiveis())::uuid[])))
  or id = any ((select private.equipe_do_gerente())::uuid[])
);

drop policy if exists pmar_sel on public.ponto_marcacoes;
create policy pmar_sel on public.ponto_marcacoes for select to authenticated using (
  employee_id = (select private.meu_employee())
  or (select private.pode_ponto_filial(ponto_marcacoes.branch_id))
  or employee_id = any ((select private.equipe_do_gerente())::uuid[])
);

drop policy if exists paj_sel on public.ponto_ajustes;
create policy paj_sel on public.ponto_ajustes for select to authenticated using (
  employee_id = (select private.meu_employee())
  or solicitado_por = (select auth.uid())
  or (select private.pode_ponto_filial(ponto_ajustes.branch_id))
  or employee_id = any ((select private.equipe_do_gerente())::uuid[])
);

drop policy if exists paj_ins on public.ponto_ajustes;
create policy paj_ins on public.ponto_ajustes for insert to authenticated with check (
  status = 'pendente'
  and solicitado_por = (select auth.uid())
  and decidido_por is null
  and (employee_id = (select private.meu_employee())
       or (select private.pode_ponto_filial(ponto_ajustes.branch_id))
       or employee_id = any ((select private.equipe_do_gerente())::uuid[]))
  and branch_id = (select private.filial_do_func(ponto_ajustes.employee_id))
);

-- Opções do campo "Gerente responsável" na ficha (admin e RH): quem tem cargo/papel de gestão ou é responsável de filial.
create or replace function public.rh_gerentes_opcoes()
returns table (id uuid, nome text, cargo text, filial_codigo text, responsavel_de text, tem_login boolean)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.nome, e.cargo, b.codigo,
         (select string_agg(r.codigo, ', ' order by r.codigo) from public.branches r where r.responsavel_employee_id = e.id),
         exists (select 1 from public.profiles p where p.employee_id = e.id and p.ativo)
    from public.employees e
    join public.branches b on b.id = e.ponto_filial_id
   where private.admin_ou_rh()
     and e.status <> 'desligado'
     and (e.cargo ~* '(gerent|l[ií]der|coorden|supervis|encarregad)'
          or exists (select 1 from public.branches r where r.responsavel_employee_id = e.id)
          or exists (select 1 from public.profiles p where p.employee_id = e.id and p.ativo and p.papel in ('gerente', 'lider_loja', 'coordenador')))
   order by e.nome;
$$;
revoke all on function public.rh_gerentes_opcoes() from public, anon;
grant execute on function public.rh_gerentes_opcoes() to authenticated;
revoke all on function private.equipe_do_gerente() from public, anon;
revoke all on function private.gerencio_func(uuid) from public, anon;
grant execute on function private.equipe_do_gerente() to authenticated;
grant execute on function private.gerencio_func(uuid) to authenticated;
