-- 005. Квест появляется вместе с началом встречи.
--
-- Раньше задания придумывались при создании ивента, и объявление о них
-- уходило в чат сразу, как только набиралась группа, — большая фиолетовая
-- карточка «Ваши задания готовы» висела в переписке за дни до встречи.
-- Открыть задания при этом всё равно было нельзя.
--
-- Теперь квест придумывается в момент, когда организатор нажимает «Начать
-- ивент»: только тогда известно, кто собрался, и задания можно подобрать
-- под эту компанию. Значит и объявление в чате должно появляться там же.
--
-- Файл можно выполнять повторно.

-- Приложение заменяет квест на новый, когда встреча начинается: старый
-- нужно удалить, а разрешения на это у него не было — политика на quest
-- описывала только чтение и вставку.
drop policy if exists drop_quest on quest;
create policy drop_quest on quest for delete to authenticated
  using (exists (select 1 from event where id = event_id and organizer_id = auth.uid()));

create or replace function announce_event_change () returns trigger
language plpgsql security definer set search_path = public as $announce_event_change$
declare
  has_quest boolean;
begin
  -- Чат только что открылся.
  if old.chat_opened_at is null and new.chat_opened_at is not null then
    insert into chat_message (event_id, user_id, kind, body)
    values (new.id, null, 'system', 'Группа набрана, чат создан');

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

    -- Объявление о квесте — тем же моментом, а не при наборе группы.
    select exists (select 1 from quest where event_id = new.id) into has_quest;

    if has_quest then
      insert into chat_message (event_id, user_id, kind, body)
      values (new.id, null, 'system', 'Квесты доступны! Проверьте задания ↓');
    end if;

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
$announce_event_change$;

drop trigger if exists announce_event_change_after_update on event;

create trigger announce_event_change_after_update
after update on event
for each row execute function announce_event_change();

insert into schema_note (key) values ('005_quest_at_start')
on conflict (key) do update set applied_at = now();
