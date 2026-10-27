-- Coordenação → Checklist da loja (Check-list Coordenador Regional): o coordenador de vendas avalia a loja (itens de
-- 0 a 5 estrelas), registra os direcionamentos e o que ficou acordado e escolhe o gerente; o gerente, no usuário dele,
-- confirma que recebeu a avaliação e os indicadores (ou diz que não concorda, com o motivo).
-- Só cria coisas novas.

create table if not exists public.coord_checklists (
  id                  uuid primary key default gen_random_uuid(),
  branch_id           uuid not null references public.branches (id),
  data                date not null,
  coordenador_id      uuid references public.profiles (id) on delete set null,
  coordenador_nome    text,
  gerente_id          uuid not null references public.profiles (id),
  gerente_nome        text,
  -- [{ "chave": "fachada", "item": "Fachada limpa…", "nota": 0..5 }] (o texto do item vai junto: mudar a lista não muda o histórico)
  notas               jsonb not null,
  media               numeric(3, 2),
  direcionamentos     text[] not null default '{}',
  acordos             text[] not null default '{}',
  situacao            text not null default 'aguardando' check (situacao in ('aguardando', 'confirmado', 'contestado', 'cancelado')),
  criado_em           timestamptz not null default now(),
  respondido_em       timestamptz,
  resposta_comentario text check (char_length(resposta_comentario) <= 1000),
  cancelado_por       uuid references public.profiles (id) on delete set null,
  cancelado_em        timestamptz,
  motivo_cancelamento text check (char_length(motivo_cancelamento) <= 500),
  constraint coord_checklist_textos check (cardinality(direcionamentos) <= 30 and cardinality(acordos) <= 30)
);
create index if not exists coord_checklists_loja_idx on public.coord_checklists (branch_id, data desc);
create index if not exists coord_checklists_gerente_idx on public.coord_checklists (gerente_id, situacao);
create index if not exists coord_checklists_coord_idx on public.coord_checklists (coordenador_id, data desc);

-- quem faz o checklist: administrador ou coordenador que enxerga a loja (regional dele)
create or replace function private.pode_fazer_checklist(b uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select private.sou_admin() or (private.tem_papel('coordenador') and private.pode_ver_filial(b));
$$;
revoke all on function private.pode_fazer_checklist(uuid) from public, anon;
grant execute on function private.pode_fazer_checklist(uuid) to authenticated;

-- carimbos e regras (ninguém forja quem avaliou nem a resposta do gerente)
create or replace function private.coord_checklist_carimbar()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_nome text := (select coalesce(nullif(trim(nome), ''), email) from public.profiles where id = auth.uid());
  v_admin boolean := private.sou_admin();
  v_item jsonb;
begin
  if tg_op = 'INSERT' then
    if jsonb_typeof(new.notas) <> 'array' or jsonb_array_length(new.notas) not between 1 and 40 then
      raise exception 'Avalie os itens do checklist.';
    end if;
    for v_item in select * from jsonb_array_elements(new.notas) loop
      if coalesce(jsonb_typeof(v_item -> 'nota'), '') <> 'number' or (v_item ->> 'nota')::numeric not in (0, 1, 2, 3, 4, 5)
         or coalesce(v_item ->> 'item', '') = '' then
        raise exception 'Cada item precisa de uma nota de 0 a 5 estrelas.';
      end if;
    end loop;
    new.gerente_nome := (select coalesce(nullif(trim(nome), ''), email) from public.profiles where id = new.gerente_id and ativo and papel = 'gerente');
    if new.gerente_nome is null then raise exception 'Escolha um gerente com usuário ativo no sistema.'; end if;
    new.media := (select round(avg((e ->> 'nota')::numeric), 2) from jsonb_array_elements(new.notas) e);
    new.coordenador_id := auth.uid();
    new.coordenador_nome := v_nome;
    new.criado_em := now();
    new.situacao := 'aguardando';
    new.respondido_em := null; new.resposta_comentario := null;
    new.cancelado_por := null; new.cancelado_em := null; new.motivo_cancelamento := null;
    return new;
  end if;

  -- o que foi avaliado não muda (para corrigir: cancelar e fazer de novo)
  new.branch_id := old.branch_id; new.data := old.data; new.notas := old.notas; new.media := old.media;
  new.direcionamentos := old.direcionamentos; new.acordos := old.acordos;
  new.coordenador_id := old.coordenador_id; new.coordenador_nome := old.coordenador_nome; new.criado_em := old.criado_em;
  new.gerente_id := old.gerente_id; new.gerente_nome := old.gerente_nome;

  if new.situacao is distinct from old.situacao then
    if old.situacao <> 'aguardando' then raise exception 'Este checklist já foi respondido ou cancelado.'; end if;
    if new.situacao in ('confirmado', 'contestado') then
      if old.gerente_id is distinct from auth.uid() then raise exception 'Só o gerente escolhido responde o checklist.'; end if;
      if new.situacao = 'contestado' and coalesce(trim(new.resposta_comentario), '') = '' then
        raise exception 'Conte por que não concorda.';
      end if;
      new.respondido_em := now();
      new.cancelado_por := null; new.cancelado_em := null; new.motivo_cancelamento := null;
    elsif new.situacao = 'cancelado' then
      if not (v_admin or old.coordenador_id = auth.uid()) then raise exception 'Só quem fez o checklist cancela.'; end if;
      if coalesce(trim(new.motivo_cancelamento), '') = '' then raise exception 'Informe o motivo do cancelamento.'; end if;
      new.cancelado_por := auth.uid(); new.cancelado_em := now();
      new.respondido_em := null; new.resposta_comentario := null;
    else
      raise exception 'Situação inválida.';
    end if;
  else
    new.respondido_em := old.respondido_em; new.resposta_comentario := old.resposta_comentario;
    new.cancelado_por := old.cancelado_por; new.cancelado_em := old.cancelado_em; new.motivo_cancelamento := old.motivo_cancelamento;
  end if;
  return new;
end;
$$;
drop trigger if exists coord_checklist_carimbar on public.coord_checklists;
create trigger coord_checklist_carimbar before insert or update on public.coord_checklists
  for each row execute function private.coord_checklist_carimbar();

alter table public.coord_checklists enable row level security;
-- vê: administrador, quem fez, o gerente escolhido e o coordenador da regional da loja
create policy cck_sel on public.coord_checklists for select to authenticated
  using ((select private.sou_admin()) or coordenador_id = (select auth.uid()) or gerente_id = (select auth.uid())
         or ((select private.tem_papel('coordenador')) and private.coordena_filial(branch_id)));
create policy cck_ins on public.coord_checklists for insert to authenticated with check (private.pode_fazer_checklist(branch_id));
create policy cck_upd on public.coord_checklists for update to authenticated
  using ((select private.sou_admin()) or coordenador_id = (select auth.uid()) or gerente_id = (select auth.uid()))
  with check ((select private.sou_admin()) or coordenador_id = (select auth.uid()) or gerente_id = (select auth.uid()));

-- lojas que a pessoa pode avaliar
create or replace function public.coord_lojas()
returns table (id uuid, codigo text, nome text)
language sql
stable
security definer
set search_path = public, private
as $$
  select b.id, b.codigo, b.nome
    from public.branches b
   where b.ativo and private.pode_fazer_checklist(b.id)
   order by b.codigo;
$$;
revoke all on function public.coord_lojas() from public, anon;
grant execute on function public.coord_lojas() to authenticated;

-- gerentes com usuário ativo e as lojas de cada um (só para quem faz checklist)
create or replace function public.coord_gerentes()
returns table (id uuid, nome text, lojas uuid[])
language sql
stable
security definer
set search_path = public, private
as $$
  select p.id, coalesce(nullif(trim(p.nome), ''), p.email),
         array_remove(array_agg(distinct u.branch_id) || p.branch_id, null)
    from public.profiles p
    left join public.user_branch_access u on u.user_id = p.id
   where p.ativo and p.papel = 'gerente'
     and (private.sou_admin() or private.tem_papel('coordenador'))
   group by p.id
   order by 2;
$$;
revoke all on function public.coord_gerentes() from public, anon;
grant execute on function public.coord_gerentes() to authenticated;
