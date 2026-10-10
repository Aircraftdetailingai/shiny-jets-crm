import { CUSTOMER_TERMS_UPDATED, PLATFORM_TERMS_INTRO, PLATFORM_TERMS_SECTIONS } from '@/lib/customer-service-terms';

export const metadata = {
  title: 'Service terms for quotes and invoices | Shiny Jets CRM',
  description: 'Plain-language service terms for aircraft detailing quotes and invoices sent through Shiny Jets CRM.',
};

export default function QuoteTermsPage() {
  return (
    <div className="min-h-screen bg-[#0D1B2A] text-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-light mb-2">Service terms for quotes and invoices</h1>
        <p className="text-white/50 text-sm leading-relaxed mb-8">
          {PLATFORM_TERMS_INTRO}
        </p>

        <div className="space-y-8 text-sm leading-relaxed text-white/70">
          {PLATFORM_TERMS_SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-white font-medium mb-2">{section.title}</h2>
              {section.body.split(/\n\n+/).map((block) => {
                const lines = block.split('\n');
                if (lines.every((line) => line.startsWith('- '))) {
                  return (
                    <ul key={block} className="list-disc ml-5 space-y-1 mb-3">
                      {lines.map((line) => (
                        <li key={line}>{line.slice(2)}</li>
                      ))}
                    </ul>
                  );
                }
                return <p key={block} className="mb-3">{block}</p>;
              })}
            </section>
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-white/10">
          <p className="text-white/30 text-xs">
            These terms were last updated {CUSTOMER_TERMS_UPDATED}. For questions contact{' '}
            <a href="mailto:support@shinyjets.com" className="text-[#007CB1] underline">support@shinyjets.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}
