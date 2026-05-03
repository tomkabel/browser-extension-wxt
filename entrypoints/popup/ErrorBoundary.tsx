import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReload = (): void => {
    chrome.runtime.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="w-96 p-4 bg-white">
          <div className="flex items-center gap-3 mb-4 pb-3 border-b">
            <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">S2</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-800">SmartID2</h1>
              <p className="text-xs text-gray-500">Something went wrong</p>
            </div>
          </div>
          <div className="p-4 bg-red-50 rounded-lg border border-red-200 text-center">
            <p className="text-red-700 text-sm mb-1">An unexpected error occurred.</p>
            <p className="text-red-500 text-xs mb-4 font-mono break-all">
              {this.state.error?.message ?? 'Unknown error'}
            </p>
            <button
              type="button"
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors"
              onClick={this.handleReload}
            >
              Reload Extension
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
