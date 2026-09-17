-- 003. Чат открывается сам, системные сообщения пишет база.
--
-- Почему это переехало из приложения в базу. Строку ивента разрешено менять
-- только организатору (политика update_event), а сообщение в чат — только от
-- своего имени (политика send_chat: user_id = auth.uid()). Значит участник,
-- который заходит третьим и добирает группу, не может ни открыть чат, ни
-- объявить об этом: его запросы молча не меняли ничего, и чат оставался
-- закрытым, хотя мест уже хватало. У системных сообщений автора нет вовсе,
-- поэтому из приложения они не вставлялись никогда.
--
-- Триггеры выполняются от имени владельца базы, политики им не мешают.
-- Открытие чата больше не зависит от того, кто именно нажал
-- «Присоединиться», а системные сообщения появляются ровно один раз.
--
-- Файл можно выполнять повторно: он переопределяет функции и пересоздаёт
-- триггеры, а разовое исправление в конце трогает только те ивенты, у
-- которых группа уже набрана, а чат всё ещё закрыт.

-- Причина отмены раньше жила только в сообщении, которое приложение не
-- могло отправить. Теперь она хранится у ивента, и её берёт триггер.
alter table event add column if not exists cancel_reason text;

-- ───────────────── открытие чата при наборе группы ─────────────────

create or replace function open_chat_when_full () returns trigger
language plpgsql security definer set search_path = public as $open_chat_when_full$
declare
  target event%rowtype;
  taken  integer;
begin
  select * into target from event where id = new.event_id;

  if target.id is null
     or target.chat_opened_at is not null
     or target.chat_mode <> 'auto'
     or target.status <> 'active'
  then
    return new;
  end if;

  select count(*) into taken from event_participant where event_id = new.event_id;

  if taken >= target.min_participants then
    -- Сообщения и уведомления развесит триггер на самом ивенте: чат
    -- открывается и отсюда, и кнопкой организатора в ручном режиме.
    update event set chat_opened_at = now()
     where id = new.event_id and chat_opened_at is null;
  end if;

  return new;
end;
$open_chat_when_full$;

drop trigger if exists open_chat_after_join on event_participant;

create trigger open_chat_after_join
after insert on event_participant
for each row execute function open_chat_when_full();

-- ─────────────── системные сообщения о жизни ивента ────────────────

create or replace function announce_event_change () returns trigger
language plpgsql security definer set search_path = public as $announce_event_change$
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

-- ───────── разовое исправление уже набранных, но немых ивентов ─────────

update event e
   set chat_opened_at = now()
 where e.chat_opened_at is null
   and e.chat_mode = 'auto'
   and e.status = 'active'
   and (select count(*) from event_participant p where p.event_id = e.id)
       >= e.min_participants;

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

insert into schema_note (key) values ('003_chat_triggers')
on conflict (key) do update set applied_at = now();
