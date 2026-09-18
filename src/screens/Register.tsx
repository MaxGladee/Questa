import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Field, PasswordField } from '../components/ui'
import { useAuth } from '../lib/auth'

export default function Register () {
  const navigate = useNavigate()
  const { signUp } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Правила из ЧТЗ 5.1.1: корректный e-mail, пароль не короче восьми символов,
  // подтверждение должно совпадать.
  async function submit () {
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Проверьте адрес почты')
    if (password.length < 8) return setError('Пароль — минимум 8 символов')
    if (password !== repeat) return setError('Пароли не совпадают')

    setBusy(true)
    try {
      const { needsCode } = await signUp(email.trim(), password)
      navigate(needsCode ? '/confirm' : '/interests', { state: { email: email.trim() } })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось зарегистрироваться')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col px-6 pb-8">
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <img src={`${import.meta.env.BASE_URL}art/logo.png`} alt="" width={512} height={512} className="size-28" />
        <span className="text-[34px] font-extrabold">Questa</span>
      </div>

      <div className="space-y-4">
        <h1 className="text-[28px]">Регистрация</h1>

        <Field
          type="email" inputMode="email" autoComplete="email" placeholder="E-mail"
          value={email} onChange={(e) => { setEmail(e.target.value); setError('') }}
        />
        <PasswordField
          autoComplete="new-password" placeholder="Пароль"
          value={password} onChange={(e) => { setPassword(e.target.value); setError('') }}
        />
        <PasswordField
          autoComplete="new-password" placeholder="Повторите пароль"
          value={repeat} onChange={(e) => { setRepeat(e.target.value); setError('') }}
        />

        {error && <p className="px-2 text-[15px] text-red-400">{error}</p>}

        <Button onClick={submit} disabled={busy} className="mt-2">
          {busy ? 'Создаём аккаунт…' : 'Зарегистрироваться'}
        </Button>

        <p className="text-center text-[16px] text-white/80">
          Уже зарегистрирован? <Link to="/login" className="font-semibold text-accent">Войти</Link>
        </p>
      </div>
    </div>
  )
}
