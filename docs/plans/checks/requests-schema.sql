-- Feature requests (plan check): the shared place where all apps store the requests.
-- Used by docs/plans/checks/requests-check.js against a local Supabase (same software as the hosted one).
create extension if not exists pg_cron;

create table public.admins (user_id uuid primary key references auth.users on delete cascade);

create table public.requests (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (length(title) between 3 and 120),
  description text not null default '' check (length(description) <= 4000),
  status text not null default 'waiting' check (status in ('waiting', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table public.requests enable row level security;

create function public.is_admin() returns boolean language sql stable security definer set search_path = public
  as $$ select exists (select 1 from admins where user_id = auth.uid()) $$;

-- who sees what: approved = everyone signed in; waiting = only the sender; the admin sees everything; rejected = only the admin
create policy see on public.requests for select to authenticated
  using (status = 'approved' or (status = 'waiting' and user_id = auth.uid()) or public.is_admin());
-- only signed-in users send; it always starts as "waiting" and as their own
create policy send on public.requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'waiting');
-- only the admin approves or rejects
create policy decide on public.requests for update to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.requests from anon, authenticated;
grant select on public.requests to authenticated;
grant insert (title, description) on public.requests to authenticated;
grant update (status, decided_at) on public.requests to authenticated;
revoke all on public.admins from anon, authenticated;

-- limit: at most 3 requests per person in 7 days
create function public.limit_requests() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (select count(*) from requests where user_id = auth.uid() and created_at > now() - interval '7 days') >= 3 then
    raise exception 'limit: at most 3 requests in 7 days';
  end if;
  return new;
end $$;
create trigger limit_requests before insert on public.requests for each row execute function public.limit_requests();

-- timer: not approved within 15 days → rejected
create function public.reject_old() returns integer language sql security definer set search_path = public as $$
  with r as (update requests set status = 'rejected', decided_at = now()
             where status = 'waiting' and created_at < now() - interval '15 days' returning 1)
  select count(*)::int from r $$;
revoke execute on function public.reject_old() from public, anon, authenticated;
select cron.schedule('reject-old-requests', '17 3 * * *', $$select public.reject_old()$$);
