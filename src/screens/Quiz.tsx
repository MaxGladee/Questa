import { useEffect, useState } from 'react'
import { Button } from '../components/ui'
import { Loading } from '../components/States'
import { CloseIcon } from '../components/icons'
import { listQuizAnswers, saveQuizAnswer } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { QuestTask } from '../data/demo'

/**
 * Квиз (ЧТЗ 5.11.3). Общее задание: вопрос один и тот же у всех участников,
 * ответы засчитываются каждому отдельно, по 5 QP за верный (ЧТЗ 5.12.1).
 *
 * Ответ показывается сразу. Узнать в конце, что три из шести где-то не так,
 * бесполезно и обидно: половина удовольствия от квиза — тут же увидеть,
 * угадал ты или нет, и поспорить об этом с компанией.
 *
 * Но именно из-за этого квиз нельзя было начинать заново: ответил, увидел
 * подсвеченный верный вариант, вышел, зашёл — и те же вопросы с уже
 * известными ответами. Поэтому каждый ответ сразу уходит в базу, а экран
 * при открытии продолжает с первого вопроса, на который ещё не отвечали.
 * Переотвечать нельзя: повторную строку база не примет.
 */
export default function Quiz (
  { task, onClose, onDone }: { task: QuestTask; onClose: () => void; onDone: (correct: number) => void },
) {
  const { profile } = useAuth()
  const questions = task.questions ?? []

  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [correct, setCorrect] = useState(0)
  const [ready, setReady] = useState(false)

  // Что уже отвечено — узнаём у базы, а не начинаем с нуля.
  useEffect(() => {
    if (!profile) return

    let alive = true
    listQuizAnswers(task.id, profile.id)
      .then((answers) => {
        if (!alive) return

        const given = new Set(answers.map((item) => item.index))
        let next = 0
        while (next < questions.length && given.has(next)) next += 1

        setIndex(next)
        setCorrect(answers.filter((item) => item.correct).length)
        setReady(true)
      })
      .catch(() => { if (alive) setReady(true) })

    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, profile?.id])

  const question = questions[index]
  const finished = index >= questions.length

  function pick (option: number) {
    if (picked !== null) return                // ответ уже дан, менять нельзя

    const right = option === question.correctIndex
    setPicked(option)
    if (right) setCorrect((n) => n + 1)

    // Ответ уходит в базу сразу, а не в конце: иначе выход на середине
    // возвращал бы человека к началу, и квиз можно было бы переигрывать.
    if (profile) saveQuizAnswer(task.id, profile.id, index, right).catch(() => {})
  }

  function next () {
    if (picked === null) return
    setPicked(null)
    setIndex((n) => n + 1)
  }

  /** Цвет варианта после ответа: свой неверный — красный, верный — зелёный. */
  function tone (option: number): string {
    if (picked === null) return 'bg-surface-2'
    if (option === question.correctIndex) return 'bg-success/25 ring-1 ring-success'
    if (option === picked) return 'bg-red-500/20 ring-1 ring-red-400'
    return 'bg-surface-2 opacity-50'
  }

  const answered = picked !== null
  const right = answered && picked === question?.correctIndex

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-bg px-5 pb-[calc(2rem+var(--safe-bottom))] pt-4">
      <header className="flex items-center justify-between">
        <h2 className="text-[22px]">{task.title}</h2>
        <button onClick={onClose} aria-label="Закрыть"><CloseIcon className="size-7" /></button>
      </header>

      {!ready && <Loading label="Смотрим, на чём вы остановились…" />}

      {ready && finished ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-[22px] font-semibold">Квиз пройден</p>
          <p className="animate-pop text-[52px] font-extrabold leading-none text-accent">
            +{correct * 5} QP
          </p>
          <p className="text-[18px] text-white/80">
            Верных ответов: {correct} из {questions.length}
          </p>
          <Button className="mt-4" onClick={() => onDone(correct)}>Забрать награду</Button>
        </div>
      ) : ready ? (
        <>
          <div className="mt-6 flex items-center justify-between gap-3">
            <p className="text-[15px] text-muted">
              Вопрос {index + 1} из {questions.length}
            </p>
            <p className="text-[15px] text-muted">Верных: {correct}</p>
          </div>

          {/* Полоса прогресса заменяет счёт «сколько ещё осталось» в уме. */}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${((index + (answered ? 1 : 0)) / questions.length) * 100}%` }}
            />
          </div>

          <p className="mt-4 text-[24px] font-bold leading-snug">{question.question}</p>

          <div className="mt-6 space-y-3">
            {question.options.map((option, optionIndex) => (
              <button
                key={optionIndex} onClick={() => pick(optionIndex)} disabled={answered}
                className={`w-full rounded-[20px] px-5 py-4 text-left text-[18px] transition
                            ${tone(optionIndex)}`}
              >
                {option}
              </button>
            ))}
          </div>

          <div className="mt-auto space-y-3">
            {answered && (
              <p className={`text-center text-[17px] font-semibold ${
                right ? 'text-success' : 'text-red-400'}`}>
                {right ? 'Верно! +5 QP' : 'Мимо — верный ответ подсвечен'}
              </p>
            )}
            <Button disabled={!answered} onClick={next}>
              {index === questions.length - 1 ? 'Завершить' : 'Дальше'}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  )
}
