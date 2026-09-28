"use client";
import PlanGate from '@/components/PlanGate';

export default function Layout({ children }) {
  return <PlanGate feature="reports" title="Profitability">{children}</PlanGate>;
}
