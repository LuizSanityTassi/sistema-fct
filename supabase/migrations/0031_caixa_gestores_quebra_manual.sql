-- 0031 — Diferença de caixa: quebra lançada à mão pelo financeiro e gestor responsável por loja/quebra.
-- Pedido do usuário (16/10/2026):
--   • o financeiro lança quebra manual para qualquer colaborador (vale mesmo abaixo de R$ 2,00: foi lançada de propósito);
--   • só o superior direto (o gestor da loja) justifica; o colaborador do caixa vê a própria quebra, sem justificar;
--   • o financeiro escolhe e troca o gestor (da loja e de cada quebra).
-- ADITIVA: colunas novas, tabela caixa_gestores e funções; a quebra que já existe continua igual (origem 'trier').

alter table public.caixa_diferencas add column if not exists origem text not null default 'trier' check (origem in ('trier', 'manual'));
alter table public.caixa_diferencas add column if not exists descricao text check (length(descricao) <= 2000);
alter table public.caixa_diferencas add column if not exists lancada_por uuid references public.profiles(id) on delete set null;
alter table public.caixa_diferencas add column if not exists lancada_por_nome text;
alter table public.caixa_diferencas add column if not exists gestor_id uuid references public.profiles(id) on delete set null;
alter table public.caixa_diferencas alter column numero_caixa drop not null; -- quebra manual não tem caixa do Trier
create index if not exists caixa_dif_gestor_idx on public.caixa_diferencas (gestor_id) where classe = 'quebra';

-- quebra manual é sempre quebra (o financeiro decidiu lançar), a do Trier segue a tolerância de R$ 2,00
alter table public.caixa_diferencas alter column classe set expression as (
  case when abs(diferenca) < 0.005 then 'sem_diferenca'
       when origem = 'manual' then 'quebra'
       when abs(diferenca) <= 2 then 'tolerancia'
       else 'quebra' end);
alter table public.caixa_diferencas alter column valor_quebra set expression as (
  case when origem = 'manual' or abs(diferenca) > 2 then abs(diferenca) else 0 end);

-- gestor das quebras de cada loja (o financeiro escolhe; vale para as quebras novas)
create table if not exists public.caixa_gestores (
  branch_id   uuid primary key references public.branches(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  definido_por uuid references public.profiles(id) on delete set null default auth.uid(),
  definido_em timestamptz not null default now()
);
alter table public.caixa_gestores enable row level security;
revoke all on public.caixa_gestores from anon;
create policy cges_sel on public.caixa_gestores for select to authenticated using (private.sou_admin() or private.tem_papel('financeiro'));
create policy cges_wr  on public.caixa_gestores for all    to authenticated using (private.sou_admin() or private.tem_papel('financeiro')) with check (private.sou_admin() or private.tem_papel('financeiro'));

-- quebra nova (do Trier ou manual) já nasce com o gestor da loja
create or replace function private.t_caixa_gestor_padrao()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
begin
  if new.gestor_id is null then
    select g.profile_id into new.gestor_id from public.caixa_gestores g where g.branch_id = new.branch_id;
  end if;
  return new;
end;
$$;
revoke all on function private.t_caixa_gestor_padrao() from public, anon, authenticated;
drop trigger if exists t_caixa_dif_gestor on public.caixa_diferencas;
create trigger t_caixa_dif_gestor before insert on public.caixa_diferencas for each row execute function private.t_caixa_gestor_padrao();

-- quem vê e justifica: o gestor da quebra; sem gestor definido, o gerente da loja
create or replace function private.pode_justificar_quebra(p_gestor uuid, p_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.ativo and (
           (p_gestor is not null and p.id = p_gestor)
        or (p_gestor is null and p.papel = 'gerente'
            and (p.branch_id = p_branch or exists (select 1 from public.user_branch_access u where u.user_id = p.id and u.branch_id = p_branch)))
     )
  );
$$;
grant execute on function private.pode_justificar_quebra(uuid, uuid) to authenticated;

-- quem vê: o gestor (justifica) e o próprio colaborador do caixa (só vê; usuário ligado ao cadastro do funcionário)
create or replace function private.pode_ver_quebra(p_employee uuid, p_gestor uuid, p_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select private.pode_justificar_quebra(p_gestor, p_branch)
      or (p_employee is not null and exists (select 1 from public.profiles p where p.id = auth.uid() and p.ativo and p.employee_id = p_employee));
$$;
grant execute on function private.pode_ver_quebra(uuid, uuid, uuid) to authenticated;

drop policy if exists cdif_sel on public.caixa_diferencas;
create policy cdif_sel on public.caixa_diferencas for select to authenticated
  using (private.sou_admin() or private.tem_papel('financeiro') or (classe = 'quebra' and private.pode_ver_quebra(employee_id, gestor_id, branch_id)));

create or replace function public.caixa_justificar(p_id uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare r public.caixa_diferencas;
begin
  select * into r from public.caixa_diferencas where id = p_id;
  if r.id is null or r.classe <> 'quebra' then raise exception 'Quebra de caixa não encontrada.'; end if;
  if not (private.pode_justificar_quebra(r.gestor_id, r.branch_id) or private.sou_admin() or private.tem_papel('financeiro')) then
    raise exception 'Só o gestor da loja justifica esta quebra.';
  end if;
  if r.andamento in ('mantida', 'abonada') then raise exception 'O financeiro já decidiu esta quebra.'; end if;
  if length(coalesce(trim(p_texto), '')) < 10 then raise exception 'Escreva a justificativa (pelo menos 10 letras).'; end if;
  update public.caixa_diferencas
     set justificativa = left(trim(p_texto), 2000), justificada_por = auth.uid(), justificada_em = now(), andamento = 'justificada',
         justificada_por_nome = (select nullif(trim(p.nome), '') from public.profiles p where p.id = auth.uid())
   where id = p_id;
end;
$$;

-- a regra antiga (colaborador do caixa também justificava) sai de cena
drop function if exists private.pode_justificar_caixa(uuid, uuid);

-- usuários que podem ser gestor (para o financeiro escolher): só nome, papel e loja
create or replace function public.caixa_usuarios()
returns table (id uuid, nome text, papel text, branch_id uuid, filial text)
language sql
stable
security definer
set search_path = private, public
as $$
  select p.id, coalesce(nullif(trim(p.nome), ''), split_part(p.email, '@', 1)), p.papel::text, p.branch_id, b.codigo
    from public.profiles p
    left join public.branches b on b.id = p.branch_id
   where p.ativo and (private.sou_admin() or private.tem_papel('financeiro'))
   order by 2;
$$;
revoke all on function public.caixa_usuarios() from public, anon;
grant execute on function public.caixa_usuarios() to authenticated;
