import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button, Field } from '../components/ui'
import { CATEGORIES, type CategoryCode } from '../data/demo'
import { useAuth } from '../lib/auth'

/** Никнейм, город и интересы — шаг 5 регистрации (ЧТЗ 5.1.1). */
export default function Interests () {
  const navigate = useNavigate()
  const { createProfile, profile, ready } = useAuth()
  const [nickname, setNickname] = useState('')
  const [city, setCity] = useState('')
  const [chosen, setChosen] = useState<CategoryCode[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit () {
    setBusy(true)
    try {
      await createProfile({ nickname: nickname.trim(), city: city.trim(), interests: chosen })
      navigate('/')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ''
      setError(message.includes('duplicate') || message.includes('unique')
        ? 'Такой никнейм уже занят'
        : 'Не удалось сохранить профиль')
    } finally {
      setBusy(false)
    }
  }

  const toggle = (code: CategoryCode) =>
    setChosen((list) => (list.includes(code) ? list.filter((c) => c !== code) : [...list, code]))

  // Профиль уже заполнен — например, страницу просто перезагрузили.
  if (ready && profile) return <Navigate to="/" replace />

  return (
    <div className="flex h-full flex-col gap-6 px-6 pb-8 pt-10">
      <div className="space-y-2">
        <h1 className="text-[28px]">Создание профиля</h1>
        <p className="text-[17px] text-white/75">Расскажите о себе — так подберём ивенты точнее.</p>
      </div>

      <div className="space-y-4">
        <Field
          placeholder="Никнейм" value={nickname} maxLength={20}
          onChange={(e) => setNickname(e.target.value)}
        />
        <Field placeholder="Город" value={city} onChange={(e) => setCity(e.target.value)} />
      </div>

      <div className="space-y-3">
        <h2 className="text-[20px]">Интересы</h2>
        <div className="flex flex-wrap gap-2.5">
          {CATEGORIES.map(({ code, title }) => (
            <button
              key={code} onClick={() => toggle(code)}
              className={`rounded-2xl px-5 py-3 text-[16px] font-medium transition ${
                chosen.includes(code)
                  ? 'bg-accent text-white'
                  : 'border border-white/15 text-white'}`}
            >
              {title}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-auto space-y-3">
        {error && <p className="text-[15px] text-red-400">{error}</p>}
        <Button disabled={busy || !nickname || !city || chosen.length === 0} onClick={submit}>
          {busy ? 'Сохраняем…' : 'Готово'}
        </Button>
      </div>
    </div>
  )
}
