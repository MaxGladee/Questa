import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PlainScreen } from '../components/Layout'
import { Avatar } from '../components/ui'
import {
  BackIcon, CameraIcon, ChevronIcon, GeoTaskIcon, PinIcon, QuizIcon,
} from '../components/icons'
import { findEvent, type QuestTask } from '../data/demo'
import Quiz from './Quiz'

const TASK_ICON = {
  photo: CameraIcon,
  geolocation: GeoTaskIcon,
  quiz: QuizIcon,
}

/** Прогресс квеста: чек-ин, заработанные QP, задания и таблица участников. */
export default function Quest () {
  const { id } = useParams()
  const navigate = useNavigate()
  const event = findEvent(id)
  const [tasks, setTasks] = useState<QuestTask[]>(() => event?.quest?.tasks ?? [])
  const [quizTask, setQuizTask] = useState<QuestTask | null>(null)
  const [checkedIn, setCheckedIn] = useState(true)

  if (!event || !event.quest) {
    return (
      <PlainScreen title="Квест ещё не запущен">
        <p className="px-6 py-10 text-center text-[17px] text-muted">
          Организатор запустит его после начала ивента.
        </p>
      </PlainScreen>
    )
  }

  const earned = tasks.filter((task) => task.completed)
    .reduce((sum, task) => sum + task.qpReward, 0)

  const board = [...event.participants]
    .map((person) => person.id === 'me' ? { ...person, qpEarned: earned } : person)
    .sort((a, b) => b.qpEarned - a.qpEarned)

  const myPlace = board.findIndex((person) => person.id === 'me') + 1

  function complete (task: QuestTask) {
    if (task.completed) return
    if (task.type === 'quiz') return setQuizTask(task)
    setTasks((list) => list.map((t) => t.id === task.id ? { ...t, completed: true } : t))
  }

  return (
    <PlainScreen
      title={event.title}
      left={<button onClick={() => navigate(-1)} aria-label="Назад"><BackIcon className="size-7" /></button>}
    >
      <div className="space-y-6 px-4 pb-10 pt-2">
        <button
          onClick={() => setCheckedIn(true)}
          className="flex w-full items-center gap-3 rounded-card bg-surface-3 p-4 text-left"
        >
          <PinIcon className={`size-9 ${checkedIn ? 'text-success' : 'text-muted'}`} />
          <div>
            <p className="text-[19px] font-semibold text-muted">
              {checkedIn ? 'Присутствие отмечено!' : 'Отметить присутствие'}
            </p>
            <p className="text-[17px] text-muted">
              <span className="font-bold text-success">+50 XP</span> за check-in
            </p>
          </div>
        </button>

        <div className="flex items-end justify-between rounded-card bg-surface-2 p-5">
          <div className="min-w-0">
            <p className="whitespace-nowrap text-[18px] font-bold">Заработанные очки</p>
            <p className="text-[44px] font-extrabold leading-tight text-accent">{earned} QP</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="whitespace-nowrap text-[20px] font-bold">#{myPlace} из {board.length}</p>
            <p className="whitespace-nowrap text-[14px] font-semibold">в таблице лидеров</p>
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="text-[24px]">Твои задания</h2>
          {tasks.map((task) => {
            const Icon = TASK_ICON[task.type]
            return (
              <button
                key={task.id} onClick={() => complete(task)}
                className={`flex w-full items-center gap-4 rounded-card p-4 text-left transition
                            active:scale-[0.99] ${
                  task.completed ? 'bg-surface-3' : 'bg-accent-2'}`}
              >
                <Icon className="size-8 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[20px] font-bold">{task.title}</p>
                  <p className="truncate text-[16px] text-white/85">{task.description}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-[16px] font-semibold ${
                    task.completed ? 'text-success' : 'text-white'}`}>
                    +{task.qpReward} QP
                  </p>
                  <ChevronIcon className="ml-auto mt-1 size-5" />
                </div>
              </button>
            )
          })}
        </section>

        <section className="space-y-2">
          <h2 className="text-[24px]">Таблица участников</h2>
          {board.map((person) => {
            const mine = person.id === 'me'
            return (
              <div
                key={person.id}
                className={`flex items-center gap-3 rounded-2xl bg-surface-3 p-3 ${
                  mine ? 'ring-1 ring-accent' : ''}`}
              >
                <Avatar name={person.nickname} size={40} />
                <span className="min-w-0 flex-1 truncate text-[18px]">
                  {person.nickname}{mine ? ' (ты)' : ''}
                </span>
                <span className="shrink-0 text-[18px] font-bold">{person.qpEarned} QP</span>
              </div>
            )
          })}
        </section>
      </div>

      {quizTask && (
        <Quiz
          task={quizTask}
          onClose={() => setQuizTask(null)}
          onDone={() => {
            setTasks((list) => list.map((t) => t.id === quizTask.id ? { ...t, completed: true } : t))
            setQuizTask(null)
          }}
        />
      )}
    </PlainScreen>
  )
}
