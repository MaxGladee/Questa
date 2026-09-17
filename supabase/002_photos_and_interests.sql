-- ════════════════════════════════════════════════════════════════════════
--  Questa — обновление базы: фотографии и расширенный список интересов
--
--  Выполняется целиком, одним запуском, в SQL-редакторе Supabase, после
--  setup.sql. Повторный запуск безопасен: всё написано так, чтобы не падать
--  на уже существующих объектах.
-- ════════════════════════════════════════════════════════════════════════


-- ─────────────────── ЧАСТЬ 1. ХРАНИЛИЩЕ ФОТОГРАФИЙ ──────────────────────
-- Аватары и обложки ивентов. Чтение открыто всем: обложка видна и тем, кто
-- ещё не вступил в ивент. Загружать, менять и удалять может только автор
-- файла — у каждого пользователя своя папка внутри хранилища.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
   set public = true,
       file_size_limit = 5242880,            -- 5 МБ, как в ТЗ 4.1.3
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists media_read   on storage.objects;
drop policy if exists media_upload on storage.objects;
drop policy if exists media_update on storage.objects;
drop policy if exists media_delete on storage.objects;

create policy media_read on storage.objects
  for select using (bucket_id = 'media');

create policy media_upload on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy media_update on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy media_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);


-- ────────────────── ЧАСТЬ 2. РАСШИРЕННЫЕ ИНТЕРЕСЫ ───────────────────────
-- Категорий ивента по ЧТЗ ровно шесть, и этот список менять нельзя.
-- А интересов в профиле шести мало: по ним подбираются рекомендации и
-- контекст для генерации квеста, и чем их больше, тем точнее подбор.
--
-- Поэтому у справочника появляется признак: годится ли запись как категория
-- ивента. У шести исходных он остаётся истинным, у новых — ложным.

alter table interest add column if not exists is_event_category boolean not null default true;

update interest set is_event_category = true
 where code in ('party', 'chill', 'bar', 'walk', 'boardgames', 'other');

insert into interest (code, title, icon, is_event_category) values
  ('sport',      'Спорт',        '🏀', false),
  ('run',        'Бег',          '🏃', false),
  ('bike',       'Велосипед',    '🚲', false),
  ('yoga',       'Йога',         '🧘', false),
  ('music',      'Музыка',       '🎧', false),
  ('cinema',     'Кино',         '🎬', false),
  ('books',      'Книги',        '📚', false),
  ('food',       'Еда',          '🍜', false),
  ('coffee',     'Кофе',         '☕', false),
  ('travel',     'Путешествия',  '🧳', false),
  ('photo',      'Фотография',   '📷', false),
  ('art',        'Искусство',    '🎨', false),
  ('dance',      'Танцы',        '💃', false),
  ('it',         'Айти',         '💻', false),
  ('languages',  'Языки',        '🗣', false),
  ('animals',    'Животные',     '🐾', false),
  ('quiz',       'Квизы',        '🧠', false),
  ('anime',      'Аниме',        '🌸', false),
  ('volunteer',  'Волонтёрство', '🤝', false),
  ('theatre',    'Театр',        '🎭', false)
on conflict (code) do nothing;
