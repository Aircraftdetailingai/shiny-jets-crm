import { redirect } from 'next/navigation';

export default function RegisterPage({ searchParams }) {
  const plan = searchParams?.plan || '';
  const params = plan ? `?plan=${encodeURIComponent(plan)}` : '';
  redirect(`/signup${params}`);
}
