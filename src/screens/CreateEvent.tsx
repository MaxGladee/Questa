import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Field, TextArea } from '../components/ui'
import { CalendarIcon, CameraIcon, ClockIcon, CloseIcon } from '../components/icons'
import { CATEGORIES, type CategoryCode } from '../data/demo'
import { createEvent, geocode } from '../lib/api'
import { useAuth } from '../lib/auth'

/** Создание ивента (ЧТЗ 5.5). Состав полей и ограничения — из таблицы формы. */
export default function CreateEvent () {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const [category, setCategory] = useState<CategoryCode>('party')
  const [chatMode, setChatMode] = useState<'auto' | 'manual'>('auto')
  const [created, setCreated] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit () {
    if (title.trim().length < 3) return setError('Название — от 3 до 50 символов')
    if (!address.trim()) return setError('Укажите место встречи')
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
      const [lat, lng] = await geocode(address.trim())
      const id = await createEvent({
        title: title.trim(),
        description: description.trim(),
        address: address.trim(),
        lat, lng,
        startsAt: startsAt.toISOString(),
        minParticipants: from,
        maxParticipants: to,
        category,
        chatMode,
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

        <button className="flex w-full items-center gap-4 rounded-card border border-dashed
                           border-white/30 p-3 text-left">
          <span className="grid size-[76px] place-items-center rounded-2xl bg-field">
            <CameraIcon className="size-8 text-accent" />
          </span>
          <span className="text-[18px] leading-snug">Загрузите<br />обложку ивента</span>
        </button>

        <label className="block space-y-2">
          <span className="text-[17px]">Место</span>
          <Field
            placeholder="Укажите локацию"
            value={address} onChange={(e) => setAddress(e.target.value)}
          />
        </label>

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

        <Button onClick={submit} disabled={busy}>
          {busy ? 'Создаём…' : 'Создать ивент'}
        </Button>
      </div>
    </div>
  )
}
