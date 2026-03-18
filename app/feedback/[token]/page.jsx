"use client";
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function FeedbackPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token;

  useEffect(() => {
    if (token) {
      router.replace(`/review/${token}${window.location.search}`);
    }
  }, [token, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-white/20 border-t-v-gold rounded-full animate-spin" />
    </div>
  );
}
