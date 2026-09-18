-- 011. Ответы квиза сохраняются, правки встречи ограничены.
--
-- Две дыры, найденные при живой проверке.
--
--   1. Квиз можно было переигрывать. Ответил, увидел подсвеченный верный
--      вариант, вышел, зашёл снова — и квиз начинался с первого вопроса,
--      уже с известными ответами. Очки при этом начисляются за верные,
--      так что набрать полные тридцать было делом трёх заходов.
--
--      Теперь каждый ответ записывается отдельной строкой, а повторный
--      ответ на тот же вопрос отклоняется первичным ключом. Изменять и
--      удалять эти строки не может никто: правил на update и delete нет,
--      а значит их нельзя ни переписать, ни стереть и начать заново.
--
--   2. Встречу можно было править без конца. Каждая правка шлёт
--      уведомление всем участникам, так что это ещё и рассылка. Плюс
--      перенос времени за десять минут до начала оставляет людей, которые
--      уже вышли из дома, ни с чем.
--
--      Ограничения: не больше пяти правок, не чаще раза в пять минут, а
--      время и место нельзя менять, когда до начала меньше часа, — тогда
--      остаётся только отменить встречу.
--
-- Файл можно выполнять повторно.

-- ─────────────────────────── ответы квиза ───────────────────────────

create table if not exists quiz_answer (
  task_id        uuid not null references task (id) on delete cascade,
  user_id        uuid not null references app_user (id) on delete cascade,
  question_index smallint not null,
  is_correct     boolean not null,
  answered_at    timestamptz not null default now(),
  primary key (task_id, user_id, question_index)
);

alter table quiz_answer enable row level security;

-- Свои ответы человек видит: по ним экран понимает, с какого вопроса
-- продолжать. Чужие не нужны никому — даже организатору.
drop policy if exists read_own_answers on quiz_answer;
create policy read_own_answers on quiz_answer
  for select to authenticated using (user_id = auth.uid());

drop policy if exists answer_quiz on quiz_answer;
create policy answer_quiz on quiz_answer
  for insert to authenticated with check (user_id = auth.uid());

-- ──────────────────── ограничения на правку встречи ────────────────────

alter table event add column if not exists edits_count    integer not null default 0;
alter table event add column if not exists last_edited_at timestamptz;

create or replace function guard_event_edit () returns trigger
language plpgsql security definer set search_path = public as $guard_event_edit$
declare
  edited  boolean;
  moved   boolean;
  to_start interval;
begin
  -- Правкой считается только то, что видно участникам. Смена статуса,
  -- открытие чата и служебные отметки времени идут мимо этих правил.
  edited := old.status = 'active' and new.status = 'active' and (
       old.title            is distinct from new.title
    or old.description      is distinct from new.description
    or old.address          is distinct from new.address
    or old.starts_at        is distinct from new.starts_at
    or old.min_participants is distinct from new.min_participants
    or old.max_participants is distinct from new.max_participants
    or old.category_id      is distinct from new.category_id
    or old.cover_url        is distinct from new.cover_url
  );

  if not edited then return new; end if;

  moved := old.starts_at is distinct from new.starts_at
        or old.address   is distinct from new.address;

  to_start := old.starts_at - now();

  if moved and to_start < interval '1 hour' then
    raise exception 'За час до начала перенести встречу нельзя — люди уже в пути. Можно только отменить';
  end if;

  if new.edits_count = old.edits_count then          -- счётчик ведёт база
    if old.edits_count >= 5 then
      raise exception 'Встречу можно править не больше пяти раз. Если планы изменились сильнее — отмените её';
    end if;

    if old.last_edited_at is not null
       and now() - old.last_edited_at < interval '5 minutes' then
      raise exception 'Слишком часто: следующая правка через несколько минут';
    end if;

    new.edits_count    := old.edits_count + 1;
    new.last_edited_at := now();
  end if;

  return new;
end;
$guard_event_edit$;

drop trigger if exists guard_event_edit_before_update on event;

create trigger guard_event_edit_before_update
before update on event
for each row execute function guard_event_edit();

insert into schema_note (key) values ('011_quiz_and_edit_limits')
on conflict (key) do update set applied_at = now();
