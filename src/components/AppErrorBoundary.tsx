import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

/**
 * Catches render errors in the subtree so a single page failure does not leave a blank root.
 * Does not replace server-side authorization.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AppErrorBoundary:', error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 py-12 text-stone-800 bg-stone-50 dark:bg-stone-950 dark:text-stone-100">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="max-w-md text-center text-sm text-stone-600 dark:text-stone-400">
            The app hit an unexpected error. You can try again, or refresh the page if the problem continues.
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
