import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PlainScreen } from '../components/Layout'
import { Avatar } from '../components/ui'
import { Failed, Loading } from '../components/States'
import {
  BackIcon, CameraIcon, ChevronIcon, GeoTaskIcon, PinIcon, QuizIcon, SparkIcon,
} from '../components/icons'
import type { QuestTask } from '../data/demo'
import { checkIn, completeTask, getEvent, getQuest } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { useAuth } from '../lib/auth'
import { useCountUp } from '../lib/useCountUp'
import Quiz from './Quiz'
import GeoTask from './GeoTask'
import PhotoTask from './PhotoTask'

const TASK_ICON = {
  photo: CameraIcon,
  geolocation: GeoTaskIcon,
  quiz: QuizIcon,
}

/** Прогресс квеста: чек-ин, заработанные QP, задания и таблица участников. */
export default function Quest () {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, refreshProfile } = useAuth()
  const [quizTask, setQuizTask] = useState<QuestTask | null>(null)
  const [geoTask, setGeoTask] = useState<QuestTask | null>(null)
  const [photoTask, setPhotoTask] = useState<QuestTask | null>(null)
  const [busy, setBusy] = useState(false)

  const { data: event } = useAsync(() => getEvent(id!, profile?.id ?? null), [id, profile?.id])
  const { data: state, error, loading, reload } = useAsync(
    () => getQuest(id!, profile?.id ?? null), [id, profile?.id],
  )

  const myId = profile?.id ?? ''
  const earned = state?.earned[myId] ?? 0
  const shownEarned = useCountUp(earned)

  if (loading) return <PlainScreen title="Задания"><Loading /></PlainScreen>
  if (error) return <PlainScreen title="Задания"><Failed message={error} onRetry={reload} /></PlainScreen>

  if (!state?.quest) {
    return (
      <PlainScreen title="Квест ещё не запущен">
        <p className="px-6 py-10 text-center text-[17px] text-muted">
          Организатор запустит его после начала ивента.
        </p>
      </PlainScreen>
    )
  }

  const tasks = state.quest.tasks
  const checkedIn = event?.participants.find((person) => person.id === myId)?.checkedIn ?? false

  const board = (event?.participants ?? [])
    .map((person) => ({ ...person, qpEarned: state.earned[person.id] ?? 0 }))
    .sort((a, b) => b.qpEarned - a.qpEarned)

  const myPlace = Math.max(1, board.findIndex((person) => person.id === myId) + 1)

  async function finish (
    task: QuestTask, qpAwarded: number, answer?: unknown, photoUrl?: string,
  ) {
    if (!profile || !id) return
    setBusy(true)
    try {
      await completeTask({
        eventId: id, task, userId: profile.id, nickname: profile.nickname,
        qpAwarded, answer, photoUrl,
      })
      await refreshProfile()
      reload()
    } finally {
      setBusy(false)
      setQuizTask(null)
    }
  }

  async function markPresence () {
    if (!profile || !id || checkedIn) return
    setBusy(true)
    try {
      await checkIn(id, profile.id, profile.nickname)
      await refreshProfile()
      reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <PlainScreen
      title={event?.title ?? 'Задания'}
      left={<button onClick={() => navigate(-1)} aria-label="Назад"><BackIcon className="size-7" /></button>}
    >
      <div className="space-y-6 px-4 pb-10 pt-2">
        <button
          onClick={markPresence} disabled={busy || checkedIn}
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
          <div className="min-w-0 flex-1">
            <p className="whitespace-nowrap text-[17px] font-bold">Заработанные очки</p>
            <p className="whitespace-nowrap text-[40px] font-extrabold leading-tight text-accent
                          tabular-nums">
              {shownEarned} QP
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="whitespace-nowrap text-[18px] font-bold">
              #{myPlace} из {board.length}
            </p>
            <p className="whitespace-nowrap text-[13px] font-semibold">в таблице лидеров</p>
          </div>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[24px]">Твои задания</h2>
            {state.quest.source === 'ai' && (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent/20
                               px-3 py-1.5 text-[13px] font-semibold text-accent-soft">
                <SparkIcon className="size-3.5" />
                придумано ИИ
              </span>
            )}
          </div>
          {tasks.map((task) => {
            const Icon = TASK_ICON[task.type]
            return (
              <button
                key={task.id} disabled={busy || task.completed}
                onClick={() => {
                  if (task.type === 'quiz') return setQuizTask(task)
                  if (task.type === 'geolocation') return setGeoTask(task)
                  if (task.type === 'photo') return setPhotoTask(task)
                  finish(task, task.qpReward)
                }}
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
                  {/*
                    У квиза награда зависит от числа верных ответов, поэтому
                    до выполнения показываем потолок, а после — начисленное.
                  */}
                  <p className={`whitespace-nowrap text-[16px] font-semibold ${
                    task.completed ? 'animate-pop text-success' : 'text-white'}`}>
                    {task.completed
                      ? `+${task.awardedQp ?? task.qpReward} QP`
                      : task.type === 'quiz'
                        ? `до +${task.qpReward} QP`
                        : `+${task.qpReward} QP`}
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
            const mine = person.id === myId
            return (
              <div
                key={person.id}
                className={`flex items-center gap-3 rounded-2xl bg-surface-3 p-3 ${
                  mine ? 'ring-1 ring-accent' : ''}`}
              >
                <Avatar name={person.nickname} src={person.avatarUrl} size={40} />
                <span className="min-w-0 flex-1 truncate text-[18px]">
                  {person.nickname}{mine ? ' (ты)' : ''}
                </span>
                <span className="shrink-0 text-[18px] font-bold">{person.qpEarned} QP</span>
              </div>
            )
          })}
        </section>
      </div>

      {geoTask && event && (
        <GeoTask
          task={geoTask}
          target={[
            geoTask.params?.target_latitude ?? event.lat,
            geoTask.params?.target_longitude ?? event.lng,
          ]}
          onClose={() => setGeoTask(null)}
          onDone={() => { finish(geoTask, geoTask.qpReward); setGeoTask(null) }}
        />
      )}

      {photoTask && profile && (
        <PhotoTask
          task={photoTask}
          userId={profile.id}
          onClose={() => setPhotoTask(null)}
          onDone={(photoUrl) => {
            finish(photoTask, photoTask.qpReward, undefined, photoUrl)
            setPhotoTask(null)
          }}
        />
      )}

      {quizTask && (
        <Quiz
          task={quizTask}
          onClose={() => setQuizTask(null)}
          onDone={(correct) => finish(quizTask, correct * 5, { correct })}
        />
      )}
    </PlainScreen>
  )
}
