-- 013. Карточка встречи по ссылке — до входа.
--
-- Организатор зовёт знакомых ссылкой, но тот, у кого нет аккаунта,
-- попадал на экран приветствия: ни названия, ни времени, ни места — просто
-- предложение зарегистрироваться неизвестно куда. Регистрация ради
-- «посмотреть, что там» выглядит навязчивой, и по такой ссылке никто не
-- переходит дважды.
--
-- Эта функция отдаёт ровно то, что и так написано в самом приглашении:
-- название, описание, обложку, время, адрес, сколько мест занято и кто
-- зовёт. Ничего больше: ни списка участников, ни чата, ни заданий, ни
-- координат — они остаются за входом, как и раньше.
--
-- Читать её может кто угодно, включая гостя без аккаунта (роль anon), и
-- это осознанно: всё перечисленное отправитель уже написал в сообщении с
-- ссылкой. Остальные таблицы по-прежнему закрыты политиками доступа —
-- функция работает от имени владельца базы и отдаёт только этот набор.
--
-- Файл можно выполнять повторно.

create or replace function invite_card (event_id uuid) returns jsonb
language sql security definer stable set search_path = public as $invite_card$
  select jsonb_build_object(
    'id',        e.id,
    'title',     e.title,
    'description', coalesce(e.description, ''),
    'cover_url', e.cover_url,
    'category',  i.code,
    'address',   e.address,
    'starts_at', e.starts_at,
    'status',    e.status,
    'taken',     (select count(*) from event_participant p where p.event_id = e.id),
    'places',    e.max_participants,
    'organizer', (
      select jsonb_build_object('nickname', u.nickname, 'avatar_url', u.avatar_url)
        from app_user u where u.id = e.organizer_id
    )
  )
  from event e
  left join interest i on i.id = e.category_id
  where e.id = invite_card.event_id
$invite_card$;

grant execute on function invite_card (uuid) to anon, authenticated;

insert into schema_note (key) values ('013_invite_card')
on conflict (key) do update set applied_at = now();
