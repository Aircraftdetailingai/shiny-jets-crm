"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy route — QR/embed live under Settings → Share & Embed (/settings/developer). */
export default function EmbedSettingsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/settings/developer');
  }, [router]);

  return (
    <div className="p-4 text-v-text-secondary text-sm">
      Redirecting to Share &amp; Embed · QR…
    </div>
  );
}
