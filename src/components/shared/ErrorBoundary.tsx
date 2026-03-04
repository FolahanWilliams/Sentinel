/**
 * Phase 3 fix (Audit C13): React Error Boundary
 *
 * Catches unhandled render errors and shows a recovery UI
 * instead of crashing the entire application to a white screen.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="min-h-[400px] flex items-center justify-center p-8">
                    <div className="text-center max-w-md">
                        <div className="text-4xl mb-4">!</div>
                        <h2 className="text-lg font-semibold text-white mb-2">Something went wrong</h2>
                        <p className="text-sm text-zinc-400 mb-4">
                            {this.state.error?.message || 'An unexpected error occurred'}
                        </p>
                        <button
                            onClick={() => this.setState({ hasError: false, error: null })}
                            className="px-4 py-2 bg-sentinel-600 text-white rounded-lg hover:bg-sentinel-500 transition-colors text-sm"
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
