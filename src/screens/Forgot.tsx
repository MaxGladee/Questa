import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Field } from '../components/ui'
import { BackIcon } from '../components/icons'
import { useAuth } from '../lib/auth'

/**
 * Восстановление пароля (ЧТЗ 5.1.2).
 *
 * Письмо уходит на почту со ссылкой, которая возвращает человека в
 * приложение уже с действующей сессией — там он и задаёт новый пароль.
 * Текущий при этом не нужен: в том и смысл.
 */
export default function Forgot () {
  const navigate = useNavigate()
  const { sendPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit () {
    if (!email.trim()) return
    setBusy(true)
    setError('')
    try {
      await sendPasswordReset(email)
      setSent(true)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Письмо не отправилось')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col px-6 pb-8 pt-4">
      <button onClick={() => navigate(-1)} aria-label="Назад" className="self-start py-2">
        <BackIcon className="size-7" />
      </button>

      <div className="flex flex-1 flex-col justify-center gap-4">
        <h1 className="text-[28px]">Забыли пароль?</h1>

        {sent ? (
          <>
            <p className="text-[17px] leading-snug text-white/80">
              Письмо ушло на {email.trim()}. Откройте ссылку из него на этом же
              устройстве — приложение попросит задать новый пароль.
            </p>
            <p className="text-[15px] leading-snug text-muted">
              Письма нет? Проверьте папку «Спам» и попробуйте ещё раз через несколько минут.
            </p>
            <Button variant="ghost" onClick={() => setSent(false)}>Отправить ещё раз</Button>
          </>
        ) : (
          <>
            <p className="text-[17px] leading-snug text-white/80">
              Пришлём ссылку на почту, по которой вы регистрировались.
            </p>

            <Field
              type="email" inputMode="email" autoComplete="email" placeholder="E-mail"
              value={email} onChange={(event) => { setEmail(event.target.value); setError('') }}
            />

            {error && <p className="px-2 text-[15px] text-red-400">{error}</p>}

            <Button onClick={submit} disabled={busy || !email.trim()}>
              {busy ? 'Отправляем…' : 'Прислать ссылку'}
            </Button>
          </>
        )}

        <p className="text-center text-[16px] text-white/80">
          Вспомнили? <Link to="/login" className="font-semibold text-accent">Войти</Link>
        </p>
      </div>
    </div>
  )
}
