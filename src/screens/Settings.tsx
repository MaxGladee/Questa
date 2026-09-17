import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlainScreen } from '../components/Layout'
import { Button, Field, Switch } from '../components/ui'
import { AvatarPicker, NicknameField } from '../components/ProfileFields'
import { InterestsField, CityField } from '../components/ProfilePickers'
import { Loading } from '../components/States'
import { BackIcon } from '../components/icons'
import { useAuth } from '../lib/auth'

// Типы уведомлений из таблицы в ЧТЗ 5.16. Выбор хранится на самом устройстве:
// это настройка того, что показывать здесь, а не общая для всех сессий.
const NOTIFICATIONS = [
  { key: 'nearby', label: 'Новые ивенты рядом' },
  { key: 'join', label: 'Заявки в мои ивенты' },
  { key: 'group', label: 'Группа набрана' },
  { key: 'chat', label: 'Сообщения в чате' },
  { key: 'start', label: 'Напоминание о начале' },
  { key: 'quest', label: 'Новые задания' },
] as const

type NotificationKey = (typeof NOTIFICATIONS)[number]['key']

function loadNotificationSettings (): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem('questa:notifications') ?? '{}')
  } catch {
    return {}
  }
}

function Section ({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[20px]">{title}</h2>
      {children}
    </section>
  )
}

/** Настройки: профиль, пароль, уведомления, выход и удаление аккаунта (ЧТЗ 5.15). */
export default function Settings () {
  const navigate = useNavigate()
  const { profile, updateProfile, changePassword, deleteAccount, signOut } = useAuth()

  const [nickname, setNickname] = useState('')
  const [city, setCity] = useState('')
  const [interests, setInterests] = useState<string[]>([])
  const [avatar, setAvatar] = useState<string | undefined>()
  const [saved, setSaved] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [passwordNote, setPasswordNote] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  const [notifications, setNotifications] = useState<Record<string, boolean>>(loadNotificationSettings)
  const [confirmingDelete, setConfirmingDelete] = useState(0)

  useEffect(() => {
    if (!profile) return
    setNickname(profile.nickname)
    setCity(profile.city)
    setInterests(profile.interests)
    setAvatar(profile.avatarUrl)
  }, [profile])

  if (!profile) return <PlainScreen title="Настройки"><Loading /></PlainScreen>

  const changed = nickname !== profile.nickname
    || city !== profile.city
    || avatar !== profile.avatarUrl
    || interests.length !== profile.interests.length
    || interests.some((code) => !profile.interests.includes(code))

  async function saveProfile () {
    if (nickname.trim().length < 3) return setProfileError('Никнейм — от 3 до 20 символов')
    if (!city.trim()) return setProfileError('Укажите город')
    if (interests.length === 0) return setProfileError('Отметьте хотя бы один интерес')

    setSavingProfile(true)
    setProfileError('')
    try {
      await updateProfile({
        nickname: nickname.trim(), city: city.trim(), interests, avatarUrl: avatar,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ''
      setProfileError(message.includes('duplicate') || message.includes('unique')
        ? 'Такой никнейм уже занят'
        : 'Не удалось сохранить')
    } finally {
      setSavingProfile(false)
    }
  }

  async function savePassword () {
    if (next.length < 8) return setPasswordNote('Новый пароль — минимум 8 символов')

    setSavingPassword(true)
    try {
      await changePassword(current, next)
      setPasswordNote('Пароль изменён')
      setCurrent('')
      setNext('')
    } catch (cause) {
      setPasswordNote(cause instanceof Error ? cause.message : 'Не удалось сменить пароль')
    } finally {
      setSavingPassword(false)
    }
  }

  function switchNotification (key: NotificationKey, value: boolean) {
    const updated = { ...notifications, [key]: value }
    setNotifications(updated)
    try {
      localStorage.setItem('questa:notifications', JSON.stringify(updated))
    } catch {
      // Приватный режим браузера может запрещать запись — не повод падать.
    }
  }

  return (
    <PlainScreen
      title="Настройки"
      left={<button onClick={() => navigate(-1)} aria-label="Назад"><BackIcon className="size-7" /></button>}
    >
      <div className="space-y-8 px-5 pb-12 pt-2">
        <Section title="Профиль">
          <AvatarPicker name={nickname} value={avatar} userId={profile.id} onChange={setAvatar} />
          <NicknameField
            value={nickname}
            onChange={(value) => { setNickname(value); setProfileError('') }}
          />
          <CityField value={city} onChange={(value) => { setCity(value); setProfileError('') }} />
          <InterestsField
            value={interests}
            onChange={(value) => { setInterests(value); setProfileError('') }}
          />

          {profileError && <p className="text-[15px] text-red-400">{profileError}</p>}
          {saved && <p className="text-[15px] text-success">Сохранено</p>}

          <Button disabled={!changed || savingProfile} onClick={saveProfile}>
            {savingProfile ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </Section>

        <Section title="Пароль">
          <Field
            type="password" autoComplete="current-password" placeholder="Текущий пароль"
            value={current} onChange={(e) => { setCurrent(e.target.value); setPasswordNote('') }}
          />
          <Field
            type="password" autoComplete="new-password" placeholder="Новый пароль"
            value={next} onChange={(e) => { setNext(e.target.value); setPasswordNote('') }}
          />

          {passwordNote && (
            <p className={`text-[15px] ${
              passwordNote === 'Пароль изменён' ? 'text-success' : 'text-red-400'}`}>
              {passwordNote}
            </p>
          )}

          <Button
            variant="ghost" disabled={savingPassword || !current || !next}
            onClick={savePassword}
          >
            {savingPassword ? 'Меняем…' : 'Сменить пароль'}
          </Button>
        </Section>

        <Section title="Уведомления">
          <div className="divide-y divide-white/10 overflow-hidden rounded-card bg-surface-2">
            {NOTIFICATIONS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-3 p-4">
                <span className="min-w-0 flex-1 text-[17px]">{label}</span>
                <Switch
                  label={label}
                  checked={notifications[key] ?? true}
                  onChange={(value) => switchNotification(key, value)}
                />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Аккаунт">
          <Button variant="ghost" onClick={() => signOut().then(() => navigate('/start'))}>
            Выйти
          </Button>

          {/* Двойное подтверждение — требование ЧТЗ 5.15. */}
          {confirmingDelete === 0 ? (
            <button
              onClick={() => setConfirmingDelete(1)}
              className="w-full py-3 text-center text-[17px] text-red-400"
            >
              Удалить аккаунт
            </button>
          ) : (
            <div className="space-y-3 rounded-card bg-surface-2 p-4">
              <p className="text-[16px] leading-snug">
                {confirmingDelete === 1
                  ? 'Аккаунт и история участия будут удалены. Это нельзя отменить.'
                  : 'Точно удалить? Нажмите ещё раз, чтобы подтвердить.'}
              </p>
              <button
                onClick={() => confirmingDelete === 1
                  ? setConfirmingDelete(2)
                  : deleteAccount().then(() => navigate('/start'))}
                className="w-full rounded-[22px] bg-red-500/20 py-3.5 text-[17px] font-semibold text-red-400"
              >
                {confirmingDelete === 1 ? 'Да, удалить аккаунт' : 'Подтверждаю удаление'}
              </button>
              <Button variant="quiet" onClick={() => setConfirmingDelete(0)}>Отмена</Button>
            </div>
          )}
        </Section>
      </div>
    </PlainScreen>
  )
}
