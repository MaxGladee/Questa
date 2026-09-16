-- Questa MVP — схема базы данных
-- Соответствует разделу 9 ЧТЗ («Модель данных»).
-- Отличие от ЧТЗ: таблица `user` заменена на `app_user`, а пароли и сессии
-- (password_hash, JWT) обслуживает встроенный модуль auth Supabase —
-- в Postgres это схема auth, таблица auth.users. Остальные сущности 1:1 с ЧТЗ.

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
