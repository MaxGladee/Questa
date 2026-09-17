import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui'
import { AvatarPicker, NicknameField } from '../components/ProfileFields'
import { InterestsField, CityField } from '../components/ProfilePickers'
import { randomAvatar } from '../components/Art'
import { useAuth } from '../lib/auth'

/** Никнейм, город и интересы — шаг 5 регистрации (ЧТЗ 5.1.1). */
export default function Interests () {
  const navigate = useNavigate()
  const { createProfile, profile, ready, session } = useAuth()
  const [nickname, setNickname] = useState('')
  const [city, setCity] = useState('')
  const [chosen, setChosen] = useState<string[]>([])
  const [avatar, setAvatar] = useState(randomAvatar)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit () {
    setBusy(true)
    try {
      await createProfile({
        nickname: nickname.trim(), city: city.trim(), interests: chosen, avatarUrl: avatar,
      })
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

  // Профиль уже заполнен — например, страницу просто перезагрузили.
  if (ready && profile) return <Navigate to="/" replace />

  return (
    <div className="flex h-full flex-col gap-6 px-6 pb-8 pt-10">
      <div className="space-y-2">
        <h1 className="text-[28px]">Создание профиля</h1>
        <p className="text-[17px] text-white/75">Расскажите о себе — так подберём ивенты точнее.</p>
      </div>

      <div className="space-y-5">
        <AvatarPicker
          name={nickname} value={avatar} userId={session?.user.id} onChange={setAvatar}
        />
        <NicknameField value={nickname} onChange={(value) => { setNickname(value); setError('') }} />
        <CityField value={city} onChange={setCity} />
        <InterestsField value={chosen} onChange={setChosen} />
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
