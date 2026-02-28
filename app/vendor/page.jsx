"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function VendorPage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('vendor_token');
    if (token) {
      router.push('/vendor/dashboard');
    } else {
      router.push('/vendor/login');
    }
  }, [router]);

  return (
    <div className="page-transition min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full"></div>
    </div>
  );
}
