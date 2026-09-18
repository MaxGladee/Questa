import { Link, useParams } from 'react-router-dom'
import { Cover } from '../components/Art'
import { Avatar, Button } from '../components/ui'
import { Failed, Loading } from '../components/States'
import { CalendarIcon, PinIcon, UserIcon } from '../components/icons'
import { categoryTitle, formatDate, formatTime } from '../data/demo'
import { getInviteCard } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { rememberDestination } from '../lib/destination'

/**
 * Приглашение на встречу для того, у кого ещё нет аккаунта.
 *
 * Раньше ссылка вела на экран приветствия: ни названия, ни времени, ни
 * места — просто предложение зарегистрироваться неизвестно куда.
 * Регистрация ради «посмотреть, что там» выглядит навязчиво, и по такой
 * ссылке не переходят дважды.
 *
 * Здесь видно то же, что отправитель и так написал в сообщении, и сразу
 * понятно, зачем заводить аккаунт. Всё остальное — участники, чат,
 * задания — остаётся за входом.
 */
export default function Invite () {
  const { id } = useParams()
  const { data: card, error, loading } = useAsync(() => getInviteCard(id!), [id])

  // Куда вернуть человека после входа: он шёл на эту встречу, а не на
  // главную.
  const join = () => rememberDestination(`/event/${id}`)

  if (loading) return <Loading label="Открываем приглашение…" />

  if (error || !card) {
    return (
      <div className="flex h-full flex-col justify-center gap-5 px-6 text-center">
        <Failed message="Такой встречи нет — возможно, её отменили" />
        <Link to="/start" className="text-[17px] text-accent-soft">Открыть Questa</Link>
      </div>
    )
  }

  const gone = card.status !== 'active'
  const full = card.taken >= card.places

  return (
    <div className="no-scrollbar h-full overflow-y-auto">
      <Cover src={card.coverUrl} category={card.category} className="h-52 w-full" />

      <div className="space-y-5 px-5 pb-10 pt-5">
        <div className="space-y-2">
          <span className="inline-block rounded-full bg-accent px-3.5 py-1.5 text-[14px] font-semibold">
            {categoryTitle(card.category)}
          </span>
          <h1 className="text-[26px]">{card.title}</h1>
          {card.description && (
            <p className="text-[17px] leading-snug text-white/80">{card.description}</p>
          )}
        </div>

        <div className="space-y-2.5 rounded-card bg-surface-2 p-4">
          <p className="flex items-center gap-3 text-[17px]">
            <CalendarIcon className="size-5 shrink-0 text-accent" />
            {formatDate(card.startsAt)}, {formatTime(card.startsAt)}
          </p>
          <p className="flex items-center gap-3 text-[17px]">
            <PinIcon className="size-5 shrink-0 text-accent" />
            <span className="min-w-0 flex-1">{card.address}</span>
          </p>
          <p className="flex items-center gap-3 text-[17px]">
            <UserIcon className="size-5 shrink-0 text-accent" />
            {card.taken} из {card.places} мест занято
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-card bg-surface-2 p-4">
          <Avatar name={card.organizer.nickname} src={card.organizer.avatarUrl} size={48} />
          <div className="min-w-0">
            <p className="text-[15px] text-muted">Зовёт</p>
            <p className="truncate text-[18px] font-semibold">{card.organizer.nickname}</p>
          </div>
        </div>

        {/* Объяснение, во что человек ввязывается: без него «создать
            аккаунт» выглядит платой за просмотр чужой встречи. */}
        <div className="rounded-card bg-surface p-4">
          <p className="text-[17px] font-semibold">Questa — встречи как маленькая игра</p>
          <p className="mt-1 text-[16px] leading-snug text-muted">
            Компания собирается по такой же ссылке, а на самой встрече приложение выдаёт
            квест: дойти до места, найти кадр, ответить на вопросы о городе. За задания
            дают очки, по ним растёт уровень.
          </p>
        </div>

        {gone ? (
          <p className="rounded-card bg-surface-2 p-4 text-center text-[16px] text-muted">
            Эта встреча уже прошла или отменена. Но рядом наверняка есть другие.
          </p>
        ) : full ? (
          <p className="rounded-card bg-surface-2 p-4 text-center text-[16px] text-muted">
            Мест уже не осталось. Заходите — на карте есть другие встречи рядом.
          </p>
        ) : null}

        <div className="space-y-3">
          <Link to="/register" onClick={join} className="block">
            <Button>{gone || full ? 'Создать аккаунт' : 'Присоединиться'}</Button>
          </Link>
          <Link to="/login" onClick={join} className="block">
            <Button variant="ghost">У меня уже есть аккаунт</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
