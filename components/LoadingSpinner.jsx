"use client";

export default function LoadingSpinner({ message, fullScreen = true }) {
  const displayMessage = message !== undefined ? message : 'Loading...';

  const spinner = (
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 border-4 border-v-border border-t-v-gold rounded-full animate-spin" />
      <p className="text-v-text-secondary text-sm">{displayMessage}</p>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center">
        {spinner}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-12">
      {spinner}
    </div>
  );
}
