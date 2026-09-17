-- 004. Итоги ивента и взаимные оценки (ЧТЗ 5.13, 5.14).
--
-- Продолжение той же истории, что в 003: то, что должно происходить «само»
-- и касается чужих строк, приложение сделать не может — политики доступа
-- разрешают каждому писать только за себя. Такие вещи делает база.
--
-- Здесь три правки:
--   1. Сообщение о выполненном задании пишет триггер, а не приложение:
--      у системных сообщений нет автора, и вставка из браузера отклонялась,
--      поэтому прогресс группы в чате не появлялся.
--   2. Пересчёт среднего рейтинга выполняется от имени владельца базы —
--      иначе оценка меняет чужую строку, и политика её не пропускает, а
--      средний балл остаётся нулевым у всех.
--   3. Завершение ивента объявляется в чате и зовёт участников оценить
--      друг друга.
--
-- Файл можно выполнять повторно.

-- ─────────────── сообщение о выполненном задании ───────────────

create or replace function announce_task_completion () returns trigger
language plpgsql security definer set search_path = public as $$
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

  insert into chat_message (event_id, user_id, kind, body)
  values (event_id_, null, 'system',
          coalesce(who, 'Участник') || ' выполнил задание «' || what
          || '» · +' || new.qp_awarded || ' QP');

  insert into notification (user_id, type, title, body, payload)
  select p.user_id, 'task', 'Задание выполнено',
         coalesce(who, 'Участник') || ' справился с заданием «' || what || '»',
         jsonb_build_object('event_id', event_id_)
    from event_participant p
   where p.event_id = event_id_ and p.user_id <> new.user_id;

  return new;
end;
$$;

drop trigger if exists announce_task_completion_after_insert on task_completion;

create trigger announce_task_completion_after_insert
after insert on task_completion
for each row execute function announce_task_completion();

-- ─────────────────── пересчёт среднего рейтинга ────────────────────

create or replace function recalc_average_rating () returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.target_user_id is not null then
    update app_user
       set average_rating = coalesce(
             (select round(avg(score)::numeric, 1) from rating
               where target_user_id = new.target_user_id), 0.0)
     where id = new.target_user_id;
  end if;
  return new;
end;
$$;

-- ──────────────── объявление о завершении ивента ────────────────
--
-- Функция переписывается целиком: к открытию чата, старту и отмене из 003
-- добавляется завершение. Колонку с причиной отмены создаём и здесь, чтобы
-- файл работал и сам по себе, если 003 почему-то не выполнялся.

alter table event add column if not exists cancel_reason text;

create or replace function announce_event_change () returns trigger
language plpgsql security definer set search_path = public as $$
declare
  has_quest boolean;
begin
  -- Чат только что открылся.
  if old.chat_opened_at is null and new.chat_opened_at is not null then
    insert into chat_message (event_id, user_id, kind, body)
    values (new.id, null, 'system', 'Группа набрана, чат создан');

    -- Квест подобран ещё при создании ивента, но объявить о нём можно
    -- только теперь: до открытия чата сообщению было некуда прийти.
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

  -- Организатор начал встречу: с этого момента открыты задания квеста.
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

  -- Ивент завершён: чат остаётся только для чтения, а участников зовём
  -- подвести итоги и оценить друг друга (ЧТЗ 5.14).
  if old.status <> 'finished' and new.status = 'finished' then
    if new.chat_opened_at is not null then
      insert into chat_message (event_id, user_id, kind, body)
      values (new.id, null, 'system', 'Ивент завершён. Чат закрыт для записи.');
    end if;

    insert into notification (user_id, type, title, body, payload)
    select p.user_id, 'finish', 'Ивент завершён',
           'Посмотрите итоги «' || new.title || '» и оцените участников',
           jsonb_build_object('event_id', new.id)
      from event_participant p
     where p.event_id = new.id;
  end if;

  -- Ивент отменён: участники должны узнать об этом там же, где общались.
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
$$;

drop trigger if exists announce_event_change_after_update on event;

create trigger announce_event_change_after_update
after update on event
for each row execute function announce_event_change();

-- ───────────────── отметка о присутствии в чате ─────────────────
--
-- Чек-ин виден только на экране ивента, а группе он важнее в чате: по нему
-- видно, кто уже на месте. Сообщение системное, автора у него нет, поэтому
-- пишет его тоже база.

create or replace function announce_check_in () returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text;
begin
  if old.checked_in_at is not null or new.checked_in_at is null then
    return new;
  end if;

  select nickname into who from app_user where id = new.user_id;

  insert into chat_message (event_id, user_id, kind, body)
  values (new.event_id, null, 'system',
          '📍 ' || coalesce(who, 'Участник') || ' отметил присутствие · +50 XP');

  return new;
end;
$$;

drop trigger if exists announce_check_in_after_update on event_participant;

create trigger announce_check_in_after_update
after update on event_participant
for each row execute function announce_check_in();


-- ─────────────── уборка в центре уведомлений ───────────────
--
-- Читать и помечать прочитанными свои уведомления приложение умело, а
-- удалять — нет: политики на удаление не было, и кнопка «удалить все»
-- молча ничего бы не делала.

drop policy if exists delete_own_notifications on notification;
create policy delete_own_notifications on notification for delete to authenticated
  using (user_id = auth.uid());


-- ─────────────── отметка о выполнении для самопроверки ───────────────
--
-- Страница #/health не может заглянуть в список функций базы, поэтому
-- каждый файл оставляет здесь строку о себе. По ней видно, что именно
-- уже применено, и не приходится гадать, почему чат молчит.

create table if not exists schema_note (
  key        text primary key,
  applied_at timestamptz not null default now()
);

alter table schema_note enable row level security;

drop policy if exists read_schema_notes on schema_note;
create policy read_schema_notes on schema_note for select to authenticated using (true);

insert into schema_note (key) values ('004_results_and_ratings')
on conflict (key) do update set applied_at = now();
