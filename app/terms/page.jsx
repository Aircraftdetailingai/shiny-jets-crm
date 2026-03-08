export const metadata = {
  title: 'Terms of Service - Vector',
  description: 'Terms of Service for Vector Aviation Software',
};

export default function TermsPage() {
  return (
    <div className="page-transition min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f]">
      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <a href="/" className="text-amber-400 hover:text-amber-300 text-sm">&larr; Back to Vector</a>
          <h1 className="text-3xl font-bold text-white mt-4">Terms of Service</h1>
          <p className="text-gray-400 mt-2">Last updated: March 7, 2026</p>
        </div>

        <div className="bg-white rounded-2xl p-8 space-y-8 text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Vector Aviation Software ("Vector," "we," "our," or "the Platform"),
              operated by Vector Aviation Artificial Intelligence, you agree to be bound by these Terms of Service.
              If you do not agree to these terms, do not use the Platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Description of Service</h2>
            <p>
              Vector is a software-as-a-service (SaaS) platform that provides aircraft detailing
              professionals with tools for quoting, invoicing, scheduling, customer management,
              payment processing, and business analytics. The Platform connects detailers with
              aircraft owners and operators to facilitate detailing services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Account Registration</h2>
            <p className="mb-2">To use Vector, you must:</p>
            <ul className="list-disc ml-6 space-y-1">
              <li>Be at least 18 years of age</li>
              <li>Provide accurate and complete registration information</li>
              <li>Maintain the security of your account credentials</li>
              <li>Promptly update any changes to your information</li>
              <li>Accept responsibility for all activity under your account</li>
            </ul>
            <p className="mt-2">
              You may not share your account credentials or allow others to access your account.
              We reserve the right to suspend or terminate accounts that violate these terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Subscription Plans and Billing</h2>
            <p className="mb-2">
              Vector offers multiple subscription tiers (Free, Pro, Business, and Enterprise).
              By selecting a paid plan, you agree to the following:
            </p>
            <ul className="list-disc ml-6 space-y-1">
              <li>Subscriptions are billed monthly unless otherwise stated</li>
              <li>Payment is due at the beginning of each billing cycle</li>
              <li>All fees are non-refundable unless required by law</li>
              <li>We may change pricing with 30 days advance notice</li>
              <li>Failure to pay may result in downgrade to the Free tier</li>
              <li>You may cancel your subscription at any time; access continues through the end of the billing period</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Platform Fees</h2>
            <p>
              Vector charges a platform fee on transactions processed through the Platform.
              The fee rate depends on your subscription tier (5% for Free, 2% for Pro, 1% for
              Business, and 0% for Enterprise). Platform fees are automatically deducted from payments
              processed through our integrated payment system. You acknowledge and agree to the
              applicable platform fee for your subscription tier.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Customer Leads and Platform Exclusivity</h2>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="font-medium text-amber-900 mb-2">Important Lead Attribution Clause:</p>
              <p className="text-amber-800">
                Customer leads generated through Vector&mdash;including but not limited to inquiries,
                quote requests, bookings, and any first contact facilitated by the Platform&mdash;must
                be processed through the Platform for a period of twelve (12) months from the date of
                first contact. This includes all subsequent quotes, invoices, payments, and service
                engagements with that customer during the 12-month period.
              </p>
              <p className="text-amber-800 mt-2">
                "Generated through Vector" means any customer who first discovers or engages with
                your services via a Vector-hosted quote page, embedded widget, lead intake form,
                customer portal, or any other Platform feature. Circumventing this requirement by
                processing Vector-generated leads outside the Platform constitutes a material breach
                of these Terms and may result in account termination and recovery of applicable
                platform fees.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Payment Processing</h2>
            <p>
              Payment processing is provided by Stripe, Inc. through Stripe Connect. By using
              Vector's payment features, you also agree to Stripe's{' '}
              <a href="https://stripe.com/connect-account/legal" className="text-amber-600 hover:underline" target="_blank" rel="noreferrer">
                Connected Account Agreement
              </a>{' '}
              and{' '}
              <a href="https://stripe.com/legal" className="text-amber-600 hover:underline" target="_blank" rel="noreferrer">
                Terms of Service
              </a>.
              Vector is not responsible for Stripe's service availability, processing delays,
              or any disputes between you and Stripe.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">8. User Conduct</h2>
            <p className="mb-2">You agree not to:</p>
            <ul className="list-disc ml-6 space-y-1">
              <li>Use the Platform for any unlawful purpose</li>
              <li>Misrepresent your identity, qualifications, or services</li>
              <li>Submit false or misleading quotes or invoices</li>
              <li>Interfere with or disrupt the Platform's functionality</li>
              <li>Attempt to gain unauthorized access to other accounts or systems</li>
              <li>Scrape, harvest, or collect data from the Platform without authorization</li>
              <li>Use the Platform to send spam or unsolicited communications</li>
              <li>Reverse engineer, decompile, or disassemble any part of the Platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Intellectual Property</h2>
            <p>
              All content, features, and functionality of the Platform&mdash;including but not
              limited to software, text, graphics, logos, and design&mdash;are the exclusive
              property of Vector Aviation Artificial Intelligence and are protected by copyright, trademark,
              and other intellectual property laws. You are granted a limited, non-exclusive,
              non-transferable license to use the Platform for its intended purpose during
              your active subscription.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">10. Data Ownership</h2>
            <p>
              You retain ownership of all data you input into the Platform, including customer
              information, quotes, invoices, and business records. You grant Vector a limited
              license to use this data solely to provide and improve the Platform's services.
              We may use anonymized and aggregated data for analytics, benchmarking, and
              product improvement purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">11. SMS and Communications</h2>
            <p>
              If you use Vector's SMS features (available on Business and Enterprise plans),
              you are responsible for ensuring compliance with applicable telecommunications
              laws, including the Telephone Consumer Protection Act (TCPA). You represent that
              you have obtained proper consent from recipients before sending SMS messages
              through the Platform. Vector is not liable for any claims arising from your
              SMS communications.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">12. Disclaimer of Warranties</h2>
            <p>
              THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND,
              EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF
              MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
              WE DO NOT WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">13. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, AIRCRAFT DETAILING 101, LLC AND ITS
              OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT,
              INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED
              TO LOSS OF PROFITS, DATA, OR BUSINESS OPPORTUNITIES, ARISING OUT OF OR RELATED TO
              YOUR USE OF THE PLATFORM. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID
              TO US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">14. Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless Vector Aviation Artificial Intelligence and
              its affiliates from any claims, damages, losses, or expenses (including reasonable
              attorneys' fees) arising from your use of the Platform, violation of these Terms,
              or infringement of any third-party rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">15. Termination</h2>
            <p>
              We may suspend or terminate your access to the Platform at any time for violation
              of these Terms or for any other reason at our sole discretion, with or without
              notice. Upon termination, your right to use the Platform ceases immediately.
              Sections 6, 9, 10, 12, 13, 14, and 16 survive termination.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">16. Governing Law and Dispute Resolution</h2>
            <p>
              These Terms are governed by the laws of the State of Arizona, without regard to
              conflict of law principles. Any disputes arising under these Terms shall be resolved
              through binding arbitration in Maricopa County, Arizona, in accordance with the
              rules of the American Arbitration Association. You waive any right to participate
              in a class action lawsuit or class-wide arbitration.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">17. Changes to Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. Material changes will be
              communicated via email or through a notice on the Platform. Your continued use of
              the Platform after changes are posted constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">18. Contact Information</h2>
            <p>
              For questions about these Terms of Service, contact us at:
            </p>
            <p className="mt-2">
              Vector Aviation Artificial Intelligence<br />
              Email:{' '}
              <a href="mailto:support@vectorav.ai" className="text-amber-600 hover:underline">
                support@vectorav.ai
              </a>
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <a href="/privacy" className="hover:text-gray-300 transition-colors">Privacy Policy</a>
          <span className="mx-2">&middot;</span>
          <a href="/" className="hover:text-gray-300 transition-colors">Back to Vector</a>
        </div>
      </div>
    </div>
  );
}
