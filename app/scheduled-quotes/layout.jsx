"use client";
import PlanGate from '@/components/PlanGate';

export default function Layout({ children }) {
  return <PlanGate feature="scheduledSend" title="Scheduled Quotes">{children}</PlanGate>;
}
