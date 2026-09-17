import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui'

// Тексты слайдов заданы в ЧТЗ 5.2.
const SLIDES = [
  {
    art: 'onboarding-1.png',
    title: 'Находи ивенты рядом',
    text: 'Пробежки, бары, кино, прогулки — находи людей с похожими интересами прямо на карте',
  },
  {
    art: 'onboarding-2.png',
    title: 'Каждая встреча — это квест',
    text: 'Каждый ивент превращается в небольшой квест с тремя заданиями для всей группы',
  },
  {
    art: 'onboarding-3.png',
    title: 'Зарабатывай QuestaPoints',
    text: 'Выполняй задания, получай QP и опыт, повышай уровень и собирай стрик ежедневных входов',
  },
]

export default function Onboarding () {
  const [step, setStep] = useState(0)
  const navigate = useNavigate()
  const slide = SLIDES[step]
  const last = step === SLIDES.length - 1

  const finish = () => navigate('/register')

  return (
    <div className="flex h-full flex-col px-6 pb-8 pt-4">
      <button onClick={finish} className="self-end py-3 text-[17px] text-muted">
        Пропустить
      </button>

      {/*
        Высоты заданы жёстко, а не подстраиваются под содержимое: иначе при
        переключении слайдов картинка и текст прыгают, потому что заголовки
        и описания занимают разное число строк.
      */}
      <div className="flex flex-1 flex-col items-center justify-center gap-7">
        <div className="flex h-[320px] w-full max-w-[320px] items-center justify-center">
          <img
            src={`${import.meta.env.BASE_URL}art/${slide.art}`}
            alt="" width={465} height={488}
            className="max-h-full w-auto rounded-[32px]"
          />
        </div>

        <div className="flex gap-2">
          {SLIDES.map((_, index) => (
            <span
              key={index}
              className={`size-2.5 rounded-full transition ${
                index === step ? 'bg-white' : 'bg-white/30'}`}
            />
          ))}
        </div>

        <div className="flex h-[160px] flex-col items-center gap-3 text-center">
          <h1 className="text-[30px] leading-tight">{slide.title}</h1>
          <p className="text-[17px] leading-snug text-white/75">{slide.text}</p>
        </div>
      </div>

      <Button onClick={() => (last ? finish() : setStep(step + 1))}>
        {last ? 'Вперёд!' : 'Далее'}
      </Button>
    </div>
  )
}
