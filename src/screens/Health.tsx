import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui'
import { verifyPhoto } from '../lib/api'
import { db, isLive } from '../lib/supabase'
import { YANDEX_KEY, loadYmaps, mapFailure } from '../lib/ymaps'
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
  const [photoState, setPhotoState] = useState<Check | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [providers, setProviders] = useState<Check[]>([])
  const [providersBusy, setProvidersBusy] = useState(false)
  const [mapState, setMapState] = useState<Check | null>(null)
  const [mapBusy, setMapBusy] = useState(false)

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
      { key: '006_live_notifications', title: '006 — всплывающие уведомления' },
      { key: '007_achievements', title: '007 — даты получения ачивок' },
      { key: '008_event_ending', title: '008 — завершение ивента и напоминания' },
      { key: '009_more_categories', title: '009 — новые категории встреч' },
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
   * Карта: поднимается ли Яндекс или работает запасной OpenStreetMap.
   *
   * Отличить их на глаз можно, но не сразу, а причина отката (нет ключа,
   * не тот домен в ограничении, кончилась квота) в интерфейсе не видна
   * вообще. Здесь она называется прямо.
   */
  async function checkMap () {
    setMapBusy(true)
    setMapState({ key: 'map', title: 'Карта Яндекса', status: 'checking', detail: 'загружаем библиотеку…' })

    if (!YANDEX_KEY) {
      setMapState({
        key: 'map', title: 'Карта Яндекса', status: 'warn',
        detail: 'ключ не задан в сборке — карта работает на OpenStreetMap',
      })
      setMapBusy(false)
      return
    }

    const api = await loadYmaps()

    setMapState({
      key: 'map',
      title: 'Карта Яндекса',
      status: api ? 'ok' : 'fail',
      detail: api
        ? `библиотека загружена, ключ …${YANDEX_KEY.slice(-6)} принят`
        : `${mapFailure || 'не загрузилась'} · сейчас карта на OpenStreetMap`,
    })

    setMapBusy(false)
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
        // Контекст настоящий, а не заглушка: проверка должна показывать
        // то же, что получит живой ивент, — включая город, время и интересы.
        body: JSON.stringify({
          title: 'Проверка связи',
          description: 'Тестовый запрос со страницы самопроверки',
          category: 'chill',
          city: profile?.city || 'Екатеринбург',
          address: 'Плотинка, Исторический сквер',
          startsAt: new Date(Date.now() + 3 * 3_600_000).toISOString(),
          participants: 3,
          interests: profile?.interests?.length ? profile.interests : ['coffee', 'walk'],
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
        // Имя модели важнее самих заданий: по нему видно, ответил Claude или
        // сработала запасная. Функция возвращает его в поле model.
        const who = typeof data?.model === 'string' ? data.model : 'модель не назвалась'

        report('ok', `${who} · `
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

  /**
   * Опрос поставщиков модели.
   *
   * В обычной работе отказ первого поставщика не виден: если ответил
   * следующий, запрос успешен. Здесь каждый опрашивается отдельно и
   * рассказывает, что с ним не так.
   */
  async function checkProviders () {
    setProvidersBusy(true)
    setProviders([{
      key: 'probe', title: 'Поставщики модели', status: 'checking', detail: 'опрашиваем…',
    }])

    try {
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string
      const token = (await db().auth.getSession()).data.session?.access_token

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-quest`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            apikey: key,
            authorization: `Bearer ${token ?? key}`,
          },
          body: JSON.stringify({ kind: 'probe' }),
        },
      )

      const raw = await response.text()

      if (!response.ok) {
        setProviders([{
          key: 'probe', title: 'Поставщики модели', status: 'fail',
          detail: `${response.status}: ${raw.slice(0, 300)}`,
        }])
        return
      }

      const data = JSON.parse(raw) as {
        providers?: Array<{ name: string; ok: boolean; detail: string }>
      }

      if (!data.providers?.length) {
        setProviders([{
          key: 'probe', title: 'Поставщики модели', status: 'warn',
          detail: 'функция ещё не умеет опрашивать поставщиков — передеплойте её',
        }])
        return
      }

      setProviders(data.providers.map((item, index) => ({
        key: `provider-${index}`,
        title: item.name,
        status: item.ok ? 'ok' : 'warn',
        detail: item.detail,
      })))
    } catch (cause) {
      setProviders([{
        key: 'probe', title: 'Поставщики модели', status: 'fail',
        detail: cause instanceof Error ? cause.message : 'не удалось опросить',
      }])
    } finally {
      setProvidersBusy(false)
    }
  }

  /**
   * Проверка разбора фотографии.
   *
   * Снимок рисуется прямо здесь: красный круг на белом. Модель должна
   * увидеть именно его — по ответу сразу понятно, смотрит она на картинку
   * или отвечает наугад. Настоящее фото для этого просить незачем.
   */
  async function checkPhotoVision () {
    setPhotoBusy(true)
    setPhotoState({
      key: 'vision', title: 'Разбор фотографии', status: 'checking',
      detail: 'показываем модели картинку…',
    })

    const report = (status: Status, detail: string) =>
      setPhotoState({ key: 'vision', title: 'Разбор фотографии', status, detail })

    try {
      const canvas = document.createElement('canvas')
      canvas.width = 256
      canvas.height = 256

      const context = canvas.getContext('2d')
      if (!context) return report('fail', 'браузер не дал нарисовать картинку')

      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, 256, 256)
      context.fillStyle = '#e11d48'
      context.beginPath()
      context.arc(128, 128, 90, 0, Math.PI * 2)
      context.fill()

      const base64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1]
      const verdict = await verifyPhoto('На снимке должен быть красный круг на белом фоне', base64)

      if (verdict.skipped) {
        report('warn', verdict.reason
          ? `проверка не состоялась: ${verdict.reason}`
          : 'проверка не состоялась — функция ещё не умеет смотреть на снимки, '
            + 'передеплойте generate-quest')
        return
      }

      report(verdict.ok ? 'ok' : 'warn',
        verdict.ok
          ? `${verdict.model ?? 'модель'} увидела картинку: ${verdict.reason || 'засчитано'}`
          : `${verdict.model ?? 'модель'} посмотрела, но не засчитала: ${verdict.reason}`)
    } catch (cause) {
      report('fail', cause instanceof Error ? cause.message : 'не удалось проверить')
    } finally {
      setPhotoBusy(false)
    }
  }

  const all = [...checks, ...providers, mapState, aiState, photoState].filter(Boolean) as Check[]

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
        <Button variant="ghost" disabled={mapBusy} onClick={checkMap}>
          {mapBusy ? 'Загружаем карту…' : 'Проверить карту Яндекса'}
        </Button>
        <Button variant="ghost" disabled={providersBusy} onClick={checkProviders}>
          {providersBusy ? 'Опрашиваем…' : 'Проверить поставщиков модели'}
        </Button>
        <Button disabled={aiBusy} onClick={checkAI}>
          {aiBusy ? 'Спрашиваем модель…' : 'Проверить генерацию квеста'}
        </Button>
        {/* Какой провайдер отвечает — видно в строке результата обеих
            проверок: там печатается имя модели из ответа функции. */}
        <Button variant="ghost" disabled={photoBusy} onClick={checkPhotoVision}>
          {photoBusy ? 'Показываем картинку…' : 'Проверить разбор фотографии'}
        </Button>
        <Link to="/" className="block py-2 text-center text-[16px] text-muted">
          На главную
        </Link>
      </div>
    </div>
  )
}
