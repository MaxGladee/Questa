import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Field } from '../components/ui'
import { useAuth } from '../lib/auth'

export default function Login () {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit () {
    setBusy(true)
    try {
      await signIn(email.trim(), password)
      navigate('/')
    } catch {
      setError('Неверная почта или пароль')
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
        <h1 className="text-[28px]">Авторизация</h1>

        <Field
          type="email" inputMode="email" autoComplete="email" placeholder="E-mail"
          value={email} onChange={(e) => { setEmail(e.target.value); setError('') }}
        />
        <Field
          type="password" autoComplete="current-password" placeholder="Пароль"
          value={password} onChange={(e) => { setPassword(e.target.value); setError('') }}
        />

        {error && <p className="px-2 text-[15px] text-red-400">{error}</p>}

        <Button onClick={submit} disabled={busy}>{busy ? 'Входим…' : 'Войти'}</Button>

        <p className="text-center text-[16px] text-white/80">
          Нет аккаунта? <Link to="/register" className="font-semibold text-accent">Зарегистрироваться</Link>
        </p>
      </div>
    </div>
  )
}
