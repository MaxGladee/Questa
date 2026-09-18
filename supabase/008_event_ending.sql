-- 008. Завершение ивента: напоминания, авто-финиш, защита от накрутки.
--
-- До сих пор ивент заканчивался единственным способом — организатор
-- нажимал «Завершить». Не нажал (забыл, ушёл, разрядился телефон) — и
-- встреча навсегда оставалась «идёт»: она висела в списке активных, чат
-- принимал сообщения, задания оставались открытыми, а в архив она не
-- попадала никогда.
--
-- Здесь три части.
--
--   1. Напоминания за сутки, 12, 6 часов, час и полчаса до начала.
--      Каждое отправляется один раз: отметка о нём лежит в event_reminder,
--      и повторный прогон её видит. Когда до встречи уже меньше суток,
--      пропущенные ступени не сыплются все разом — они помечаются
--      отправленными, а приходит только ближайшая.
--
--   2. Авто-завершение через 6 часов после начала. Шесть — потому что
--      столько длится долгая встреча: посиделки, прогулка с кафе,
--      настольный вечер. Всё, что дольше, — уже не один ивент, а вечер,
--      перетёкший в другой. Ивент, который так и не начали, закрывается
--      по тому же сроку от назначенного времени.
--
--   3. Ивент засчитывается в статистику, только если он состоялся:
--      его начали, он шёл не меньше получаса и на нём отметились хотя бы
--      двое. Иначе «провёл встречу» и «посетил» набивались бы за минуту:
--      создал, начал, завершил, повторил. Очки за выполненные задания
--      при этом остаются — их всё равно нужно было заработать.
--
-- Файл можно выполнять повторно.

-- ─────────────────────── новые поля ивента ───────────────────────

alter table event add column if not exists started_at  timestamptz;
alter table event add column if not exists finished_at timestamptz;
alter table event add column if not exists counted     boolean not null default false;
-- Кто закрыл встречу: 'organizer' или 'auto'. Нужно в итогах и в чате.
alter table event add column if not exists finished_by text;

-- Сколько минимум должна идти встреча, чтобы попасть в статистику.
create or replace function event_min_minutes () returns integer
language sql immutable as $event_min_minutes$ select 30 $event_min_minutes$;

-- Через сколько часов после начала встреча закрывается сама.
create or replace function event_max_hours () returns integer
language sql immutable as $event_max_hours$ select 6 $event_max_hours$;

-- ─────────────── отметки времени и признак «состоялся» ───────────────
--
-- Время старта и финиша проставляет база, а не приложение: авто-завершение
-- идёт мимо клиента, и иначе у закрытых по таймеру встреч этих отметок бы
-- не было. Здесь же считается counted — по фактической длительности и
-- числу отметившихся, то есть по тому, что подделать нельзя, не приведя
-- людей на место.

create or replace function stamp_event_times () returns trigger
language plpgsql security definer set search_path = public as $stamp_event_times$
declare
  present integer;
  began   timestamptz;
begin
  if new.status = 'in_progress' and old.status is distinct from 'in_progress' then
    new.started_at := coalesce(new.started_at, now());
  end if;

  if new.status = 'finished' and old.status is distinct from 'finished' then
    new.finished_at := coalesce(new.finished_at, now());
    new.finished_by := coalesce(new.finished_by, 'organizer');

    select count(*) into present
      from event_participant
     where event_id = new.id and checked_in_at is not null;

    -- Началом считается фактический старт, а если его не было — назначенное
    -- время: встречу, которую не начали, засчитывать не за что.
    began := new.started_at;

    new.counted := began is not null
      and new.finished_at - began >= make_interval(mins => event_min_minutes())
      and present >= 2;
  end if;

  return new;
end;
$stamp_event_times$;

drop trigger if exists stamp_event_times_before_update on event;

create trigger stamp_event_times_before_update
before update on event
for each row execute function stamp_event_times();

-- ─────────────── отметка присутствия только вовремя ───────────────
--
-- Чек-ин — это «я пришёл к началу», и смысл он имеет только рядом с
-- назначенным временем. Отметка за сутки вперёд не говорит ни о чём, а
-- очки за неё даются те же, поэтому окно ограничено: не раньше чем за час
-- до начала и не позже конца встречи.

create or replace function guard_check_in () returns trigger
language plpgsql security definer set search_path = public as $guard_check_in$
declare
  ev record;
begin
  if new.checked_in_at is null or old.checked_in_at is not null then
    return new;
  end if;

  select status, starts_at into ev from event where id = new.event_id;

  if ev.status = 'finished' or ev.status = 'cancelled' then
    raise exception 'Встреча уже закончилась — отметиться нельзя';
  end if;

  if ev.status = 'active' and now() < ev.starts_at - interval '1 hour' then
    raise exception 'Отметиться можно не раньше чем за час до начала';
  end if;

  return new;
end;
$guard_check_in$;

drop trigger if exists guard_check_in_before_update on event_participant;

create trigger guard_check_in_before_update
before update on event_participant
for each row execute function guard_check_in();

-- ──────────────────── отметки об отправленных напоминаниях ────────────────

create table if not exists event_reminder (
  event_id     uuid not null references event (id) on delete cascade,
  lead_minutes integer not null,
  sent_at      timestamptz not null default now(),
  primary key (event_id, lead_minutes)
);

alter table event_reminder enable row level security;

-- Писать сюда может только сама база (функция ниже идёт от её имени);
-- читать — участникам, чтобы экран мог показать, что напоминание ушло.
drop policy if exists read_reminders on event_reminder;
create policy read_reminders on event_reminder
  for select to authenticated using (is_participant(event_id));

-- ───────────────────────── обслуживание встреч ─────────────────────────
--
-- Одна функция на всё, что должно происходить по часам: разослать
-- напоминания и закрыть просроченные встречи. Вызывает её приложение при
-- запуске — планировщика в Supabase по умолчанию нет, а держать ради двух
-- запросов отдельный сервер незачем. Работа идемпотентна: два вызова
-- подряд не пришлют двух одинаковых напоминаний.
--
-- Если проект перейдёт на pg_cron, останется добавить расписание:
--   select cron.schedule('questa-maintenance', '*/5 * * * *',
--                        $cron$select run_event_maintenance()$cron$);

create or replace function run_event_maintenance () returns void
language plpgsql security definer set search_path = public as $run_event_maintenance$
declare
  leads  integer[] := array[30, 60, 360, 720, 1440];
  lead   integer;
  ev     record;
  note   text;
begin
  -- 1. Напоминания. Для каждой встречи берётся ближайшая неотправленная
  --    ступень, а все более дальние помечаются отправленными: человеку,
  --    который записался за час до начала, не нужны «завтра» и «через
  --    6 часов» одной пачкой.
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

      -- Эта ступень отправлена, все дальние — больше не нужны.
      insert into event_reminder (event_id, lead_minutes)
      select ev.id, step from unnest(leads) as step
       where step >= lead
      on conflict do nothing;

      exit;
    end loop;
  end loop;

  -- 2. Просроченные встречи закрываются сами. Отметки времени и признак
  --    «состоялась» проставит триггер stamp_event_times.
  update event
     set status = 'finished', finished_by = 'auto'
   where status in ('active', 'in_progress')
     and coalesce(started_at, starts_at) < now() - make_interval(hours => event_max_hours());
end;
$run_event_maintenance$;

grant execute on function run_event_maintenance () to authenticated;

-- ───────────── объявление о завершении: кто закрыл и засчиталось ли ─────────

create or replace function announce_event_change () returns trigger
language plpgsql security definer set search_path = public as $announce_event_change$
declare
  has_quest boolean;
begin
  if old.chat_opened_at is null and new.chat_opened_at is not null then
    insert into chat_message (event_id, user_id, kind, body)
    values (new.id, null, 'system', 'Группа набрана, чат создан');

    select exists (select 1 from quest where event_id = new.id) into has_quest;

    if has_quest then
      insert into chat_message (event_id, user_id, kind, body)
      values (new.id, null, 'system', 'Квесты доступны! Проверьте задания ↓');
    end if;

    insert into notification (user_id, type, title, body, payload)
    select p.user_id, 'group', 'Группа набрана!',
           'Чат ивента «' || new.title || '» открыт',
           jsonb_build_object('event_id', new.id)
      from event_participant p
     where p.event_id = new.id;
  end if;

  if old.status <> 'in_progress' and new.status = 'in_progress' then
    insert into chat_message (event_id, user_id, kind, body)
    values (new.id, null, 'system', 'Ивент начался! Задания квеста доступны ↓');

    insert into notification (user_id, type, title, body, payload)
    select p.user_id, 'start', 'Ивент начался',
           'Задания квеста уже доступны',
           jsonb_build_object('event_id', new.id)
      from event_participant p
     where p.event_id = new.id and p.user_id <> new.organizer_id;
  end if;

  if old.status <> 'finished' and new.status = 'finished' then
    if new.chat_opened_at is not null then
      insert into chat_message (event_id, user_id, kind, body)
      values (new.id, null, 'system',
              case
                when new.finished_by = 'auto'
                  then 'Ивент закрыт автоматически: прошло '
                       || event_max_hours() || ' часов с начала. Чат закрыт для записи.'
                else 'Ивент завершён. Чат закрыт для записи.'
              end);

      if not new.counted then
        insert into chat_message (event_id, user_id, kind, body)
        values (new.id, null, 'system',
                'Встреча не попала в статистику: в зачёт идут ивенты длиннее '
                || event_min_minutes() || ' минут, на которых отметились хотя бы двое. '
                || 'Очки за выполненные задания остаются при вас.');
      end if;
    end if;

    insert into notification (user_id, type, title, body, payload)
    select p.user_id, 'finish', 'Ивент завершён',
           'Посмотрите итоги «' || new.title || '» и оцените участников',
           jsonb_build_object('event_id', new.id)
      from event_participant p
     where p.event_id = new.id;
  end if;

  if old.status <> 'cancelled' and new.status = 'cancelled' then
    if new.chat_opened_at is not null then
      insert into chat_message (event_id, user_id, kind, body)
      values (new.id, null, 'system',
              'Ивент отменён организатором'
              || coalesce('. Причина: ' || new.cancel_reason, ''));
    end if;

    insert into notification (user_id, type, title, body, payload)
    select p.user_id, 'cancel', 'Ивент отменён',
           '«' || new.title || '» не состоится'
           || coalesce('. Причина: ' || new.cancel_reason, ''),
           jsonb_build_object('event_id', new.id)
      from event_participant p
     where p.event_id = new.id and p.user_id <> new.organizer_id;
  end if;

  return new;
end;
$announce_event_change$;

drop trigger if exists announce_event_change_after_update on event;

create trigger announce_event_change_after_update
after update on event
for each row execute function announce_event_change();

insert into schema_note (key) values ('008_event_ending')
on conflict (key) do update set applied_at = now();
