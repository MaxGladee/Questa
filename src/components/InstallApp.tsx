import { useState } from 'react'
import { CloseIcon, PhoneIcon, ShareIcon } from './icons'
import { useToast } from './Toast'
import { useInstall } from '../lib/install'

// Ключ в памяти браузера: от кого предложение уже отмахнулись. Отказ
// запоминается навсегда — на второй раз это уже не подсказка, а уговоры.
const HIDDEN = 'questa.install.hidden'

function hidden (): boolean {
  try {
    return localStorage.getItem(HIDDEN) === '1'
  } catch {
    // Память браузера может быть закрыта (режим инкогнито, запрет
    // хранилища). Тогда просто показываем предложение как обычно.
    return false
  }
}

function hide () {
  try {
    localStorage.setItem(HIDDEN, '1')
  } catch { /* см. выше */ }
}

/** Подсказка для iPhone: там кнопки нет, есть пункт в окне «Поделиться». */
function AppleSteps () {
  return (
    <p className="flex items-start gap-2 text-[15px] leading-snug text-muted">
      <ShareIcon className="mt-0.5 size-4 shrink-0" />
      <span>
        Откройте меню «Поделиться» внизу браузера и выберите
        «На экран „Домой“».
      </span>
    </p>
  )
}

/**
 * Установка в настройках — полная карточка с объяснением.
 *
 * Показывается только тогда, когда это имеет смысл: браузер сказал, что
 * готов поставить приложение, или это iPhone, где так или иначе придётся
 * объяснять словами. Если Questa уже открыта с домашнего экрана, карточки
 * нет вовсе.
 */
export function InstallCard () {
  const { ready, installed, apple, install } = useInstall()
  const toast = useToast()

  if (installed || (!ready && !apple)) return null

  const run = async () => {
    const outcome = await install()
    if (outcome === 'installed') toast('Questa теперь на домашнем экране')
  }

  return (
    <div className="space-y-3 rounded-card bg-surface-2 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/20
                         text-accent-soft">
          <PhoneIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold">Поставить на домашний экран</p>
          <p className="mt-1 text-[15px] leading-snug text-muted">
            Открывается как обычное приложение — без адресной строки, с иконкой
            и без повторного входа. Место почти не занимает.
          </p>
        </div>
      </div>

      {ready
        ? (
          <button
            onClick={run}
            className="w-full rounded-full bg-accent py-3 text-[16px] font-semibold
                       transition active:scale-[0.99]"
          >
            Установить
          </button>
        )
        : <AppleSteps />}
    </div>
  )
}

/**
 * Та же установка, но на главной и одной строкой.
 *
 * В настройки за этим никто не пойдёт: чтобы туда заглянуть, надо уже
 * знать, что там что-то есть. Поэтому предложение один раз показывается на
 * виду — и исчезает навсегда, как только его закрыли или приняли.
 *
 * На iPhone здесь ничего не показывается: инструкция в три шага на главной
 * — это уже не подсказка, а реклама. Для него карточка в настройках.
 */
export function InstallBanner () {
  const { ready, installed, install } = useInstall()
  const [gone, setGone] = useState(hidden)

  if (installed || !ready || gone) return null

  const dismiss = () => {
    hide()
    setGone(true)
  }

  const run = async () => {
    const outcome = await install()
    // Отказ в окне браузера — тоже ответ: второй раз не спрашиваем.
    if (outcome !== 'unavailable') dismiss()
  }

  return (
    <div className="rounded-card bg-surface p-3.5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/20
                         text-accent-soft">
          <PhoneIcon className="size-5" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold">Questa на домашнем экране</span>
          <span className="block text-[14px] leading-snug text-muted">
            Открывается как приложение и помнит вход
          </span>
        </span>

        <button onClick={dismiss} aria-label="Скрыть" className="-mt-0.5 shrink-0 text-muted">
          <CloseIcon className="size-5" />
        </button>
      </div>

      <button
        onClick={run}
        className="mt-3 w-full rounded-full bg-accent py-2.5 text-[15px] font-semibold
                   transition active:scale-[0.99]"
      >
        Поставить
      </button>
    </div>
  )
}
