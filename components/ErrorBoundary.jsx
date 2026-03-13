"use client";
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('App Error:', error, info);
    // Log to help debug mobile crashes
    try {
      const errorLog = JSON.parse(localStorage.getItem('vector_error_log') || '[]');
      errorLog.unshift({
        message: error?.message,
        stack: error?.stack?.slice(0, 500),
        component: info?.componentStack?.slice(0, 300),
        time: new Date().toISOString(),
        url: window.location.href,
        ua: navigator.userAgent,
      });
      localStorage.setItem('vector_error_log', JSON.stringify(errorLog.slice(0, 5)));
    } catch {}
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-v-charcoal flex items-center justify-center p-4">
          <div className="bg-v-surface border border-v-border rounded p-8 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-light tracking-wide text-v-text-primary mb-2">Something went wrong</h2>
            <p className="text-v-text-secondary text-sm mb-2">
              An unexpected error occurred. Please try again or reload the page.
            </p>
            {this.state.error?.message && (
              <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded p-2 mb-4 font-mono break-all">
                {this.state.error.message}
              </p>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="px-5 py-2.5 bg-v-gold text-v-charcoal rounded font-medium hover:bg-v-gold-dim transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 border border-v-border text-v-text-secondary rounded font-medium hover:text-v-text-primary hover:border-v-gold/50 transition-colors"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
