// Полное удаление аккаунта по запросу пользователя (ТЗ 4.1.5).
//
// Из браузера стереть запись входа нельзя: ключ, которому это разрешено,
// серверный, и в коде страницы ему не место. Поэтому удаляет функция —
// браузер только приносит свой пропуск (токен сессии), функция по нему
// узнаёт, кто пришёл, и удаляет ровно этого пользователя, а не любого.
//
// Запись в auth.users — корень всех данных человека: app_user ссылается на
// неё с «on delete cascade», а на app_user так же ссылаются интересы,
// участия, сообщения и начисления. Одно удаление уносит всю цепочку.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reply (body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// Имя переменной с серверным ключом зависит от возраста проекта: у проектов
// на новых ключах это SB_SECRET_KEY, у прежних — SUPABASE_SERVICE_ROLE_KEY.
// Берём первую, которая задана, чтобы функция работала в обоих случаях.
const SECRET = [
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  Deno.env.get('SB_SECRET_KEY'),
  Deno.env.get('SERVICE_ROLE_KEY'),
].find(Boolean)

const URL_ = Deno.env.get('SUPABASE_URL') ?? ''

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return reply({ error: 'Нет токена сессии' }, 401)

  if (!SECRET) return reply({ error: 'Функции не выдан серверный ключ' }, 500)

  const admin = createClient(URL_, SECRET, { auth: { persistSession: false } })

  // Кто пришёл. Токен проверяет сам Supabase: подделать его нельзя, а
  // значит удалить чужой аккаунт через эту функцию тоже нельзя.
  const { data: caller, error: whoError } = await admin.auth.getUser(token)
  if (whoError || !caller?.user) return reply({ error: 'Сессия недействительна' }, 401)

  const userId = caller.user.id

  // Ивенты, которые человек собрал, тоже уходят каскадом. Те, что ещё не
  // прошли, сперва отменяем: участники должны увидеть причину, а не пустое
  // место в списке.
  await admin.from('event')
    .update({ status: 'cancelled' })
    .eq('organizer_id', userId)
    .in('status', ['active', 'in_progress'])

  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return reply({ error: error.message }, 500)

  return reply({ ok: true })
})
