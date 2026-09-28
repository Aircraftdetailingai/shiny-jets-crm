"use client";
import PlanGate from '@/components/PlanGate';

export default function Layout({ children }) {
  return <PlanGate feature="team" title="Team">{children}</PlanGate>;
}
