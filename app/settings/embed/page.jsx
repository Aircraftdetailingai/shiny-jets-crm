"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy route — QR/embed live under Settings → Developer. */
export default function EmbedSettingsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/settings/developer');
  }, [router]);

  return (
    <div className="p-4 text-v-text-secondary text-sm">
      Redirecting to Developer · QR & Embed…
    </div>
  );
}
