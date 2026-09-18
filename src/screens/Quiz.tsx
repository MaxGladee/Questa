import { useState } from 'react'
import { Button } from '../components/ui'
import { CloseIcon } from '../components/icons'
import type { QuestTask } from '../data/demo'

/**
 * Квиз (ЧТЗ 5.11.3). Общее задание: вопрос один и тот же у всех участников,
 * ответы засчитываются каждому отдельно, по 5 QP за верный (ЧТЗ 5.12.1).
 *
 * Ответ показывается сразу. Узнать в конце, что три из шести где-то не так,
 * бесполезно и обидно: половина удовольствия от квиза — тут же увидеть,
 * угадал ты или нет, и поспорить об этом с компанией.
 */
export default function Quiz (
  { task, onClose, onDone }: { task: QuestTask; onClose: () => void; onDone: (correct: number) => void },
) {
  const questions = task.questions ?? []
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [correct, setCorrect] = useState(0)
  const question = questions[index]
  const finished = index >= questions.length

  function pick (option: number) {
    if (picked !== null) return                // ответ уже дан, менять нельзя
    setPicked(option)
    if (option === question.correctIndex) setCorrect((n) => n + 1)
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
    <div className="absolute inset-0 z-30 flex flex-col bg-bg px-5 pb-8 pt-4">
      <header className="flex items-center justify-between">
        <h2 className="text-[22px]">{task.title}</h2>
        <button onClick={onClose} aria-label="Закрыть"><CloseIcon className="size-7" /></button>
      </header>

      {finished ? (
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
      ) : (
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
      )}
    </div>
  )
}
