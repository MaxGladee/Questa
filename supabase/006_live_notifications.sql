-- 006. Уведомления приходят в приложение сразу.
--
-- Уведомление и раньше ложилось в таблицу, но узнать о нём можно было,
-- только зайдя в колокольчик. Чтобы приложение показывало его всплывающей
-- плашкой в тот же момент, таблицу нужно добавить в публикацию Realtime —
-- иначе Supabase просто не рассылает события об этих строках.
--
-- Файл можно выполнять повторно: добавление в публикацию обёрнуто в
-- проверку, а повторная отметка о выполнении просто обновляет время.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'notification'
  ) then
    alter publication supabase_realtime add table notification;
  end if;
end $$;

insert into schema_note (key) values ('006_live_notifications')
on conflict (key) do update set applied_at = now();
