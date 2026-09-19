-- 015. В счётчике непрочитанного — только сообщения людей.
--
-- Функция из 014 считала все чужие строки чата, а системные сообщения
-- («Ивент начался», «Аня выполнила задание», «Группа набрана») автора не
-- имеют — и попадали в счётчик наравне с людьми. Человек видел «6 в чате»,
-- заходил, а там одни служебные объявления.
--
-- Системные сообщения и так видны: они приходят уведомлениями в
-- колокольчик и всплывающими плашками. Счётчик у чата нужен для другого —
-- чтобы знать, что кто-то написал и ждёт ответа.
--
-- Файл можно выполнять повторно.

create or replace function unread_chats () returns table (event_id uuid, unread integer)
language sql security definer stable set search_path = public as $unread_chats$
  select p.event_id,
         count(m.id)::integer as unread
    from event_participant p
    join chat_message m
      on m.event_id = p.event_id
     -- Только написанное людьми и не самим читателем.
     and m.user_id is not null
     and m.user_id <> p.user_id
     and m.kind = 'text'
     and (p.chat_read_at is null or m.created_at > p.chat_read_at)
   where p.user_id = auth.uid()
   group by p.event_id
$unread_chats$;

grant execute on function unread_chats () to authenticated;

insert into schema_note (key) values ('015_unread_people_only')
on conflict (key) do update set applied_at = now();
