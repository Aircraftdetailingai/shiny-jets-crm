"use client";
import PlanGate from '@/components/PlanGate';
import DetailingAiTermsGate from '@/components/DetailingAiTermsGate';

export default function Layout({ children }) {
  return (
    <PlanGate feature="detailingAi" title="Detailing AI">
      <DetailingAiTermsGate>{children}</DetailingAiTermsGate>
    </PlanGate>
  );
}
