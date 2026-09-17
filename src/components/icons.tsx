// Иконки из макетов. Рисуются кодом, а не картинками: так они остаются
// чёткими на любом экране и перекрашиваются под состояние.

type IconProps = { className?: string }

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export const HomeIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5.5 9.5V20h13V9.5" />
  </svg>
)

export const FlameIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M12.5 2c.3 3-1.4 4.3-2.8 5.6C8 9 6.5 10.6 6.5 13.5a5.5 5.5 0 0 0 11 0c0-2.2-.8-3.6-1.8-4.9-.3 1-.9 1.7-1.7 2 .4-2.8-.6-6.6-1.5-8.6Z" />
  </svg>
)

export const MapIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}>
    <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" />
    <path d="M9 4v14M15 6v14" />
  </svg>
)

export const UserIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5" />
  </svg>
)

export const SearchIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </svg>
)

export const MicIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}>
    <rect x="9.5" y="3" width="5" height="10" rx="2.5" />
    <path d="M6 11a6 6 0 0 0 12 0M12 17v4" />
  </svg>
)

export const BellIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}>
    <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z" />
    <path d="M10 18.5a2 2 0 0 0 4 0" />
  </svg>
)

export const CalendarIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}>
    <rect x="3.5" y="5" width="17" height="15" rx="3" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </svg>
)

export const PinIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}>
    <path d="M12 21s6.5-5.7 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15.3 12 21 12 21Z" />
    <circle cx="12" cy="10.5" r="2.5" />
  </svg>
)

export const CameraIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}>
    <path d="M3.5 8.5h3l1.5-2.5h8L17.5 8.5h3v11h-17v-11Z" />
    <circle cx="12" cy="13.5" r="3.5" />
  </svg>
)

export const QuizIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}>
    <path d="M20.5 12a8.5 8.5 0 1 1-3.4-6.8" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3 2.4V14" />
    <path d="M12.5 17.2v.1" />
  </svg>
)

export const GeoTaskIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}>
    <path d="M12 21s6.5-5.7 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15.3 12 21 12 21Z" />
    <path d="m9.5 10.5 1.8 1.8 3.2-3.4" />
  </svg>
)

export const ChevronIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke} strokeWidth={2.2}>
    <path d="m9 5 7 7-7 7" />
  </svg>
)

export const BackIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke} strokeWidth={2.2}>
    <path d="m15 5-7 7 7 7" />
  </svg>
)

export const CloseIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke} strokeWidth={2.2}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
)

export const GearIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm9 3.5c0 .6-.05 1.2-.15 1.75l2 1.5-2 3.5-2.4-.9c-.85.75-1.85 1.3-2.95 1.6L15 22h-6l-.5-2.55c-1.1-.3-2.1-.85-2.95-1.6l-2.4.9-2-3.5 2-1.5A9.6 9.6 0 0 1 3 12c0-.6.05-1.2.15-1.75l-2-1.5 2-3.5 2.4.9c.85-.75 1.85-1.3 2.95-1.6L9 2h6l.5 2.55c1.1.3 2.1.85 2.95 1.6l2.4-.9 2 3.5-2 1.5c.1.55.15 1.15.15 1.75Z" />
  </svg>
)

export const StarIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6.1L12 16.8 6.7 19.7l1.1-6.1L3.4 9.4l6-.8L12 3Z" />
  </svg>
)

export const ClipIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}>
    <path d="M15.5 7.5 9 14a2.5 2.5 0 0 0 3.5 3.5l7-7a4.5 4.5 0 0 0-6.4-6.4l-7 7a6.5 6.5 0 0 0 9.2 9.2l5.7-5.7" />
  </svg>
)

export const ClockIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </svg>
)

export const SparkIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M12 2.5 13.8 9l6.5 1.8-6.5 1.8L12 19l-1.8-6.4L3.7 10.8 10.2 9 12 2.5Z" />
  </svg>
)

export const LocateIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...stroke}>
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>
)
