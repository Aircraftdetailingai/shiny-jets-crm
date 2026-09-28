"use client";
import PlanGate from '@/components/PlanGate';

export default function Layout({ children }) {
  return <PlanGate feature="changeOrders" title="Change Orders">{children}</PlanGate>;
}
