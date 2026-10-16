-- 0034 — SLA dos chamados: hora da primeira resposta de quem atende.
-- Conta como resposta qualquer ação de alguém que não é o solicitante: assumir/atribuir, mudar a situação ou
-- comentar. O prazo (por prioridade) e os indicadores são calculados na aplicação.
-- ADITIVA: uma coluna nova e dois gatilhos.

alter table public.tickets add column if not exists primeira_resposta_em timestamptz;
create index if not exists tickets_sem_resposta_idx on public.tickets (prioridade, created_at) where primeira_resposta_em is null;

create or replace function private.t_ticket_primeira_resposta()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
declare v_autor uuid := coalesce(new.author_id, auth.uid());
begin
  if v_autor is null then return null; end if;
  update public.tickets
     set primeira_resposta_em = coalesce(primeira_resposta_em, now())
   where id = new.ticket_id and primeira_resposta_em is null and solicitante is distinct from v_autor;
  return null;
end;
$$;
revoke all on function private.t_ticket_primeira_resposta() from public, anon, authenticated;

drop trigger if exists t_ticket_history_resposta on public.ticket_history;
create trigger t_ticket_history_resposta after insert on public.ticket_history for each row execute function private.t_ticket_primeira_resposta();
drop trigger if exists t_ticket_comments_resposta on public.ticket_comments;
create trigger t_ticket_comments_resposta after insert on public.ticket_comments for each row execute function private.t_ticket_primeira_resposta();

-- chamados que já existem: a primeira ação de quem atende
update public.tickets t
   set primeira_resposta_em = x.primeira
  from (
    select ticket_id, min(quando) as primeira from (
      select h.ticket_id, h.created_at as quando, h.author_id from public.ticket_history h
      union all
      select c.ticket_id, c.created_at, c.author_id from public.ticket_comments c
    ) a
    join public.tickets k on k.id = a.ticket_id
   where a.author_id is distinct from k.solicitante and a.author_id is not null
   group by ticket_id
  ) x
 where t.id = x.ticket_id and t.primeira_resposta_em is null;
