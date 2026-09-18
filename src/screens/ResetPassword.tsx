import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, PasswordField } from '../components/ui'
import { Loading } from '../components/States'
import { useToast } from '../components/Toast'
import { useAuth } from '../lib/auth'

/** Новый пароль по ссылке из письма (ЧТЗ 5.1.2). */
export default function ResetPassword () {
  const navigate = useNavigate()
  const { ready, session, setNewPassword } = useAuth()
  const toast = useToast()

  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit () {
    if (password.length < 6) return setError('Пароль короче шести символов')
    if (password !== repeat) return setError('Пароли не совпадают')

    setBusy(true)
    setError('')
    try {
      await setNewPassword(password)
      toast('Пароль изменён')
      navigate('/')
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Не удалось сменить пароль')
    } finally {
      setBusy(false)
    }
  }

  // Сессию из ссылки Supabase разбирает при запуске: пока это не
  // закончилось, судить «ссылка устарела» рано.
  if (!ready) return <Loading label="Проверяем ссылку…" />

  return (
    <div className="flex h-full flex-col justify-center gap-4 px-6 pb-8">
      <h1 className="text-[28px]">Новый пароль</h1>

      {session ? (
        <>
          <p className="text-[17px] leading-snug text-white/80">
            Придумайте пароль, с которым будете входить дальше.
          </p>

          <PasswordField
            autoComplete="new-password" placeholder="Новый пароль"
            value={password} onChange={(event) => { setPassword(event.target.value); setError('') }}
          />
          <PasswordField
            autoComplete="new-password" placeholder="Повторите пароль"
            value={repeat} onChange={(event) => { setRepeat(event.target.value); setError('') }}
          />

          {error && <p className="px-2 text-[15px] text-red-400">{error}</p>}

          <Button onClick={submit} disabled={busy}>
            {busy ? 'Сохраняем…' : 'Сохранить пароль'}
          </Button>
        </>
      ) : (
        <>
          {/* Ссылка живёт час: без действующей сессии менять нечего. */}
          <p className="text-[17px] leading-snug text-white/80">
            Ссылка из письма устарела или открыта на другом устройстве. Запросите новую.
          </p>
          <Button onClick={() => navigate('/forgot')}>Запросить ссылку</Button>
        </>
      )}
    </div>
  )
}
