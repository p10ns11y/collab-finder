import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportFatal } from '../runtime/global-errors'
import { Button } from '../components/ui/button'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportFatal(error)
    console.error('[error-boundary]', info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mesh-bg flex min-h-screen flex-col items-center justify-center px-6">
          <div className="max-w-md rounded-xl border border-danger/30 bg-surface-1 p-6 text-center">
            <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
            <p className="mt-2 text-sm text-ink-muted">{this.state.error.message}</p>
            <Button
              variant="primary"
              size="md"
              className="mt-4"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

