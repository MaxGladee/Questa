-- 014. Непрочитанные сообщения видно снаружи чата.
--
-- Чат открывается из карточки встречи, и до сих пор понять, есть ли там
-- что-то новое, можно было единственным способом — зайти и посмотреть.
-- Всплывающая плашка показывает сообщение один раз, в момент прихода; кто
-- в этот момент не держал приложение открытым, тот про сообщение и не
-- узнает.
--
-- Отметка о прочтении — это время последнего открытия чата, по одной
-- строке на участника. Хранится там же, где отметка о присутствии: это
-- свойство участия, а не сообщения.
--
-- Считает непрочитанное функция: списку встреч нужны сразу все числа, а
-- запрашивать их по одному на встречу — это десяток запросов там, где
-- хватает одного. Свои сообщения не считаются: человек знает, что написал.
--
-- Файл можно выполнять повторно.

alter table event_participant add column if not exists chat_read_at timestamptz;

create or replace function unread_chats () returns table (event_id uuid, unread integer)
language sql security definer stable set search_path = public as $unread_chats$
  select p.event_id,
         count(m.id)::integer as unread
    from event_participant p
    join chat_message m
      on m.event_id = p.event_id
     and m.user_id is distinct from p.user_id
     and (p.chat_read_at is null or m.created_at > p.chat_read_at)
   where p.user_id = auth.uid()
   group by p.event_id
$unread_chats$;

grant execute on function unread_chats () to authenticated;

/*
 * Отметка «прочитано» ставится по часам базы, а не браузера.
 *
 * Часы телефона врут в обе стороны. Отставшие оставили бы сообщения
 * непрочитанными навсегда, спешащие — пометили бы прочитанными те, что
 * ещё не пришли. База — единственные часы, общие для всех.
 */
create or replace function mark_chat_read (event_id uuid) returns void
language sql security definer set search_path = public as $mark_chat_read$
  update event_participant
     set chat_read_at = now()
   where event_participant.event_id = mark_chat_read.event_id
     and user_id = auth.uid()
$mark_chat_read$;

grant execute on function mark_chat_read (uuid) to authenticated;

insert into schema_note (key) values ('014_chat_unread')
on conflict (key) do update set applied_at = now();
