-- ════════════════════════════════════════════════════════════════════════
--  Questa — настройка базы данных
--
--  Выполняется целиком, одним запуском, в SQL-редакторе Supabase.
--  Повторный запуск на уже настроенной базе выдаст ошибку «уже существует» —
--  это нормально, значит настройка была выполнена раньше.
--
--  Три части:
--    1. Таблицы и связи         — раздел 9 ЧТЗ
--    2. Правила доступа к данным — кто что может читать и писать
--    3. Шаблоны квестов          — запасной вариант, если ИИ недоступен
-- ════════════════════════════════════════════════════════════════════════


-- ─────────────────────── ЧАСТЬ 1. ТАБЛИЦЫ И СВЯЗИ ───────────────────────


create extension if not exists "pgcrypto";

-- ───────────────────────────── справочники ─────────────────────────────

create table interest (
  id    smallserial primary key,
  code  text not null unique,          -- party | chill | bar | walk | boardgames | other
  title text not null,                 -- Тусовка | Чилл | Бар | Прогулка | Настолки | Другое
  icon  text
);

insert into interest (code, title, icon) values
  ('party',      'Тусовка',  '🎉'),
  ('chill',      'Чилл',     '🌿'),
  ('bar',        'Бар',      '🍸'),
  ('walk',       'Прогулка', '🚶'),
  ('boardgames', 'Настолки', '🎲'),
  ('other',      'Другое',   '✨');

-- ───────────────────────────── пользователи ────────────────────────────

create table app_user (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null,
  nickname       text not null unique check (char_length(nickname) between 3 and 20),
  avatar_url     text,
  city           text,
  qp_balance     integer  not null default 0 check (qp_balance >= 0),
  exp_total      integer  not null default 0 check (exp_total >= 0),
  streak_days    smallint not null default 0 check (streak_days between 0 and 14),
  last_login_date date,
  average_rating numeric(2,1) not null default 0.0 check (average_rating between 0 and 5),
  is_banned      boolean not null default false,
  ban_reason     text,
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- Уровень не хранится, а вычисляется из exp_total (ЧТЗ 5.12.4):
-- 1→0, 2→100, 3→250, 4→500, 5→1000, 6→1750, 7→2750, 8→4000, 9→5500, 10→7500,
-- далее +2500 за уровень.
create function user_level (exp integer) returns smallint
language sql immutable as $$
  select case
    when exp <  100 then 1
    when exp <  250 then 2
    when exp <  500 then 3
    when exp < 1000 then 4
    when exp < 1750 then 5
    when exp < 2750 then 6
    when exp < 4000 then 7
    when exp < 5500 then 8
    when exp < 7500 then 9
    else least(10 + (exp - 7500) / 2500, 99)
  end::smallint;
$$;

create table user_interest (
  user_id     uuid     not null references app_user (id) on delete cascade,
  interest_id smallint not null references interest (id) on delete cascade,
  primary key (user_id, interest_id)
);

-- ───────────────────────────── ивенты ──────────────────────────────────

create type event_status    as enum ('active', 'in_progress', 'finished', 'cancelled');
create type chat_mode       as enum ('auto', 'manual');
create type participant_role as enum ('organizer', 'participant');

create table event (
  id               uuid primary key default gen_random_uuid(),
  organizer_id     uuid not null references app_user (id) on delete cascade,
  title            text not null check (char_length(title) between 3 and 50),
  description      text check (char_length(description) <= 500),
  cover_url        text,
  category_id      smallint not null references interest (id),
  address          text not null,
  lat              double precision not null,
  lng              double precision not null,
  starts_at        timestamptz not null,
  min_participants smallint not null check (min_participants between 2 and 10),
  max_participants smallint not null check (max_participants between 2 and 10),
  chat_mode        chat_mode    not null default 'auto',
  chat_opened_at   timestamptz,
  status           event_status not null default 'active',
  created_at       timestamptz  not null default now(),
  constraint max_ge_min check (max_participants >= min_participants)
);

create index event_starts_at_idx on event (starts_at);
create index event_status_idx    on event (status);

create table event_participant (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references event (id) on delete cascade,
  user_id       uuid not null references app_user (id) on delete cascade,
  role          participant_role not null default 'participant',
  joined_at     timestamptz not null default now(),
  checked_in_at timestamptz,
  unique (event_id, user_id)
);

create index event_participant_user_idx on event_participant (user_id);

-- ───────────────────────────── квесты ──────────────────────────────────

create type task_type as enum ('geolocation', 'photo', 'quiz');

create table quest_template (
  id          uuid primary key default gen_random_uuid(),
  category_id smallint not null references interest (id),
  title       text not null
);

create table task_template (
  id                uuid primary key default gen_random_uuid(),
  quest_template_id uuid not null references quest_template (id) on delete cascade,
  position          smallint  not null check (position between 1 and 3),
  type              task_type not null,
  title             text not null,
  description       text not null,
  qp_reward         integer  not null default 20,
  is_shared         boolean  not null default false, -- «общее» задание (квиз для всех)
  params            jsonb    not null default '{}'::jsonb,
  unique (quest_template_id, position)
);

-- source: 'template' — подбор из коллекции (MVP по ЧТЗ 5.10),
--         'ai'       — генерация LLM по контексту ивента (этап 2 ТЗ).
create table quest (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null unique references event (id) on delete cascade,
  template_id uuid references quest_template (id),
  source      text not null default 'template' check (source in ('template', 'ai')),
  created_at  timestamptz not null default now()
);

create table task (
  id          uuid primary key default gen_random_uuid(),
  quest_id    uuid not null references quest (id) on delete cascade,
  position    smallint  not null check (position between 1 and 3),
  type        task_type not null,
  title       text not null,
  description text not null,
  qp_reward   integer not null default 20,
  is_shared   boolean not null default false,
  params      jsonb   not null default '{}'::jsonb,
  unique (quest_id, position)
);

create table task_completion (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references task (id) on delete cascade,
  user_id      uuid not null references app_user (id) on delete cascade,
  photo_url    text,
  answer       jsonb,
  qp_awarded   integer not null default 0,
  completed_at timestamptz not null default now(),
  unique (task_id, user_id)
);

-- ───────────────────────────── чат ─────────────────────────────────────

create type message_kind as enum ('text', 'system');

create table chat_message (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references event (id) on delete cascade,
  user_id    uuid references app_user (id) on delete set null, -- null у системных
  kind       message_kind not null default 'text',
  body       text not null check (char_length(body) <= 500),
  created_at timestamptz not null default now()
);

create index chat_message_event_idx on chat_message (event_id, created_at);

-- ──────────────────── рейтинги, жалобы, уведомления ────────────────────

create table rating (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references event (id) on delete cascade,
  author_id      uuid not null references app_user (id) on delete cascade,
  target_user_id uuid references app_user (id) on delete cascade, -- null = оценка самого ивента
  score          smallint not null check (score between 1 and 5),
  comment        text check (char_length(comment) <= 200),
  created_at     timestamptz not null default now(),
  unique (event_id, author_id, target_user_id),
  constraint no_self_rating check (target_user_id is null or target_user_id <> author_id)
);

create type complaint_status as enum ('new', 'in_progress', 'closed');

create table complaint (
  id                uuid primary key default gen_random_uuid(),
  author_id         uuid not null references app_user (id) on delete cascade,
  target_user_id    uuid references app_user (id) on delete cascade,
  target_event_id   uuid references event (id) on delete cascade,
  target_message_id uuid references chat_message (id) on delete cascade,
  reason            text not null,
  comment           text,
  status            complaint_status not null default 'new',
  created_at        timestamptz not null default now(),
  constraint one_target check (
    num_nonnulls(target_user_id, target_event_id, target_message_id) = 1
  )
);

create table notification (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references app_user (id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  payload    jsonb not null default '{}'::jsonb,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

create index notification_user_idx on notification (user_id, created_at desc);

-- ──────────────────────── геймификация: QP / XP ────────────────────────
-- event_key даёт идемпотентность из ЧТЗ 5.12.5: повторная обработка
-- одного и того же события не приводит к двойному начислению.

create table qp_transaction (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references app_user (id) on delete cascade,
  amount     integer not null,
  reason     text not null,
  event_key  text not null unique,
  created_at timestamptz not null default now()
);

create table exp_transaction (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references app_user (id) on delete cascade,
  amount     integer not null check (amount > 0),
  reason     text not null,
  event_key  text not null unique,
  created_at timestamptz not null default now()
);

create table streak_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references app_user (id) on delete cascade,
  login_date date not null,
  unique (user_id, login_date)
);

-- Балансы в app_user — денормализованная сумма транзакций, поддерживается тут.
create function apply_qp () returns trigger language plpgsql as $$
begin
  update app_user set qp_balance = qp_balance + new.amount where id = new.user_id;
  return new;
end;
$$;

create function apply_exp () returns trigger language plpgsql as $$
begin
  update app_user set exp_total = exp_total + new.amount where id = new.user_id;
  return new;
end;
$$;

create trigger qp_transaction_applied  after insert on qp_transaction
  for each row execute function apply_qp ();

create trigger exp_transaction_applied after insert on exp_transaction
  for each row execute function apply_exp ();

-- Средний рейтинг пересчитывается при каждой новой оценке (ЧТЗ 5.14).
create function recalc_average_rating () returns trigger language plpgsql as $$
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

create trigger rating_recalc after insert on rating
  for each row execute function recalc_average_rating ();

-- Чат работает в реальном времени через Supabase Realtime.
alter publication supabase_realtime add table chat_message;
alter publication supabase_realtime add table event_participant;
alter publication supabase_realtime add table task_completion;


-- ────────────────────── ЧАСТЬ 2. ПРАВИЛА ДОСТУПА ────────────────────────

create function is_participant (target_event uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from event_participant
     where event_id = target_event and user_id = auth.uid()
  );
$$;

alter table app_user          enable row level security;
alter table interest          enable row level security;
alter table user_interest     enable row level security;
alter table event             enable row level security;
alter table event_participant enable row level security;
alter table quest_template    enable row level security;
alter table task_template     enable row level security;
alter table quest             enable row level security;
alter table task              enable row level security;
alter table task_completion   enable row level security;
alter table chat_message      enable row level security;
alter table rating            enable row level security;
alter table complaint         enable row level security;
alter table notification      enable row level security;
alter table qp_transaction    enable row level security;
alter table exp_transaction   enable row level security;
alter table streak_log        enable row level security;

-- Справочники читают все авторизованные.
create policy read_interest       on interest       for select to authenticated using (true);
create policy read_quest_template on quest_template for select to authenticated using (true);
create policy read_task_template  on task_template  for select to authenticated using (true);

-- Профиль: публичный на чтение, правит только владелец.
create policy read_users   on app_user for select to authenticated using (true);
create policy insert_self  on app_user for insert to authenticated with check (id = auth.uid());
create policy update_self  on app_user for update to authenticated using (id = auth.uid());

create policy read_interests_of_users on user_interest for select to authenticated using (true);
create policy manage_own_interests    on user_interest for all    to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Ивенты видны всем (поиск на карте и в рекомендациях); правит организатор.
create policy read_events   on event for select to authenticated using (true);
create policy create_event  on event for insert to authenticated with check (organizer_id = auth.uid());
create policy update_event  on event for update to authenticated using (organizer_id = auth.uid());

-- Слоты: состав участников виден всем, занять/освободить можно только свой.
create policy read_participants  on event_participant for select to authenticated using (true);
create policy join_event         on event_participant for insert to authenticated with check (user_id = auth.uid());
create policy leave_event        on event_participant for delete to authenticated using (user_id = auth.uid());
create policy checkin_self       on event_participant for update to authenticated using (user_id = auth.uid());

-- Квест и задания — только участникам ивента.
create policy read_quest  on quest for select to authenticated using (is_participant(event_id));
create policy write_quest on quest for insert to authenticated
  with check (exists (select 1 from event where id = event_id and organizer_id = auth.uid()));

create policy read_task  on task for select to authenticated
  using (exists (select 1 from quest q where q.id = quest_id and is_participant(q.event_id)));
create policy write_task on task for insert to authenticated
  with check (exists (
    select 1 from quest q join event e on e.id = q.event_id
     where q.id = quest_id and e.organizer_id = auth.uid()));

-- Выполнение заданий: прогресс группы виден всем участникам, пишет каждый за себя.
create policy read_completions on task_completion for select to authenticated
  using (exists (select 1 from task t join quest q on q.id = t.quest_id
                  where t.id = task_id and is_participant(q.event_id)));
create policy complete_task    on task_completion for insert to authenticated
  with check (user_id = auth.uid());

-- Чат — закрытый контур ивента.
create policy read_chat on chat_message for select to authenticated using (is_participant(event_id));
create policy send_chat on chat_message for insert to authenticated
  with check (is_participant(event_id) and user_id = auth.uid());

-- Оценки анонимны: автор оценки не раскрывается, поэтому читать их построчно
-- нельзя — в приложении показывается только агрегат average_rating.
create policy rate_others on rating for insert to authenticated with check (author_id = auth.uid());
create policy read_own_ratings on rating for select to authenticated using (author_id = auth.uid());

create policy file_complaint     on complaint for insert to authenticated with check (author_id = auth.uid());
create policy read_own_complaints on complaint for select to authenticated using (author_id = auth.uid());

create policy read_own_notifications   on notification for select to authenticated using (user_id = auth.uid());
create policy update_own_notifications on notification for update to authenticated using (user_id = auth.uid());
create policy create_notifications     on notification for insert to authenticated with check (true);

-- Баланс и история начислений — только свои.
create policy read_own_qp  on qp_transaction  for select to authenticated using (user_id = auth.uid());
create policy earn_qp      on qp_transaction  for insert to authenticated with check (user_id = auth.uid());
create policy read_own_exp on exp_transaction for select to authenticated using (user_id = auth.uid());
create policy earn_exp     on exp_transaction for insert to authenticated with check (user_id = auth.uid());
create policy own_streak   on streak_log      for all    to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ────────────────────── ЧАСТЬ 3. ШАБЛОНЫ КВЕСТОВ ────────────────────────

--
-- Основной способ получить квест — генерация по контексту ивента (ТЗ 4.2.6).
-- Эти шаблоны нужны как страховка: если модель недоступна или её ответ не
-- прошёл валидацию, ивент всё равно получает квест из трёх заданий.
-- По одному шаблону на каждую из шести категорий; коллекция расширяется.
--
-- Структура квеста одинакова везде (ЧТЗ 4.2.5): два индивидуальных задания
-- (геолокация + фото) и одно общее — квиз из шести вопросов, по 5 QP за
-- верный ответ.

with template as (
  insert into quest_template (category_id, title)
  select i.id, t.title
    from (values
      ('party',      'Разогрев компании'),
      ('chill',      'Тихий маршрут'),
      ('bar',        'Барная разминка'),
      ('walk',       'Городская петля'),
      ('boardgames', 'Перед первой партией'),
      ('other',      'Знакомство с местом')
    ) as t (code, title)
    join interest i on i.code = t.code
  returning id, category_id
)
insert into task_template (quest_template_id, position, type, title, description, qp_reward, is_shared, params)
select t.id, d.position, d.type::task_type, d.title, d.description, d.qp_reward, d.is_shared, d.params::jsonb
  from template t
  join interest i on i.id = t.category_id
  join (values

  -- ─────────────────────────────── Тусовка ───────────────────────────────
  ('party', 1, 'geolocation', 'Собраться вместе',
   'Дойдите до точки встречи и дождитесь, пока рядом окажется вся компания.',
   20, false, '{"radius_meters": 50, "duration_seconds": 120}'),
  ('party', 2, 'photo', 'Общий кадр',
   'Сделайте одну фотографию, на которой поместились все.',
   25, false, '{"prompt": "Групповое фото всей компании"}'),
  ('party', 3, 'quiz', 'Кто в компании главный знаток',
   'Шесть вопросов на общую эрудицию. За каждый верный ответ — 5 QP.',
   30, true, '{"questions": [
     {"question": "Сколько человек нужно, чтобы играть в «Мафию» по классическим правилам?", "options": ["Минимум 4", "Минимум 6", "Минимум 10", "Минимум 15"], "correct_index": 1},
     {"question": "Какой танец традиционно открывает бал?", "options": ["Вальс", "Танго", "Полька", "Фокстрот"], "correct_index": 0},
     {"question": "Что означает слово «вечеринка» по происхождению?", "options": ["От «вечер»", "От «венец»", "От «веха»", "От «ветер»"], "correct_index": 0},
     {"question": "В какой стране придумали караоке?", "options": ["Корея", "Китай", "Япония", "США"], "correct_index": 2},
     {"question": "Сколько нот в классической октаве?", "options": ["5", "7", "8", "12"], "correct_index": 1},
     {"question": "Что такое «конфетти» в переводе с итальянского?", "options": ["Бумажки", "Конфеты", "Звёздочки", "Радость"], "correct_index": 1}
   ]}'),

  -- ──────────────────────────────── Чилл ─────────────────────────────────
  ('chill', 1, 'geolocation', 'Найти своё место',
   'Найдите поблизости место, где удобно сесть всей компанией, и задержитесь там.',
   20, false, '{"radius_meters": 100, "duration_seconds": 180}'),
  ('chill', 2, 'photo', 'Вид отсюда',
   'Сфотографируйте то, что видите со своего места, — без людей в кадре.',
   25, false, '{"prompt": "Вид с места, где расположилась компания"}'),
  ('chill', 3, 'quiz', 'Спокойные вопросы',
   'Шесть вопросов не на скорость. За каждый верный ответ — 5 QP.',
   30, true, '{"questions": [
     {"question": "Сколько минут длится стандартный сеанс медитации для начинающих?", "options": ["1-2", "5-10", "30-40", "60"], "correct_index": 1},
     {"question": "Какой цвет считается самым успокаивающим?", "options": ["Красный", "Жёлтый", "Синий", "Оранжевый"], "correct_index": 2},
     {"question": "Что такое «хюгге»?", "options": ["Датское уютное настроение", "Шведский десерт", "Норвежский танец", "Финская баня"], "correct_index": 0},
     {"question": "Сколько часов сна рекомендуют взрослому человеку?", "options": ["4-5", "6-7", "7-9", "10-12"], "correct_index": 2},
     {"question": "Какое дерево считается символом долголетия в Японии?", "options": ["Сакура", "Сосна", "Клён", "Ива"], "correct_index": 1},
     {"question": "Что производит белый шум?", "options": ["Все частоты сразу", "Только низкие частоты", "Только высокие частоты", "Тишину"], "correct_index": 0}
   ]}'),

  -- ──────────────────────────────── Бар ──────────────────────────────────
  ('bar', 1, 'geolocation', 'Занять столик',
   'Дойдите до заведения и отметьтесь, когда окажетесь внутри.',
   20, false, '{"radius_meters": 50}'),
  ('bar', 2, 'photo', 'Стол целиком',
   'Сфотографируйте стол так, чтобы было видно всё, что на нём стоит.',
   25, false, '{"prompt": "Общий план стола компании"}'),
  ('bar', 3, 'quiz', 'Квиз по миксологии',
   'Шесть вопросов о барном деле. За каждый верный ответ — 5 QP.',
   30, true, '{"questions": [
     {"question": "Что входит в классический «Мохито» кроме мяты и лайма?", "options": ["Ром", "Джин", "Текила", "Виски"], "correct_index": 0},
     {"question": "Как называется инструмент для смешивания коктейлей встряхиванием?", "options": ["Джиггер", "Шейкер", "Мадлер", "Стрейнер"], "correct_index": 1},
     {"question": "Из чего делают текилу?", "options": ["Кукуруза", "Виноград", "Агава", "Сахарный тростник"], "correct_index": 2},
     {"question": "Что такое «джиггер»?", "options": ["Мерный стакан", "Ложка", "Соломинка", "Нож"], "correct_index": 0},
     {"question": "Какой коктейль подают с оливкой?", "options": ["Маргарита", "Мартини", "Негрони", "Дайкири"], "correct_index": 1},
     {"question": "В какой стране изобрели виски?", "options": ["Ирландия и Шотландия", "Франция", "Германия", "Италия"], "correct_index": 0}
   ]}'),

  -- ────────────────────────────── Прогулка ───────────────────────────────
  ('walk', 1, 'geolocation', 'Дойти до точки',
   'Пройдите до условленного места пешком и отметьтесь там.',
   20, false, '{"radius_meters": 50}'),
  ('walk', 2, 'photo', 'Самое старое здание',
   'Найдите поблизости здание, которое выглядит самым старым, и сфотографируйте его.',
   25, false, '{"prompt": "Самое старое здание в округе"}'),
  ('walk', 3, 'quiz', 'Что вокруг',
   'Шесть вопросов о городе и архитектуре. За каждый верный ответ — 5 QP.',
   30, true, '{"questions": [
     {"question": "Как называется наука о городах и их планировании?", "options": ["Геология", "Урбанистика", "Картография", "Топонимика"], "correct_index": 1},
     {"question": "Что изучает топонимика?", "options": ["Рельеф", "Происхождение названий", "Почвы", "Климат"], "correct_index": 1},
     {"question": "Сколько шагов в среднем в одном километре?", "options": ["Около 700", "Около 1300", "Около 2500", "Около 5000"], "correct_index": 1},
     {"question": "Какой стиль отличают колонны и портики?", "options": ["Готика", "Барокко", "Классицизм", "Модерн"], "correct_index": 2},
     {"question": "Что такое «сталинский ампир»?", "options": ["Стиль архитектуры", "Вид транспорта", "Тип дороги", "Сорт кирпича"], "correct_index": 0},
     {"question": "Как называется пешеходный переход в виде моста?", "options": ["Эстакада", "Виадук", "Надземный переход", "Акведук"], "correct_index": 2}
   ]}'),

  -- ────────────────────────────── Настолки ───────────────────────────────
  ('boardgames', 1, 'geolocation', 'Все за столом',
   'Соберитесь за игровым столом и отметьтесь, когда сядет вся компания.',
   20, false, '{"radius_meters": 50, "duration_seconds": 120}'),
  ('boardgames', 2, 'photo', 'Разложенная игра',
   'Сфотографируйте игру, разложенную и готовую к первому ходу.',
   25, false, '{"prompt": "Настольная игра, разложенная на столе"}'),
  ('boardgames', 3, 'quiz', 'Квиз для настольщиков',
   'Шесть вопросов об играх. За каждый верный ответ — 5 QP.',
   30, true, '{"questions": [
     {"question": "Сколько клеток на шахматной доске?", "options": ["36", "49", "64", "81"], "correct_index": 2},
     {"question": "В какой стране придумали го?", "options": ["Япония", "Китай", "Корея", "Индия"], "correct_index": 1},
     {"question": "Сколько костей в классическом домино?", "options": ["21", "28", "32", "36"], "correct_index": 1},
     {"question": "Как называется игра, где строят дороги и города из плиток?", "options": ["Каркассон", "Колонизаторы", "Монополия", "Диксит"], "correct_index": 0},
     {"question": "Сколько карт в стандартной колоде без джокеров?", "options": ["36", "48", "52", "54"], "correct_index": 2},
     {"question": "Что такое «евроигра» в настольных играх?", "options": ["Игра с упором на стратегию", "Игра на деньги", "Игра на скорость", "Игра для двоих"], "correct_index": 0}
   ]}'),

  -- ─────────────────────────────── Другое ────────────────────────────────
  ('other', 1, 'geolocation', 'Отметиться на месте',
   'Дойдите до места встречи и подтвердите, что вы здесь.',
   20, false, '{"radius_meters": 50}'),
  ('other', 2, 'photo', 'Одна деталь',
   'Найдите вокруг деталь, которую остальные вряд ли заметили, и сфотографируйте её.',
   25, false, '{"prompt": "Незаметная деталь на месте встречи"}'),
  ('other', 3, 'quiz', 'Разминка для эрудитов',
   'Шесть вопросов обо всём. За каждый верный ответ — 5 QP.',
   30, true, '{"questions": [
     {"question": "Сколько материков на Земле?", "options": ["5", "6", "7", "8"], "correct_index": 1},
     {"question": "Какая планета ближе всего к Солнцу?", "options": ["Венера", "Меркурий", "Марс", "Земля"], "correct_index": 1},
     {"question": "Сколько цветов в радуге по русской традиции?", "options": ["5", "6", "7", "9"], "correct_index": 2},
     {"question": "Какой металл жидкий при комнатной температуре?", "options": ["Ртуть", "Свинец", "Олово", "Цинк"], "correct_index": 0},
     {"question": "Сколько минут в сутках?", "options": ["1200", "1440", "1600", "2400"], "correct_index": 1},
     {"question": "Какое животное самое большое на планете?", "options": ["Слон", "Синий кит", "Жираф", "Кашалот"], "correct_index": 1}
   ]}')

  ) as d (code, position, type, title, description, qp_reward, is_shared, params)
    on d.code = i.code;
