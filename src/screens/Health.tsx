import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui'
import { db, isLive } from '../lib/supabase'
import { useAuth } from '../lib/auth'

/**
 * Страница самопроверки. Нужна потому, что проверить боевую базу из среды
 * разработки нельзя: доступ к supabase.co оттуда закрыт. Эта страница делает
 * те же проверки изнутри приложения, на устройстве владельца.
 *
 * Открывается по адресу #/health и никуда не ведёт из интерфейса — это
 * служебный экран, не часть приложения.
 */

type Status = 'idle' | 'checking' | 'ok' | 'warn' | 'fail'

interface Check {
  key: string
  title: string
  status: Status
  detail: string
}

const SIGN: Record<Status, string> = {
  idle: '·', checking: '…', ok: '✓', warn: '!', fail: '×',
}

const TONE: Record<Status, string> = {
  idle: 'text-muted',
  checking: 'text-muted',
  ok: 'text-success',
  warn: 'text-yellow-400',
  fail: 'text-red-400',
}

export default function Health () {
  const { session, profile } = useAuth()
  const [checks, setChecks] = useState<Check[]>([])
  const [aiState, setAiState] = useState<Check | null>(null)
  const [aiBusy, setAiBusy] = useState(false)

  useEffect(() => { void runChecks() }, [session?.user.id])

  async function runChecks () {
    const result: Check[] = []
    const add = (key: string, title: string, status: Status, detail: string) =>
      result.push({ key, title, status, detail })

    if (!isLive) {
      add('mode', 'Режим', 'warn', 'Демонстрационный: ключи базы не заданы')
      setChecks(result)
      return
    }

    const client = db()
    const signedIn = Boolean(session)

    // Важно не «есть ли объект сессии», а есть ли живой токен: именно его
    // проверяет сервер, и именно он протухает, пока вкладка лежит открытой.
    const live = (await client.auth.getSession()).data.session
    const expiresIn = live?.expires_at
      ? Math.round((live.expires_at * 1000 - Date.now()) / 60_000)
      : null

    add('session', 'Вход выполнен', signedIn ? 'ok' : 'fail',
        signedIn
          ? `${profile?.nickname ?? 'профиль ещё не заполнен'} · токен `
            + (expiresIn === null ? 'без срока' : `годен ещё ${expiresIn} мин`)
          : 'без входа справочники и функция закрыты правилами доступа — остальные проверки бессмысленны')

    // 1. Связь с базой и справочник интересов.
    //
    // Пустой ответ здесь значит не «таблица пуста», а «правила доступа не
    // отдали строки»: читать справочники разрешено только вошедшим. Поэтому
    // ноль строк без входа — это не диагноз, а отсутствие проверки.
    try {
      const { data, error } = await client.from('interest').select('code, is_event_category')
      if (error) throw error

      add('db', 'База отвечает', 'ok', 'запрос прошёл без ошибки')

      const total = data?.length ?? 0
      const categories = data?.filter((row) => row.is_event_category).length ?? 0

      if (!signedIn && total === 0) {
        add('interests', 'Расширенные интересы', 'idle',
            'не проверялось: без входа справочник закрыт. Но раз запрос прошёл без ошибки, '
            + 'столбец is_event_category уже существует — значит файл 002 выполнен')
      } else {
        add('interests', 'Расширенные интересы',
            total >= 26 ? 'ok' : 'warn',
            total >= 26
              ? `${total} интересов, из них ${categories} — категории ивента`
              : `${total} интересов: файл 002_photos_and_interests.sql ещё не выполнен`)
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      const missingColumn = message.includes('is_event_category')

      add('db', 'База отвечает', missingColumn ? 'ok' : 'fail',
          missingColumn ? 'запрос прошёл, но столбца из файла 002 ещё нет' : message)
      add('interests', 'Расширенные интересы', missingColumn ? 'warn' : 'fail',
          missingColumn
            ? 'файл 002_photos_and_interests.sql ещё не выполнен'
            : 'проверка не выполнялась')
    }

    // 2. Шаблоны квестов — запасной путь, если модель недоступна.
    try {
      const { count, error } = await client
        .from('quest_template').select('id', { count: 'exact', head: true })
      if (error) throw error

      add('templates', 'Шаблоны квестов',
          (count ?? 0) > 0 ? 'ok' : signedIn ? 'warn' : 'idle',
          (count ?? 0) > 0
            ? `${count} шт. — запасной вариант, если ИИ недоступен`
            : signedIn
              ? 'ни одного: setup.sql выполнен не полностью'
              : 'не проверялось: без входа коллекция закрыта')
    } catch {
      add('templates', 'Шаблоны квестов', 'fail', 'не удалось прочитать')
    }

    // 3. Хранилище фотографий.
    try {
      const { error } = await client.storage.from('media').list('', { limit: 1 })
      if (error) throw error
      add('storage', 'Хранилище фотографий', 'ok', 'папка media доступна')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      add('storage', 'Хранилище фотографий',
          message.toLowerCase().includes('not found') ? 'warn' : 'fail',
          message.toLowerCase().includes('not found')
            ? 'папки нет: файл 002_photos_and_interests.sql ещё не выполнен'
            : message)
    }

    // 4. Какие файлы SQL уже выполнены.
    //
    // Проверяется не догадками по косвенным признакам: каждый файл
    // оставляет о себе строку в schema_note.
    const NEEDED = [
      { key: '003_chat_triggers', title: '003 — чат и системные сообщения' },
      { key: '004_results_and_ratings', title: '004 — итоги и оценки' },
      { key: '005_quest_at_start', title: '005 — квест при старте встречи' },
    ]

    try {
      const { data, error } = await client.from('schema_note').select('key')
      if (error) throw error

      const applied = new Set((data ?? []).map((row) => row.key))
      const missing = NEEDED.filter((item) => !applied.has(item.key))

      add('migrations', 'Файлы SQL',
          missing.length === 0 ? 'ok' : 'warn',
          missing.length === 0
            ? `все выполнены: ${NEEDED.length} файла`
            : `не выполнены: ${missing.map((item) => item.title).join(', ')}`)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      // Нет самой таблицы отметок — значит не выполнялся ни один из файлов.
      add('migrations', 'Файлы SQL',
          signedIn ? 'warn' : 'idle',
          signedIn
            ? 'ни 003, ни 004 ещё не выполнены — чат не откроется сам, '
              + 'системные сообщения и средний рейтинг работать не будут'
            : `не проверялось: ${message}`)
    }

    // 5. Функция полного удаления аккаунта.
    //
    // Запрос идёт методом OPTIONS: он только спрашивает, есть ли функция по
    // этому адресу, и ничего не удаляет.
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`,
        { method: 'OPTIONS' },
      )

      add('delete-account', 'Функция удаления аккаунта',
          response.ok ? 'ok' : 'warn',
          response.ok
            ? 'развёрнута: аккаунт удаляется полностью'
            : `не развёрнута (${response.status}): аккаунт будет только отключаться`)
    } catch {
      add('delete-account', 'Функция удаления аккаунта', 'warn',
          'не отвечает: аккаунт будет только отключаться')
    }

    // 6. Чат в реальном времени.
    try {
      const channel = client.channel('health-check')
      const state = await new Promise<string>((resolve) => {
        const timer = setTimeout(() => resolve('timeout'), 6000)
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR') {
            clearTimeout(timer)
            resolve(status)
          }
        })
      })
      client.removeChannel(channel)

      add('realtime', 'Чат в реальном времени', state === 'SUBSCRIBED' ? 'ok' : 'fail',
          state === 'SUBSCRIBED' ? 'подписка установлена' : `не подключилось (${state})`)
    } catch {
      add('realtime', 'Чат в реальном времени', 'fail', 'не удалось подключиться')
    }

    setChecks(result)
  }

  /**
   * Отдельной кнопкой: проверка тратит обращение к модели.
   *
   * Запрос отправляется вручную, а не через вспомогательный метод клиента:
   * так видно, какие заголовки ушли и что именно ответил сервер. Без этого
   * ошибка выглядит просто числом и её причину приходится угадывать.
   */
  async function checkAI () {
    setAiBusy(true)
    setAiState({ key: 'ai', title: 'ИИ-генерация квестов', status: 'checking', detail: 'спрашиваем модель…' })

    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-quest`

    const token = (await db().auth.getSession()).data.session?.access_token

    const report = (status: Status, detail: string) =>
      setAiState({ key: 'ai', title: 'ИИ-генерация квестов', status, detail })

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: key,
          authorization: `Bearer ${token ?? key}`,
        },
        body: JSON.stringify({
          title: 'Проверка связи',
          description: 'Тестовый запрос со страницы самопроверки',
          category: 'chill',
          address: 'Екатеринбург, Плотинка',
          participants: 3,
          interests: ['coffee'],
        }),
      })

      const raw = await response.text()
      const token_note = token ? 'токен входа приложен' : 'токена входа нет'

      if (!response.ok) {
        // Проект может работать на новых ключах Supabase. Тогда функции не
        // принимают старый ключ anon, хотя база с ним продолжает работать, —
        // и ошибка выглядит как проблема со входом, хотя вход ни при чём.
        const wrongKeyType = raw.includes('INVALID_API_KEY') || raw.includes('publishable')

        const hint = wrongKeyType
          ? 'проект перешёл на новые ключи: в приложении прописан старый ключ anon, '
            + 'а функции принимают publishable. Нужен ключ вида sb_publishable_… '
            + 'из Project Settings → API Keys'
          : raw.includes('"overloaded":true')
            ? 'провайдер модели перегружен — это временно, попробуйте через несколько минут. '
              + 'Приложение в это время берёт квест из шаблона, показ не сорвётся'
            : {
                401: 'сервер не принял запрос — пришлите эту строку целиком',
                404: 'функции generate-quest нет — проверьте имя при создании',
                503: 'функция создана, но ключ GEMINI_API_KEY не задан в Secrets',
              }[response.status] ?? 'квесты будут браться из шаблонов'

        // В теле может лежать поле details — там написано, что именно
        // ответил провайдер модели. Оно и нужно, а не общая фраза.
        let extra = raw.slice(0, 200)
        try {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed?.details)) extra = parsed.details.join(' | ').slice(0, 400)
        } catch { /* тело не JSON — покажем как есть */ }

        report('warn', `${response.status}: ${hint} · ${token_note} · ${extra}`)
        return
      }

      const data = JSON.parse(raw)
      const tasks = Array.isArray(data?.tasks) ? data.tasks.length : 0

      if (tasks === 3) {
        report('ok', 'модель придумала квест: '
          + data.tasks.map((task: { title: string }) => task.title).join(', '))
        return
      }

      // Supabase создаёт функцию с примером «Hello World». Если он отвечает,
      // значит наш код в редактор не попал или не был опубликован.
      const scaffold = typeof data?.message === 'string' && data.message.startsWith('Hello')

      report('warn', scaffold
        ? 'в функции лежит заготовка Supabase, а не наш код: откройте Edge Functions → '
          + 'generate-quest → Code, выделите всё, вставьте содержимое '
          + 'supabase/functions/generate-quest/index.ts и нажмите Deploy'
        : `ответ пришёл, но не в нужном виде: ${raw.slice(0, 200)}`)
    } catch (cause) {
      report('fail', cause instanceof Error ? cause.message : 'не удалось вызвать функцию')
    } finally {
      setAiBusy(false)
    }
  }

  const all = aiState ? [...checks, aiState] : checks

  return (
    <div className="no-scrollbar h-full overflow-y-auto px-5 pb-10 pt-6">
      <h1 className="text-[26px]">Самопроверка</h1>
      <p className="mt-1 text-[15px] leading-snug text-muted">
        Служебный экран: показывает, что уже настроено, а что нет.
      </p>

      {isLive && !session && (
        <div className="mt-4 rounded-card bg-yellow-400/15 p-4">
          <p className="text-[16px] font-semibold text-yellow-300">Сначала войдите</p>
          <p className="mt-1 text-[14px] leading-snug text-yellow-100/80">
            Почти все данные закрыты правилами доступа и видны только вошедшим.
            Без входа проверки покажут пустоту, а не настоящее состояние.
          </p>
          <Link
            to="/login"
            className="mt-3 inline-block rounded-full bg-yellow-400/20 px-4 py-2 text-[15px]
                       font-semibold text-yellow-200"
          >
            Перейти ко входу
          </Link>
        </div>
      )}

      <div className="mt-5 space-y-2.5">
        {all.length === 0 && <p className="text-[16px] text-muted">Проверяем…</p>}

        {all.map((check) => (
          <div key={check.key} className="flex gap-3 rounded-card bg-surface-2 p-3.5">
            <span className={`text-[20px] font-bold leading-none ${TONE[check.status]}`}>
              {SIGN[check.status]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-semibold">{check.title}</p>
              <p className="mt-0.5 break-words text-[14px] leading-snug text-muted">
                {check.detail}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        <Button variant="ghost" onClick={runChecks}>Проверить заново</Button>
        <Button disabled={aiBusy} onClick={checkAI}>
          {aiBusy ? 'Спрашиваем модель…' : 'Проверить генерацию квеста'}
        </Button>
        <Link to="/" className="block py-2 text-center text-[16px] text-muted">
          На главную
        </Link>
      </div>
    </div>
  )
}
