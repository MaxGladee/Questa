import { avatarLook } from './avatar-art'

/** Рисует аватар по зерну. Всё, что видно, вычислено из строки в профиле. */
export function GeneratedAvatar ({ seed, size }: { seed: string; size: number }) {
  const look = avatarLook(seed)
  const id = `av-${seed.replace(/[^a-z0-9]/gi, '')}`

  const eyes = {
    dots:   <><circle cx="40" cy="52" r="5" /><circle cx="60" cy="52" r="5" /></>,
    wide:   <><circle cx="39" cy="52" r="7" /><circle cx="61" cy="52" r="7" /></>,
    happy:  <><path d="M34 54q6-8 12 0" /><path d="M54 54q6-8 12 0" /></>,
    sleepy: <><path d="M34 53h12" /><path d="M54 53h12" /></>,
    wink:   <><circle cx="40" cy="52" r="5" /><path d="M54 52h12" /></>,
    star:   <><path d="m40 45 2.4 5.1 5.6.7-4.1 3.9 1 5.6-4.9-2.7-4.9 2.7 1-5.6-4.1-3.9 5.6-.7z" />
              <path d="m60 45 2.4 5.1 5.6.7-4.1 3.9 1 5.6-4.9-2.7-4.9 2.7 1-5.6-4.1-3.9 5.6-.7z" /></>,
  }[look.eyes]

  const mouth = {
    smile: <path d="M42 68q8 7 16 0" />,
    grin:  <path d="M40 66q10 11 20 0z" />,
    line:  <path d="M44 69h12" />,
    small: <path d="M47 68q3 3 6 0" />,
    open:  <ellipse cx="50" cy="69" rx="5" ry="6" />,
    cat:   <path d="M43 67q3.5 4 7 0q3.5 4 7 0" />,
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

      <rect width="100" height="100" rx="24" fill={`url(#${id})`} />

      {/* Фоновое пятно — чтобы одинаковые палитры не выглядели одинаково. */}
      <circle
        cx={20 + look.hue % 60} cy={18 + look.hue % 40} r="26"
        fill="#fff" opacity="0.08"
      />

      {look.ears === 'cat' && (
        <path d={`M28 34 32 14 46 26Z M72 34 68 14 54 26Z`} fill={look.skin} />
      )}
      {look.ears === 'round' && (
        <><circle cx="28" cy="30" r="10" fill={look.skin} />
          <circle cx="72" cy="30" r="10" fill={look.skin} /></>
      )}
      {look.ears === 'antenna' && (
        <><path d="M50 26V12" stroke={look.skin} strokeWidth="4" strokeLinecap="round" />
          <circle cx="50" cy="10" r="6" fill="#fff" opacity="0.85" /></>
      )}

      <rect x="18" y="26" width="64" height="60" rx={look.round} fill={look.skin} />

      {look.blush && (
        <><ellipse cx="30" cy="64" rx="7" ry="4" fill="#fff" opacity="0.22" />
          <ellipse cx="70" cy="64" rx="7" ry="4" fill="#fff" opacity="0.22" /></>
      )}

      {look.freckles && (
        <g fill="#fff" opacity="0.3">
          <circle cx="34" cy="60" r="1.6" /><circle cx="39" cy="63" r="1.4" />
          <circle cx="66" cy="60" r="1.6" /><circle cx="61" cy="63" r="1.4" />
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
