"use client";
import PlanGate from '@/components/PlanGate';

export default function Layout({ children }) {
  return <PlanGate feature="products" title="Inventory">{children}</PlanGate>;
}
