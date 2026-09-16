import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Field } from '../components/ui'

export default function Login () {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  return (
    <div className="flex h-full flex-col px-6 pb-8">
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <img src={`${import.meta.env.BASE_URL}art/logo.png`} alt="" width={112} height={124} className="w-28" />
        <span className="text-[34px] font-extrabold">Questa</span>
      </div>

      <div className="space-y-4">
        <h1 className="text-[28px]">Авторизация</h1>

        <Field
          type="email" inputMode="email" autoComplete="email" placeholder="E-mail"
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          type="password" autoComplete="current-password" placeholder="Пароль"
          value={password} onChange={(e) => setPassword(e.target.value)}
        />

        <button className="w-full py-1 text-right text-[15px] text-muted">Забыли пароль?</button>

        <Button onClick={() => navigate('/')}>Войти</Button>

        <p className="text-center text-[16px] text-white/80">
          Нет аккаунта? <Link to="/register" className="font-semibold text-accent">Зарегистрироваться</Link>
        </p>
      </div>
    </div>
  )
}
