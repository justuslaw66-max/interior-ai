'use client';

import React, { ReactNode } from 'react';
import * as Sentry from '@sentry/nextjs';
import { captureWebGLError } from '@/lib/sentry-context';

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
    // Log to console in development
    console.error('Canvas Error:', error, errorInfo);

    // Capture WebGL specific errors
    if (error.message.includes('WebGL') || error.message.includes('context')) {
      captureWebGLError(error);
    } else {
      // Capture general R3F errors
      Sentry.captureException(error, {
        tags: {
          component: 'canvas-error-boundary',
          type: 'r3f-error',
        },
        contexts: {
          react: {
            componentStack: errorInfo.componentStack,
          },
        },
      });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex h-full flex-col items-center justify-center gap-4 bg-gray-100 p-6">
            <div className="text-center">
              <h2 className="mb-2 text-lg font-semibold text-gray-900">
                Oops! The 3D view encountered an error
              </h2>
              <p className="mb-4 text-sm text-gray-600">
                {this.state.error?.message || 'Unknown error'}
              </p>
              <p className="mb-6 text-xs text-gray-500">
                We've logged this issue. Please try refreshing or disabling hardware acceleration.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={this.handleRetry}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Retry
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Reload Page
                </button>
              </div>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
