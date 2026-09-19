-- 016. Выключатели уведомлений работают по-настоящему.
--
-- В настройках уже были переключатели, но они ничего не выключали: выбор
-- лежал в памяти браузера, а рассылку ведёт база и про него не знала.
-- Человек снимал галочку «напоминания», а они продолжали приходить — это
-- хуже, чем не иметь настройки вовсе.
--
-- Теперь выбор хранится у профиля, и решения принимаются там же, где
-- рассылка. Умолчание — «включено»: пустой объект означает согласие на
-- всё, и старые профили ничего не теряют.
--
-- Выключить можно не всё. Уведомления о том, что встреча началась,
-- отменена или завершена, приходят всегда: без них человек придёт к
-- закрытой двери. Отключаются только те, которыми можно надоесть, —
-- напоминания перед встречей, чужие выполненные задания и просьба
-- оценить.
--
-- Файл можно выполнять повторно.

alter table app_user add column if not exists notify jsonb not null default '{}'::jsonb;

/* Согласен ли человек получать уведомления этого вида. */
create or replace function wants_notice (person uuid, kind text) returns boolean
language sql stable set search_path = public as $wants_notice$
  select coalesce((select (u.notify ->> kind)::boolean from app_user u where u.id = person), true)
$wants_notice$;

-- ─────────── сообщение о выполненном задании: только желающим ───────────

create or replace function announce_task_completion () returns trigger
language plpgsql security definer set search_path = public as $announce_task_completion$
declare
  event_id_ uuid;
  who       text;
  what      text;
begin
  select q.event_id, t.title into event_id_, what
    from task t join quest q on q.id = t.quest_id
   where t.id = new.task_id;

  if event_id_ is null then return new; end if;

  select nickname into who from app_user where id = new.user_id;

  -- Сообщение в чат остаётся всегда: это общая лента встречи, а не
  -- персональное уведомление, и выключателю там не место.
  insert into chat_message (event_id, user_id, kind, body)
  values (event_id_, null, 'system',
          coalesce(who, 'Участник') || ' выполнил задание «' || what
          || '» · +' || new.qp_awarded || ' QP');

  insert into notification (user_id, type, title, body, payload)
  select p.user_id, 'task', 'Задание выполнено',
         coalesce(who, 'Участник') || ' справился с заданием «' || what || '»',
         jsonb_build_object('event_id', event_id_)
    from event_participant p
   where p.event_id = event_id_
     and p.user_id <> new.user_id
     and wants_notice(p.user_id, 'task');

  return new;
end;
$announce_task_completion$;

drop trigger if exists announce_task_completion_after_insert on task_completion;

create trigger announce_task_completion_after_insert
after insert on task_completion
for each row execute function announce_task_completion();

-- ───────── напоминания и просьба оценить: тоже только желающим ─────────

create or replace function run_event_maintenance () returns void
language plpgsql security definer set search_path = public as $run_event_maintenance$
declare
  leads  integer[] := array[30, 60, 360, 720, 1440];
  lead   integer;
  ev     record;
  note   text;
begin
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
       where p.event_id = ev.id
         and wants_notice(p.user_id, 'reminder');

      -- Отметка ставится независимо от того, кому ушло: ступень пройдена
      -- для всей встречи, иначе выключивший напоминания заставлял бы
      -- систему возвращаться к ней снова и снова.
      insert into event_reminder (event_id, lead_minutes)
      select ev.id, step from unnest(leads) as step
       where step >= lead
      on conflict do nothing;

      exit;
    end loop;
  end loop;

  update event
     set status = 'finished', finished_by = 'auto'
   where status in ('active', 'in_progress')
     and coalesce(started_at, starts_at) < now() - make_interval(hours => event_max_hours());

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
       and wants_notice(p.user_id, 'rate')
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

insert into schema_note (key) values ('016_notification_settings')
on conflict (key) do update set applied_at = now();
