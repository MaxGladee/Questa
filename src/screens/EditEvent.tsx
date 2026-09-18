import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Field, TextArea } from '../components/ui'
import { CalendarIcon, ClockIcon, CloseIcon, PinIcon } from '../components/icons'
import { Failed, Loading } from '../components/States'
import { PickerField, Sheet } from '../components/Sheet'
import { NumberWheel } from '../components/NumberWheel'
import LocationPicker from './LocationPicker'
import { CATEGORIES, categoryTitle, formatWhen, type CategoryCode } from '../data/demo'
import { categoryArt } from '../data/category-art'
import { EDIT_LOCK_MINUTES, MAX_EVENT_EDITS, getEvent, updateEvent } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { useAuth } from '../lib/auth'
import { useToast } from '../components/Toast'

/**
 * Правка встречи организатором.
 *
 * Единственным способом что-то изменить была отмена: заболел, закрылось
 * заведение, договорились на час позже — и приходилось собирать людей
 * заново. Здесь те же поля, что при создании, и те же ограничения; о
 * правках участникам расскажет база (миграция 010) и заодно переставит
 * напоминания на новое время.
 *
 * Название и описание меняются свободно, а вот мест нельзя поставить
 * меньше, чем людей уже записалось: иначе кто-то оказался бы лишним задним
 * числом.
 */
export default function EditEvent () {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const toast = useToast()

  const { data: event, error, loading } = useAsync(
    () => getEvent(id!, profile?.id ?? null), [id, profile?.id],
  )

  if (loading) return <Loading label="Открываем ивент…" />
  if (error || !event) return <Failed message={error ?? 'Ивент не найден'} />

  if (event.myRole !== 'organizer') {
    return <Failed message="Менять встречу может только организатор" />
  }
  if (event.status !== 'active') {
    return <Failed message="Начатую или завершённую встречу менять поздно" />
  }

  return <Form event={event} onDone={() => navigate(`/event/${event.id}`, { replace: true })}
    onCancel={() => navigate(-1)} organizerId={profile!.id} toast={toast} />
}

type Ev = NonNullable<Awaited<ReturnType<typeof getEvent>>>

/**
 * Сама форма вынесена отдельно: она начинает жизнь с уже загруженными
 * значениями, а состояние в React нельзя объявлять после возврата из
 * компонента.
 */
function Form (
  { event, organizerId, onDone, onCancel, toast }: {
    event: Ev
    organizerId: string
    onDone: () => void
    onCancel: () => void
    toast: (text: string, tone?: 'ok' | 'error') => void
  },
) {
  const starts = new Date(event.startsAt)
  const pad = (value: number) => String(value).padStart(2, '0')

  const [title, setTitle] = useState(event.title)
  const [description, setDescription] = useState(event.description)
  const [place, setPlace] = useState({
    address: event.address, lat: event.lat, lng: event.lng,
  })
  const [date, setDate] = useState(
    `${starts.getFullYear()}-${pad(starts.getMonth() + 1)}-${pad(starts.getDate())}`,
  )
  const [time, setTime] = useState(`${pad(starts.getHours())}:${pad(starts.getMinutes())}`)
  const [min, setMin] = useState(event.minParticipants)
  const [max, setMax] = useState(event.maxParticipants)
  const [category, setCategory] = useState<CategoryCode>(event.category)

  const [pickingPlace, setPickingPlace] = useState(false)
  const [pickingCategory, setPickingCategory] = useState(false)
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)

  const joined = event.participants.length
  const when = date && time ? new Date(`${date}T${time}`) : null
  const past = when !== null && when.getTime() <= Date.now()

  // Правки ограничены нарочно: каждая шлёт уведомление всем участникам, а
  // перенос за полчаса до начала оставляет ни с чем тех, кто уже вышел из
  // дома. Те же правила стоят в базе — здесь они только объясняются
  // заранее, чтобы человек не упёрся в отказ после заполнения формы.
  const editsLeft = event.editsLeft ?? MAX_EVENT_EDITS
  const minutesToStart = (new Date(event.startsAt).getTime() - Date.now()) / 60_000
  const locked = minutesToStart < EDIT_LOCK_MINUTES

  async function save () {
    if (title.trim().length < 3) return setProblem('Название — от 3 до 50 символов')
    if (!date || !time) return setProblem('Укажите дату и время')

    setProblem('')
    setBusy(true)
    try {
      await updateEvent(event.id, organizerId, {
        title: title.trim(),
        description: description.trim(),
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        startsAt: new Date(`${date}T${time}`).toISOString(),
        minParticipants: min,
        maxParticipants: max,
        category,
      })

      toast(joined > 1 ? 'Изменения сохранены, участникам придёт уведомление' : 'Изменения сохранены')
      onDone()
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-t-[28px] bg-surface">
      <div className="pt-3">
        <span className="mx-auto block h-1.5 w-12 rounded-full bg-white/40" />
      </div>

      <header className="flex items-center gap-3 px-5 py-3">
        <div className="size-10" />
        <h1 className="flex-1 text-center text-[21px]">Изменить ивент</h1>
        <button
          onClick={onCancel} aria-label="Закрыть"
          className="grid size-10 place-items-center rounded-full bg-white/15"
        >
          <CloseIcon className="size-6" />
        </button>
      </header>

      <div className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-5 pb-8">
        {joined > 1 && (
          <p className="rounded-card bg-surface-2 p-3.5 text-[15px] leading-snug text-muted">
            Записались {joined} человек. О переносе времени, смене места и названия им придёт
            уведомление, а напоминания переставятся на новое время.
            {editsLeft <= 2 && ` Правок осталось: ${editsLeft} из ${MAX_EVENT_EDITS}.`}
          </p>
        )}

        {locked && (
          <p className="rounded-card bg-yellow-400/15 p-3.5 text-[15px] leading-snug text-yellow-200">
            До начала меньше часа: время и место уже не поменять — люди в пути. Название и
            описание поправить можно, а если планы сорвались совсем, встречу лучше отменить.
          </p>
        )}

        {editsLeft === 0 && (
          <p className="rounded-card bg-red-500/15 p-3.5 text-[15px] leading-snug text-red-300">
            Правки закончились: встречу можно менять не больше {MAX_EVENT_EDITS} раз. Если
            планы изменились сильнее, её стоит отменить и собрать заново.
          </p>
        )}

        <label className="block space-y-2">
          <span className="text-[17px]">Название</span>
          <Field
            placeholder="Придумайте название" maxLength={50}
            value={title} onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="block space-y-2">
          <span className="text-[17px]">Описание</span>
          <TextArea
            placeholder="Чем будете заниматься?" rows={4} maxLength={500}
            value={description} onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <div className="space-y-2">
          <span className="text-[17px]">Место</span>
          <button
            onClick={() => setPickingPlace(true)} disabled={locked}
            className="flex w-full items-center gap-3 rounded-field bg-field px-4 py-4 text-left
                       disabled:opacity-50"
          >
            <PinIcon className="size-6 shrink-0 text-accent" />
            <span className="min-w-0 flex-1 truncate text-[17px]">{place.address}</span>
          </button>
        </div>

        <div className="space-y-2">
          <span className="text-[17px]">Дата и время</span>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 rounded-field bg-field px-4">
              <CalendarIcon className="size-5 shrink-0 text-muted" />
              <input
                type="date" lang="ru" value={date} onChange={(e) => setDate(e.target.value)}
                aria-label="Дата" disabled={locked}
                className="w-full bg-transparent py-4 text-[17px] outline-none"
              />
            </label>
            <label className="flex items-center gap-2 rounded-field bg-field px-4">
              <ClockIcon className="size-5 shrink-0 text-muted" />
              <input
                type="time" lang="ru" value={time} onChange={(e) => setTime(e.target.value)}
                aria-label="Время" disabled={locked}
                className="w-full bg-transparent py-4 text-[17px] outline-none"
              />
            </label>
          </div>

          {when && (
            <p className={`text-[15px] leading-snug ${past ? 'text-red-400' : 'text-muted'}`}>
              {past ? 'Это время уже прошло — выберите будущее' : `Встреча начнётся ${formatWhen(when)}`}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <span className="text-[17px]">Участники</span>
          <div className="grid grid-cols-2 gap-3">
            <NumberWheel
              label="Минимум" value={min} from={2} to={10}
              onChange={(value) => { setMin(value); if (value > max) setMax(value) }}
            />
            <NumberWheel
              // Ниже числа записавшихся мест не поставить: люди уже здесь.
              label="Максимум" value={max} from={Math.max(min, joined)} to={10}
              onChange={setMax}
            />
          </div>
        </div>

        <PickerField
          label="Категория ивента"
          value={`${categoryArt(category).emoji}  ${categoryTitle(category)}`}
          placeholder="Выберите категорию"
          onOpen={() => setPickingCategory(true)}
        />

        {problem && <p className="text-[15px] text-red-400">{problem}</p>}

        <div className="space-y-3 pt-1">
          <Button disabled={busy || past || editsLeft === 0} onClick={save}>
            {busy ? 'Сохраняем…' : 'Сохранить изменения'}
          </Button>
          <Button variant="quiet" onClick={onCancel}>Не менять</Button>
        </div>
      </div>

      {pickingCategory && (
        <Sheet
          title="Категория ивента"
          options={CATEGORIES.map(({ code, title: name }) => ({
            value: code,
            title: `${categoryArt(code).emoji}  ${name}`,
          }))}
          selected={[category]}
          searchable={false}
          onClose={() => setPickingCategory(false)}
          onApply={(values) => {
            setCategory(values[0] as CategoryCode)
            setPickingCategory(false)
          }}
        />
      )}

      {pickingPlace && (
        <LocationPicker
          initial={place}
          onClose={() => setPickingPlace(false)}
          onPick={(picked) => { setPlace(picked); setPickingPlace(false) }}
        />
      )}
    </div>
  )
}
