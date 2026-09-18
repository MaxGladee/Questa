import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/** Экран приветствия — первый в онбординге (ЧТЗ 5.2). */
export default function Splash () {
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setTimeout(() => navigate('/onboarding'), 1600)
    return () => clearTimeout(timer)
  }, [navigate])

  return (
    <button
      onClick={() => navigate('/onboarding')}
      className="flex h-full w-full flex-col items-center justify-center gap-6"
    >
      <img
        src={`${import.meta.env.BASE_URL}art/logo.png`}
        alt="Questa" width={512} height={512}
        className="size-32 animate-[pulse_2.5s_ease-in-out_infinite]"
      />
      <span className="text-[40px] font-extrabold tracking-tight">Questa</span>
    </button>
  )
}
