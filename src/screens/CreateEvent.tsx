import { useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Field, TextArea } from '../components/ui'
import { CalendarIcon, CameraIcon, ClockIcon, CloseIcon, PinIcon } from '../components/icons'
import LocationPicker from './LocationPicker'
import { CATEGORIES, type CategoryCode } from '../data/demo'
import type { Idea } from '../data/ideas'
import {
  WEEKLY_EVENT_LIMIT, WEEKLY_LIMIT_ENABLED, createEvent, eventsLeftThisWeek, uploadImage,
} from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { useAuth } from '../lib/auth'

/** Создание ивента (ЧТЗ 5.5). Состав полей и ограничения — из таблицы формы. */
export default function CreateEvent () {
  const navigate = useNavigate()
  const { profile } = useAuth()

  // Форма могла быть открыта по готовой идее с главной — тогда поля уже
  // заполнены, и пользователю остаётся указать место и время.
  const { state } = useLocation() as { state?: { idea?: Idea } }
  const idea = state?.idea

  const [title, setTitle] = useState(idea?.title ?? '')
  const [description, setDescription] = useState(idea?.description ?? '')
  const [place, setPlace] = useState<{ address: string; lat: number; lng: number } | null>(null)
  const [pickingPlace, setPickingPlace] = useState(false)
  const { data: left } = useAsync(
    () => profile ? eventsLeftThisWeek(profile.id) : Promise.resolve(WEEKLY_EVENT_LIMIT),
    [profile?.id],
  )

  const [cover, setCover] = useState<string>()
  const [coverBusy, setCoverBusy] = useState(false)
  const coverInput = useRef<HTMLInputElement>(null)

  async function uploadCover (file: File | undefined) {
    if (!file || !profile) return
    setCoverBusy(true)
    setError('')
    try {
      setCover(await uploadImage(file, profile.id, 'cover'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить обложку')
    } finally {
      setCoverBusy(false)
    }
  }
  const [date, setDate] = useState('')
  const [time, setTime] = useState(idea ? `${String(idea.hour).padStart(2, '0')}:00` : '')
  const [min, setMin] = useState(idea ? String(idea.participants[0]) : '')
  const [max, setMax] = useState(idea ? String(idea.participants[1]) : '')
  const [category, setCategory] = useState<CategoryCode>(idea?.category ?? 'party')
  const [chatMode, setChatMode] = useState<'auto' | 'manual'>('auto')
  const [created, setCreated] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit () {
    if (title.trim().length < 3) return setError('Название — от 3 до 50 символов')
    if (!place) return setError('Выберите место встречи')
    if (!date || !time) return setError('Укажите дату и время')

    const from = Number(min)
    const to = Number(max)
    if (!(from >= 2 && from <= 10)) return setError('Минимум участников — от 2 до 10')
    if (!(to >= from && to <= 10)) return setError('Максимум не меньше минимума и не больше 10')

    // Дата и время не раньше чем через 30 минут и не позже 7 дней (ЧТЗ 5.5).
    const startsAt = new Date(`${date}T${time}`)
    const now = Date.now()
    if (startsAt.getTime() < now + 30 * 60_000) {
      return setError('Ивент должен начинаться не раньше чем через 30 минут')
    }
    if (startsAt.getTime() > now + 7 * 86_400_000) {
      return setError('Ивент нельзя назначить дальше чем на неделю вперёд')
    }

    setError('')
    setBusy(true)
    try {
      const id = await createEvent({
        title: title.trim(),
        description: description.trim(),
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        coverUrl: cover,
        startsAt: startsAt.toISOString(),
        minParticipants: from,
        maxParticipants: to,
        category,
        chatMode,
        interests: profile!.interests,
      }, profile!.id)
      setCreated(id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось создать ивент')
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
        <span className="text-[64px]">🎉</span>
        <h1 className="text-[30px]">Ивент создан!</h1>
        <p className="text-[17px] text-white/80">
          Он появился на карте и в рекомендациях. Квест подберётся к началу встречи.
        </p>
        <div className="mt-4 w-full space-y-3">
          <Button onClick={() => navigate(`/event/${created}`)}>Открыть ивент</Button>
          <Button variant="ghost" onClick={() => navigate('/')}>На главную</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-t-[28px] bg-surface">
      <div className="pt-3">
        <span className="mx-auto block h-1.5 w-12 rounded-full bg-white/40" />
      </div>

      <header className="flex items-center gap-3 px-5 py-3">
        <div className="size-10" />
        <h1 className="flex-1 text-center text-[21px]">Новый ивент</h1>
        <button
          onClick={() => navigate(-1)} aria-label="Закрыть"
          className="grid size-10 place-items-center rounded-full bg-white/15"
        >
          <CloseIcon className="size-6" />
        </button>
      </header>

      <div className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-5 pb-8">
        {WEEKLY_LIMIT_ENABLED && left !== null && (
          <p className={`rounded-card p-3.5 text-[15px] leading-snug ${
            left === 0 ? 'bg-red-500/15 text-red-300' : 'bg-surface-2 text-muted'}`}>
            {left === 0
              ? `Квота на неделю исчерпана: ${WEEKLY_EVENT_LIMIT} ивента уже созданы. `
                + 'Отмена созданного её не возвращает.'
              : `Осталось создать на этой неделе: ${left} из ${WEEKLY_EVENT_LIMIT}`}
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

        <button
          onClick={() => coverInput.current?.click()} disabled={coverBusy}
          className="flex w-full items-center gap-4 rounded-card border border-dashed
                     border-white/30 p-3 text-left"
        >
          {cover ? (
            <img src={cover} alt="" className="size-[76px] shrink-0 rounded-2xl object-cover" />
          ) : (
            <span className="grid size-[76px] shrink-0 place-items-center rounded-2xl bg-field">
              <CameraIcon className="size-8 text-accent" />
            </span>
          )}
          <span className="text-[17px] leading-snug">
            {coverBusy ? 'Загружаем…' : cover ? 'Обложка загружена. Заменить?' : 'Загрузите обложку ивента'}
          </span>
        </button>

        <input
          ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          onChange={(e) => uploadCover(e.target.files?.[0])}
        />

        {/* Место выбирается на карте или из списка, а не набирается руками:
            ивенту нужны координаты, а не строка. */}
        <div className="space-y-2">
          <span className="text-[17px]">Место</span>
          <button
            onClick={() => setPickingPlace(true)}
            className="flex w-full items-center gap-3 rounded-field bg-field px-4 py-4 text-left"
          >
            <PinIcon className={`size-6 shrink-0 ${place ? 'text-accent' : 'text-muted'}`} />
            <span className={`min-w-0 flex-1 truncate text-[17px] ${
              place ? '' : 'text-muted'}`}>
              {place?.address ?? 'Выбрать место на карте'}
            </span>
          </button>
        </div>

        <div className="space-y-2">
          <span className="text-[17px]">Дата и время</span>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 rounded-field bg-field px-4">
              <CalendarIcon className="size-5 shrink-0 text-muted" />
              <input
                type="date" value={date} onChange={(e) => setDate(e.target.value)}
                aria-label="Дата"
                className="w-full bg-transparent py-4 text-[17px] outline-none"
              />
            </label>
            <label className="flex items-center gap-2 rounded-field bg-field px-4">
              <ClockIcon className="size-5 shrink-0 text-muted" />
              <input
                type="time" value={time} onChange={(e) => setTime(e.target.value)}
                aria-label="Время"
                className="w-full bg-transparent py-4 text-[17px] outline-none"
              />
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-[17px]">Участники</span>
          <div className="grid grid-cols-2 gap-3">
            <Field
              type="number" min={2} max={10} placeholder="Минимум"
              value={min} onChange={(e) => setMin(e.target.value)}
            />
            <Field
              type="number" min={2} max={10} placeholder="Максимум"
              value={max} onChange={(e) => setMax(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-3">
          <span className="text-[17px]">Категория ивента</span>
          <div className="flex flex-wrap gap-2.5">
            {CATEGORIES.map(({ code, title: label }) => (
              <button
                key={code} onClick={() => setCategory(code)}
                className={`rounded-2xl px-5 py-3 text-[17px] transition ${
                  category === code ? 'bg-accent' : 'border border-white/15'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Режим создания чата — ЧТЗ 5.5, «О режиме создания чата». */}
        <div className="space-y-3">
          <span className="text-[17px]">Чат участников</span>
          <div className="flex gap-2.5">
            {([
              ['auto', 'Автоматически'],
              ['manual', 'Вручную'],
            ] as const).map(([mode, label]) => (
              <button
                key={mode} onClick={() => setChatMode(mode)}
                className={`flex-1 rounded-2xl px-4 py-3 text-[17px] transition ${
                  chatMode === mode ? 'bg-accent' : 'border border-white/15'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[15px] leading-snug text-muted">
            {chatMode === 'auto'
              ? 'Чат откроется сам, как только наберётся минимум участников.'
              : 'Чат откроете вы сами — кнопкой в карточке ивента.'}
          </p>
        </div>

        {error && <p className="text-[15px] text-red-400">{error}</p>}

        <Button onClick={submit} disabled={busy || left === 0}>
          {busy ? 'Придумываем квест…' : 'Создать ивент'}
        </Button>
      </div>

      {pickingPlace && (
        <LocationPicker
          initial={place ?? undefined}
          onClose={() => setPickingPlace(false)}
          onPick={(chosen) => { setPlace(chosen); setPickingPlace(false); setError('') }}
        />
      )}
    </div>
  )
}
