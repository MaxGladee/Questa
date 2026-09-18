import { avatarLook } from './avatar-art'

/** Рисует аватар по зерну. Всё, что видно, вычислено из строки в профиле. */
export function GeneratedAvatar ({ seed, size }: { seed: string; size: number }) {
  const look = avatarLook(seed)
  const id = `av-${seed.replace(/[^a-z0-9]/gi, '')}`

  const hw = look.headWidth
  const hx = 50 - hw / 2
  const hy = 86 - look.headHeight

  // Глаза и рот строятся от вычисленных пропорций, а не жёстких координат:
  // расстояние между глазами, их размер и ширина рта у каждого свои.
  const lx = 50 - look.eyeGap / 2
  const rx = 50 + look.eyeGap / 2
  const ey = look.eyeLine
  const r = look.eyeSize
  const mw = look.mouthWidth
  const my = look.mouthLine

  const star = (cx: number) =>
    `m${cx} ${ey - 7} 2.4 5.1 5.6.7-4.1 3.9 1 5.6-4.9-2.7-4.9 2.7 1-5.6-4.1-3.9 5.6-.7z`

  const eyes = {
    dots:   <><circle cx={lx} cy={ey} r={r} /><circle cx={rx} cy={ey} r={r} /></>,
    wide:   <><circle cx={lx} cy={ey} r={r + 2} /><circle cx={rx} cy={ey} r={r + 2} /></>,
    happy:  <><path d={`M${lx - 6} ${ey + 2}q6-8 12 0`} />
              <path d={`M${rx - 6} ${ey + 2}q6-8 12 0`} /></>,
    sleepy: <><path d={`M${lx - 6} ${ey + 1}h12`} /><path d={`M${rx - 6} ${ey + 1}h12`} /></>,
    wink:   <><circle cx={lx} cy={ey} r={r} /><path d={`M${rx - 6} ${ey}h12`} /></>,
    star:   <><path d={star(lx)} /><path d={star(rx)} /></>,
  }[look.eyes]

  const mouth = {
    smile: <path d={`M${50 - mw / 2} ${my}q${mw / 2} 7 ${mw} 0`} />,
    grin:  <path d={`M${50 - mw / 2} ${my - 2}q${mw / 2} 11 ${mw} 0z`} />,
    line:  <path d={`M${50 - mw / 2} ${my + 1}h${mw}`} />,
    small: <path d={`M${50 - mw / 4} ${my}q${mw / 4} 3 ${mw / 2} 0`} />,
    open:  <ellipse cx="50" cy={my + 1} rx={mw / 3} ry={mw / 2.6} />,
    cat:   <path d={`M${50 - mw / 2} ${my - 1}q${mw / 4} 4 ${mw / 2} 0q${mw / 4} 4 ${mw / 2} 0`} />,
  }[look.mouth]

  const filled = look.eyes === 'dots' || look.eyes === 'wide' || look.eyes === 'star'
    || look.eyes === 'wink'

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={look.from} />
          <stop offset="1" stopColor={look.to} />
        </linearGradient>
      </defs>

      {/* Поворот цвета делает палитру своей у каждого, а не одной из дюжины. */}
      <g style={{ filter: `hue-rotate(${look.hueShift}deg)` }}>
        {/* Подложка во весь квадрат, без своих скруглений: форму задаёт
            обёртка (круг в списках, квадрат в шапке), и она же обрезает
            лишнее. Со своим радиусом рисунок не совпадал с рамкой —
            в квадратной кнопке по углам оставались тёмные уголки. */}
        <rect width="100" height="100" fill={`url(#${id})`} />
        <circle cx={look.blobX} cy={look.blobY} r={look.blobR} fill="#fff" opacity="0.09" />
      </g>

      <g transform={`rotate(${look.earTilt} 50 40)`}>
        {look.ears === 'cat' && (
          <path d={`M${hx + 10} 34 ${hx + 14} 14 ${hx + 28} 26Z
                    M${hx + hw - 10} 34 ${hx + hw - 14} 14 ${hx + hw - 28} 26Z`}
                fill={look.skin} />
        )}
        {look.ears === 'round' && (
          <><circle cx={hx + 10} cy="30" r="10" fill={look.skin} />
            <circle cx={hx + hw - 10} cy="30" r="10" fill={look.skin} /></>
        )}
        {look.ears === 'antenna' && (
          <><path d="M50 26V12" stroke={look.skin} strokeWidth="4" strokeLinecap="round" />
            <circle cx="50" cy="10" r="6" fill="#fff" opacity="0.85" /></>
        )}
      </g>

      <rect x={hx} y={hy} width={hw} height={look.headHeight} rx={look.round} fill={look.skin} />

      {look.blush && (
        <><ellipse cx={lx - 6} cy={my - 5} rx="7" ry="4" fill="#fff" opacity="0.22" />
          <ellipse cx={rx + 6} cy={my - 5} rx="7" ry="4" fill="#fff" opacity="0.22" /></>
      )}

      {look.freckles && (
        <g fill="#fff" opacity="0.3">
          <circle cx={lx - 4} cy={my - 8} r="1.6" /><circle cx={lx + 1} cy={my - 5} r="1.4" />
          <circle cx={rx + 4} cy={my - 8} r="1.6" /><circle cx={rx - 1} cy={my - 5} r="1.4" />
        </g>
      )}

      <g
        fill={filled ? '#fff' : 'none'}
        stroke="#fff" strokeWidth={filled ? 0 : 3}
        strokeLinecap="round" strokeLinejoin="round"
      >
        {eyes}
      </g>

      <g fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {mouth}
      </g>
    </svg>
  )
}
