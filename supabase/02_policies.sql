-- Questa MVP — политики доступа (RLS).
-- Правило: данные читает и пишет только тот, кому они по ЧТЗ доступны.
-- Чат ивента (ЧТЗ 5.8) — «доступен только участникам и организатору»,
-- QP/XP-баланс (ЧТЗ 5.15) — приватен, в чужом профиле не показывается.

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
