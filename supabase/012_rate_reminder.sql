-- 012. Напоминание оценить встречу.
--
-- Оценки — половина смысла профиля: по среднему баллу решают, идти ли к
-- незнакомому организатору. Но ставят их плохо, и понятно почему: сразу
-- после встречи люди расходятся, приложение закрыто, а экран итогов
-- открывается только по ссылке из уведомления «ивент завершён», которое
-- приходит в ту же минуту, когда всем не до того.
--
-- Поэтому через три часа после конца встречи тем, кто ещё никого не
-- оценил, приходит второе, последнее напоминание. Ровно одно: об оценках
-- просят один раз, дальше это уже попрошайничество.
--
-- Отметка об отправке кладётся в ту же таблицу event_reminder, что и
-- напоминания до встречи, со специальным значением lead_minutes = -1:
-- «отправлено после конца». Заводить вторую таблицу ради одной строки на
-- встречу незачем, а минус ясно отделяет «после» от «до».
--
-- Файл можно выполнять повторно.

create or replace function run_event_maintenance () returns void
language plpgsql security definer set search_path = public as $run_event_maintenance$
declare
  leads  integer[] := array[30, 60, 360, 720, 1440];
  lead   integer;
  ev     record;
  note   text;
begin
  -- 1. Напоминания о скорых встречах.
  for ev in
    select e.id, e.title, e.starts_at,
           ceil(extract(epoch from (e.starts_at - now())) / 60)::integer as minutes_left
      from event e
     where e.status = 'active'
       and e.starts_at > now()
       and e.starts_at <= now() + interval '1 day'
  loop
    foreach lead in array leads loop
      continue when lead < ev.minutes_left;

      exit when exists (
        select 1 from event_reminder r
         where r.event_id = ev.id and r.lead_minutes = lead
      );

      note := case lead
        when 1440 then 'завтра'
        when 720  then 'через 12 часов'
        when 360  then 'через 6 часов'
        when 60   then 'через час'
        else           'через полчаса'
      end;

      insert into notification (user_id, type, title, body, payload)
      select p.user_id, 'reminder', 'Скоро встреча',
             '«' || ev.title || '» начнётся ' || note,
             jsonb_build_object('event_id', ev.id)
        from event_participant p
       where p.event_id = ev.id;

      insert into event_reminder (event_id, lead_minutes)
      select ev.id, step from unnest(leads) as step
       where step >= lead
      on conflict do nothing;

      exit;
    end loop;
  end loop;

  -- 2. Просроченные встречи закрываются сами.
  update event
     set status = 'finished', finished_by = 'auto'
   where status in ('active', 'in_progress')
     and coalesce(started_at, starts_at) < now() - make_interval(hours => event_max_hours());

  -- 3. Просьба оценить — тем, кто был на встрече и никого не оценил.
  --    Отметившимся: кто не пришёл, тому и оценивать некого.
  for ev in
    select e.id, e.title
      from event e
     where e.status = 'finished'
       and e.finished_at is not null
       and e.finished_at < now() - interval '3 hours'
       and e.finished_at > now() - interval '3 days'
       and not exists (
         select 1 from event_reminder r
          where r.event_id = e.id and r.lead_minutes = -1
       )
  loop
    insert into notification (user_id, type, title, body, payload)
    select p.user_id, 'rate', 'Как прошло?',
           'Оцените участников «' || ev.title || '» — это занимает полминуты',
           jsonb_build_object('event_id', ev.id)
      from event_participant p
     where p.event_id = ev.id
       and p.checked_in_at is not null
       and not exists (
         select 1 from rating r
          where r.event_id = ev.id and r.author_id = p.user_id
       );

    insert into event_reminder (event_id, lead_minutes) values (ev.id, -1)
    on conflict do nothing;
  end loop;
end;
$run_event_maintenance$;

grant execute on function run_event_maintenance () to authenticated;

insert into schema_note (key) values ('012_rate_reminder')
on conflict (key) do update set applied_at = now();
