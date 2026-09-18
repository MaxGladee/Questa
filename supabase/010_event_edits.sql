-- 010. Изменения ивента объявляются участникам.
--
-- Организатор мог создать встречу и отменить её, но не мог перенести:
-- заболел, закрылось заведение, договорились на час позже — приходилось
-- отменять и собирать людей заново. Теперь ивент можно править, пока он не
-- начался, и здесь — то, что должно происходить при этом само.
--
--   1. Сообщение в чат и уведомление каждому: что именно поменялось.
--      Без этого перенос времени узнавал бы только тот, кто зашёл в
--      карточку, а остальные пришли бы к старому часу.
--
--   2. Сброс отметок об отправленных напоминаниях при переносе времени.
--      Напоминания за сутки и за час считаются от начала встречи; если
--      время сдвинули, прежние отметки означали бы «уже отправлено» для
--      ступеней, которые к новому времени ещё и не наступали.
--
-- Файл можно выполнять повторно.

create or replace function announce_event_change () returns trigger
language plpgsql security definer set search_path = public as $announce_event_change$
declare
  has_quest boolean;
  changes   text[] := '{}';
  note      text;
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

  -- ─── правки в ещё не начавшейся встрече ───
  --
  -- Собираем перечень изменений одной строкой: три отдельных сообщения
  -- подряд («время», «место», «название») читаются как спам, а одно —
  -- как новость.
  if new.status = 'active' and old.status = 'active' then
    if old.starts_at is distinct from new.starts_at then
      -- Точное время база не печатает нарочно: часового пояса встречи она
      -- не знает, а «в 02:48 UTC» человеку в Екатеринбурге ничего не
      -- говорит. Время он увидит в карточке, куда ведёт уведомление.
      changes := changes || array['встречу перенесли на другое время'];

      -- Ступени напоминаний считаются от начала встречи: время сдвинули —
      -- отметки об отправленных больше не годятся.
      delete from event_reminder where event_id = new.id;
    end if;

    if old.address is distinct from new.address then
      changes := changes || ('новое место — ' || new.address);
    end if;

    if old.title is distinct from new.title then
      changes := changes || ('новое название — «' || new.title || '»');
    end if;

    if old.max_participants is distinct from new.max_participants then
      changes := changes || ('мест стало ' || new.max_participants);
    end if;

    if array_length(changes, 1) > 0 then
      note := array_to_string(changes, '; ');

      if new.chat_opened_at is not null then
        insert into chat_message (event_id, user_id, kind, body)
        values (new.id, null, 'system', 'Организатор изменил встречу: ' || note);
      end if;

      insert into notification (user_id, type, title, body, payload)
      select p.user_id, 'change', 'Встреча изменилась',
             '«' || new.title || '»: ' || note,
             jsonb_build_object('event_id', new.id)
        from event_participant p
       where p.event_id = new.id and p.user_id <> new.organizer_id;
    end if;
  end if;

  return new;
end;
$announce_event_change$;

drop trigger if exists announce_event_change_after_update on event;

create trigger announce_event_change_after_update
after update on event
for each row execute function announce_event_change();

insert into schema_note (key) values ('010_event_edits')
on conflict (key) do update set applied_at = now();
