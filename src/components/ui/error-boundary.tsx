import React from 'react'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('UI crashed:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
            <div className="max-w-md text-center space-y-3">
              <h1 className="text-2xl font-semibold">Something went wrong</h1>
              <p className="text-sm text-muted-foreground">
                The UI hit an unexpected error. Refresh the page and try again.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="mt-2 inline-flex items-center justify-center rounded-full px-6 py-2 text-sm font-semibold bg-primary text-primary-foreground"
              >
                Refresh
              </button>
            </div>
          </div>
        )
      )
    }
    return this.props.children
  }
}
