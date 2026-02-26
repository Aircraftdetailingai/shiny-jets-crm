"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n';

export default function CustomerPage() {
  const router = useRouter();
  const { t } = useTranslation();

  useEffect(() => {
    const token = localStorage.getItem('customer_token');
    if (token) {
      router.push('/customer/dashboard');
    } else {
      router.push('/customer/login');
    }
  }, [router]);

  return (
    <div className="page-transition min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full"></div>
    </div>
  );
}
