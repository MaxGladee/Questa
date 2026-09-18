import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Последняя преграда между поломкой и чёрным экраном.
 *
 * Если во время отрисовки что-то падает — не загрузился файл экрана,
 * пришли данные не той формы, — React снимает всё дерево целиком. Внешне
 * это выглядит как чёрная страница: ни текста, ни кнопок, ни намёка на
 * то, что делать. Человек решает, что приложение сломалось насовсем.
 *
 * Здесь падение перехватывается и показывается тем, чем оно и является:
 * сбоем одного экрана, из которого есть выход — обновить страницу.
 * Причина печатается в консоль, чтобы её было видно при разборе.
 */
interface State {
  failed: boolean
  reason: string
}

export class Boundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false, reason: '' }

  static getDerivedStateFromError (error: unknown): State {
    return {
      failed: true,
      reason: error instanceof Error ? error.message : 'неизвестная ошибка',
    }
  }

  componentDidCatch (error: unknown, info: ErrorInfo) {
    console.error('Экран упал:', error, info.componentStack)
  }

  render () {
    if (!this.state.failed) return this.props.children

    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <span className="text-[44px]">🙃</span>
        <p className="text-[20px] font-semibold">Экран не открылся</p>
        <p className="text-[16px] leading-snug text-muted">
          Похоже, часть приложения не догрузилась. Обычно помогает обновление —
          данные и вход при этом не теряются.
        </p>

        <button
          onClick={() => window.location.reload()}
          className="btn-primary mt-2 rounded-full px-6 py-3 text-[17px] font-semibold text-white"
        >
          Обновить
        </button>

        <p className="text-[13px] text-muted/70">{this.state.reason}</p>
      </div>
    )
  }
}
