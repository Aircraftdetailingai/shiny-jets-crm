"use client";
import PlanGate from '@/components/PlanGate';

export default function Layout({ children }) {
  return <PlanGate feature="marketing" title="Marketing">{children}</PlanGate>;
}
