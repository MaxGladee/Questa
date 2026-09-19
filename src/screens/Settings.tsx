import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlainScreen } from '../components/Layout'
import { Button, PasswordField, Switch } from '../components/ui'
import { AvatarPicker, NicknameField } from '../components/ProfileFields'
import { InterestsField, CityField } from '../components/ProfilePickers'
import { Loading } from '../components/States'
import { BackIcon } from '../components/icons'
import { useToast } from '../components/Toast'
import { useAuth } from '../lib/auth'
import { getNotifySettings, setNotifySetting } from '../lib/api'
import { InstallCard } from '../components/InstallApp'

/**
 * Что можно выключить (ЧТЗ 5.16).
 *
 * Здесь только то, чем приложение способно надоесть. О начале встречи, её
 * отмене и завершении сообщается всегда: без этого человек придёт к
 * закрытой двери, и такой «настройки» быть не должно.
 *
 * Прежний список был длиннее и не работал вовсе: выбор лежал в памяти
 * браузера, а рассылку ведёт база и про него не знала.
 */
const NOTIFICATIONS = [
  {
    key: 'reminder',
    label: 'Напоминания о встрече',
    note: 'За сутки, 12 и 6 часов, час и полчаса до начала',
  },
  {
    key: 'chat',
    label: 'Сообщения в чате',
    note: 'Всплывающая плашка, когда пишут в чат встречи',
  },
  {
    key: 'task',
    label: 'Задания участников',
    note: 'Когда кто-то из компании справился с заданием',
  },
  {
    key: 'rate',
    label: 'Просьба оценить',
    note: 'Один раз через несколько часов после встречи',
  },
] as const

type NotificationKey = (typeof NOTIFICATIONS)[number]['key']

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
  const toast = useToast()

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

  const [notifications, setNotifications] = useState<Record<string, boolean>>({})
  const [notifyNote, setNotifyNote] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(0)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Удаление должно либо случиться, либо объяснить, почему нет: молча
  // возвращать человека на тот же экран — худшее из поведений.
  async function removeAccount () {
    setDeleting(true)
    setDeleteError('')
    try {
      const { purged } = await deleteAccount()
      toast(purged
        ? 'Аккаунт удалён'
        : 'Аккаунт отключён: войти в него больше нельзя')
      navigate('/start')
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Не получилось удалить аккаунт')
    } finally {
      setDeleting(false)
    }
  }

  useEffect(() => {
    if (!profile) return
    setNickname(profile.nickname)
    setCity(profile.city)
    setInterests(profile.interests)
    setAvatar(profile.avatarUrl)
  }, [profile])

  // Что человек согласен получать — у профиля, а не в браузере: рассылку
  // ведёт база, и знать об отказе должна она.
  useEffect(() => {
    if (!profile) return

    let alive = true
    getNotifySettings(profile.id)
      .then((saved) => { if (alive) setNotifications(saved) })
      .catch(() => {})

    return () => { alive = false }
  }, [profile?.id])

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

  /**
   * Переключатель отвечает сразу, а запись идёт следом: ждать ответа базы
   * ради галочки незачем. Не записалось — возвращаем как было и говорим
   * об этом, иначе человек уйдёт с экрана в уверенности, что выключил.
   */
  async function switchNotification (key: NotificationKey, value: boolean) {
    if (!profile) return

    const before = notifications
    setNotifications({ ...notifications, [key]: value })
    setNotifyNote('')

    try {
      setNotifications(await setNotifySetting(profile.id, key, value))
    } catch {
      setNotifications(before)
      setNotifyNote('Настройка не сохранилась — попробуйте ещё раз')
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
          <PasswordField
            autoComplete="current-password" placeholder="Текущий пароль"
            value={current} onChange={(e) => { setCurrent(e.target.value); setPasswordNote('') }}
          />
          <PasswordField
            autoComplete="new-password" placeholder="Новый пароль"
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
            {NOTIFICATIONS.map(({ key, label, note }) => (
              <div key={key} className="flex items-center gap-3 p-4">
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px]">{label}</span>
                  <span className="block text-[14px] leading-snug text-muted">{note}</span>
                </span>
                <Switch
                  label={label}
                  checked={notifications[key] ?? true}
                  onChange={(value) => switchNotification(key, value)}
                />
              </div>
            ))}
          </div>

          <p className="text-[14px] leading-snug text-muted">
            {notifyNote || 'О начале, отмене и завершении встречи сообщаем всегда — '
              + 'иначе можно прийти к закрытой двери.'}
          </p>
        </Section>

        {/* Установка стоит перед «Аккаунтом»: это про само приложение, а
            не про человека. Карточка сама исчезает, когда ставить некуда —
            Questa уже на домашнем экране или браузер так не умеет. */}
        <InstallCard />

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
                disabled={deleting}
                onClick={() => confirmingDelete === 1 ? setConfirmingDelete(2) : removeAccount()}
                className="w-full rounded-[22px] bg-red-500/20 py-3.5 text-[17px] font-semibold text-red-400 disabled:opacity-60"
              >
                {deleting
                  ? 'Удаляем…'
                  : confirmingDelete === 1 ? 'Да, удалить аккаунт' : 'Подтверждаю удаление'}
              </button>
              {deleteError && <p className="text-[15px] text-red-400">{deleteError}</p>}
              <Button variant="quiet" onClick={() => setConfirmingDelete(0)}>Отмена</Button>
            </div>
          )}
        </Section>
      </div>
    </PlainScreen>
  )
}
