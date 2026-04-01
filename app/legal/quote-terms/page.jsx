export const metadata = {
  title: 'Aircraft Detailing Service Agreement & Terms | Shiny Jets CRM',
};

export default function QuoteTermsPage() {
  return (
    <div className="min-h-screen bg-[#0D1B2A] text-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-light mb-2">Aircraft Detailing Service Agreement &amp; Terms</h1>
        <p className="text-white/40 text-xs mb-8">
          Please review these terms carefully before submitting your quote request. These terms protect both you and your detailing professional.
        </p>

        <div className="space-y-8 text-sm leading-relaxed text-white/70">

          <Section num="1" title="Service Scope">
            Final service scope and pricing is determined by the detailer after in-person inspection and photo documentation.
            The quote provided is an estimate only. Actual services required may differ based on aircraft surface condition.
          </Section>

          <Section num="2" title="Additional Work Authorization">
            If additional cutting steps, passes, or materials are required beyond the initial quote, the detailer will notify
            the customer with an updated cost adjustment before proceeding. No additional work will be performed without written
            customer approval.
          </Section>

          <Section num="3" title="Payment Terms">
            Payment is due upon invoice. If payment is not received within 48 hours of invoice, work in progress will be paused
            and no further services will be performed until payment is received. All fees paid are non-refundable once work has commenced.
          </Section>

          <Section num="4" title="Deposit Policy">
            Deposits collected to reserve scheduling are non-refundable. Deposits are applied toward the final invoice total.
          </Section>

          <Section num="5" title="Cancellation Policy">
            Cancellations made less than 48 hours before scheduled service may forfeit any deposit paid. Cancellations made with
            sufficient notice will receive a full deposit refund at detailer discretion.
          </Section>

          <Section num="6" title="Photo Authorization">
            By submitting this form you authorize the detailer to photograph your aircraft before, during, and after service for
            documentation purposes. Photos may be used by Shiny Jets CRM for anonymous surface condition research only. Photos are
            never sold, shared publicly, or linked to your identity. Shiny Jets CRM is held harmless from any use of photos by
            individual detailing businesses.
          </Section>

          <Section num="7" title="Limitation of Liability">
            Shiny Jets CRM is a software platform connecting aircraft owners with independent detailing professionals. Shiny Jets CRM
            is not responsible for the quality, timeliness, or outcome of any detailing services performed. All service disputes are
            between the customer and the detailing business directly.
          </Section>

          <Section num="8" title="Platform Fee Disclosure">
            A platform fee may apply to transactions processed through Shiny Jets CRM. This fee is non-refundable and disclosed at
            time of payment.
          </Section>

          <Section num="9" title="Card on File">
            By accepting a quote you authorize the detailing business to store your payment method for future service adjustments.
            Your card will only be charged with your explicit approval for each transaction.
          </Section>

          <Section num="10" title="Governing Law">
            These terms are governed by the laws of the State of California. Any disputes shall be resolved through binding arbitration.
          </Section>

        </div>

        <div className="mt-12 pt-6 border-t border-white/10">
          <p className="text-white/30 text-xs">
            These terms were last updated March 2026. For questions contact{' '}
            <a href="mailto:support@shinyjets.com" className="text-[#007CB1] underline">support@shinyjets.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({ num, title, children }) {
  return (
    <div>
      <h2 className="text-white font-medium mb-2">
        <span className="text-[#007CB1] mr-2">{num}.</span>{title}
      </h2>
      <p>{children}</p>
    </div>
  );
}
