"use client";
import { ToastProvider } from './Toast';
import ErrorBoundary from './ErrorBoundary';
import OfflineBanner from './OfflineBanner';

export default function Providers({ children }) {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <OfflineBanner />
        {children}
      </ToastProvider>
    </ErrorBoundary>
  );
}
