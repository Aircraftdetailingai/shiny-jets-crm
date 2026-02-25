"use client";
import { ToastProvider } from './Toast';
import ErrorBoundary from './ErrorBoundary';
import OfflineBanner from './OfflineBanner';
import KeyboardShortcuts from './KeyboardShortcuts';
import GlobalSearch from './GlobalSearch';
import QuickActionsMenu from './QuickActionsMenu';

export default function Providers({ children }) {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <OfflineBanner />
        {children}
        <KeyboardShortcuts />
        <GlobalSearch />
        <QuickActionsMenu />
      </ToastProvider>
    </ErrorBoundary>
  );
}
