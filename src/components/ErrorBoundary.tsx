import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryState {
  message: string | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { message: null };

  static getDerivedStateFromError(error: Error) {
    return { message: error.message };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Application error boundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.message) {
      return (
        <div className="grid min-h-screen place-items-center bg-slate-50 p-8">
          <div className="panel max-w-xl p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-red-700">
              CareerCompiler error
            </p>
            <h1 className="mt-3 text-2xl font-semibold text-slate-950">
              Something recoverable failed.
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-700">{this.state.message}</p>
            <button
              className="button mt-5"
              type="button"
              onClick={() => this.setState({ message: null })}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
