-- 007. Ачивки запоминают дату получения.
--
-- Сами ачивки ниоткуда не берутся: каждая выводится из чисел профиля
-- (сколько встреч, какой уровень, какая серия). Пересчитывать их так —
-- честно и без рассинхрона, но у такого способа нет памяти: показать
-- «получено 18 сентября» не из чего.
--
-- Эта таблица и есть память. Приложение при открытии профиля дописывает в
-- неё те ачивки, которые уже выполнены, а строка, однажды появившись,
-- больше не меняется — дата остаётся той, когда условие впервые сошлось.
-- Отметка приходит с устройства, поэтому дата приблизительна с точностью
-- до ближайшего захода в профиль; для подписи под ачивкой этого хватает,
-- а отдельного демона ради минут заводить незачем.
--
-- Файл можно выполнять повторно.

create table if not exists achievement (
  user_id  uuid not null references app_user (id) on delete cascade,
  code     text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, code)
);

alter table achievement enable row level security;

-- Чужие ачивки видны: они показываются в профиле другого человека.
drop policy if exists read_achievements on achievement;
create policy read_achievements on achievement
  for select to authenticated using (true);

-- Дописывать можно только себе. Изменять и удалять нельзя никому: дата
-- получения не должна задним числом переезжать.
drop policy if exists earn_achievement on achievement;
create policy earn_achievement on achievement
  for insert to authenticated with check (user_id = auth.uid());

insert into schema_note (key) values ('007_achievements')
on conflict (key) do update set applied_at = now();
