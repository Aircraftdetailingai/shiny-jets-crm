"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (token) {
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-v-charcoal flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-v-gold border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
