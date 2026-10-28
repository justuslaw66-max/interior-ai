'use client';

import React, { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

interface CanvasErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class CanvasErrorBoundary extends React.Component<CanvasErrorBoundaryProps, State> {
  constructor(props: CanvasErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    try {
      console.error('Canvas render failed', { errorType: error.name });
    } catch {
      // Never let logging throw from an error boundary callback.
    }

    try {
      const message = error?.message ?? '';

      // Defer reporting so class commit callbacks never synchronously touch
      // modules that might be in partial initialization state.
      queueMicrotask(async () => {
        try {
          const sentryContext = await import('@/lib/sentry-context');

          const safeError = new Error(
            message.includes('WebGL') || message.includes('context')
              ? 'WebGL render failure'
              : 'Canvas render failure'
          );
          if (message.includes('WebGL') || message.includes('context')) {
            sentryContext.captureWebGLError(safeError);
            return;
          }

          sentryContext.captureCanvasBoundaryError(
            safeError,
            errorInfo.componentStack ?? undefined
          );
        } catch (reportingError) {
          try {
            console.error('Canvas error reporting failed', {
              errorType: reportingError instanceof Error ? reportingError.name : 'unknown',
            });
          } catch {
            // Ignore all secondary failures while reporting errors.
          }
        }
      });
    } catch (reportingError) {
      try {
        console.error('Canvas error reporting failed', {
          errorType: reportingError instanceof Error ? reportingError.name : 'unknown',
        });
      } catch {
        // Ignore all secondary failures while reporting errors.
      }
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex h-full flex-col items-center justify-center gap-4 bg-surface-canvas p-6">
            <div className="text-center">
              <h2 className="mb-2 text-lg font-semibold text-label">
                The design view hit a problem
              </h2>
              <p className="mb-4 text-sm text-label-secondary">
                Your last valid design is saved. Try again, or reload the page.
              </p>
              <p className="mb-6 text-xs text-label-secondary">
                If this keeps happening, turn off hardware acceleration in your browser settings.
              </p>
              <div className="flex gap-2">
                <Button variant="primary" onClick={this.handleRetry}>
                  Retry
                </Button>
                <Button onClick={() => window.location.reload()}>Reload page</Button>
              </div>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
