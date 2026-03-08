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
              By accessing or using Vector Aviation Software (&ldquo;Vector,&rdquo; &ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;the Platform&rdquo;),
              operated by Vector Aviation Artificial Intelligence, you agree to be bound by these Terms of Service.
              If you do not agree to these terms, do not use the Platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Description of Service</h2>
            <p>
              Vector is a software-as-a-service (SaaS) platform designed for aircraft detailing
              businesses. The Platform provides tools for quoting, invoicing, scheduling, customer
              management, payment processing, team management, and business analytics.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-3">
              <p className="font-medium text-blue-900 mb-2">Important:</p>
              <p className="text-blue-800">
                Vector is solely a software platform. Vector does not perform, supervise, or control
                any aircraft detailing services. Vector is not an aircraft detailing company and does
                not employ or contract detailers to perform services.
              </p>
            </div>
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
              Vector offers multiple subscription tiers (Free, Pro, Business, and Enterprise)
              with both monthly and annual billing options. By selecting a paid plan, you agree to
              the following:
            </p>
            <ul className="list-disc ml-6 space-y-1">
              <li>Subscriptions automatically renew at the end of each billing cycle (monthly or annual)</li>
              <li>Payment is due at the beginning of each billing cycle</li>
              <li>Annual plans are billed upfront for the full year at a discounted rate</li>
              <li>All subscription fees are non-refundable unless required by law</li>
              <li>We may change pricing with 30 days advance notice</li>
              <li>Failure to pay may result in downgrade to the Free tier</li>
              <li>You may cancel your subscription at any time; access continues through the end of the current billing period</li>
              <li>No refunds or credits are issued for partial billing periods</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Platform Fees</h2>
            <p className="mb-3">
              Vector charges a platform fee on transactions processed through the Platform.
              The fee rate depends on your subscription tier (5% for Free, 2% for Pro, 1% for
              Business, and 0% for Enterprise). Platform fees are automatically deducted from
              payments processed through our integrated payment system.
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="font-bold text-red-900 mb-2">NO REFUNDS ON PLATFORM FEES:</p>
              <p className="text-red-800">
                Platform fees are NON-REFUNDABLE once a service has been performed, regardless of
                customer satisfaction, disputes between the detailer and their customer, or any other
                circumstance. Platform fees compensate Vector for providing the software platform,
                payment processing infrastructure, hosting, and support&mdash;services that have
                already been delivered at the time of the transaction. Refunds or adjustments between
                a detailer and their customer are the sole responsibility of the detailer and do not
                entitle the detailer to a refund of platform fees.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Independent Contractor Relationship</h2>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="font-bold text-amber-900 mb-2">Detailers Are Independent Businesses:</p>
              <p className="text-amber-800 mb-3">
                Detailers who use Vector are independent contractors and independent business operators.
                They are NOT employees, agents, representatives, or partners of Vector Aviation
                Artificial Intelligence. Vector does not:
              </p>
              <ul className="list-disc ml-6 space-y-1 text-amber-800">
                <li>Employ, hire, or contract detailers to perform services</li>
                <li>Set or control detailer pricing, schedules, or work methods</li>
                <li>Supervise, direct, or oversee any detailing work</li>
                <li>Guarantee the quality, safety, or outcome of any services</li>
                <li>Represent that detailers have any specific qualifications or certifications</li>
                <li>Act as an intermediary, broker, or marketplace for detailing services</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Hold Harmless and Limitation of Liability for Services</h2>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="font-bold text-red-900 mb-2 uppercase">Zero Liability for Detailing Services:</p>
              <p className="text-red-800 mb-3">
                VECTOR HAS ABSOLUTELY ZERO LIABILITY FOR ANY WORK PERFORMED BY DETAILERS USING THE
                PLATFORM. This includes but is not limited to:
              </p>
              <ul className="list-disc ml-6 space-y-1 text-red-800 mb-3">
                <li>Damage to aircraft, vehicles, or property during or resulting from detailing services</li>
                <li>Personal injury occurring during or resulting from detailing services</li>
                <li>Dissatisfaction with the quality of detailing services performed</li>
                <li>Disputes between detailers and their customers regarding pricing, scope, or quality</li>
                <li>Failure of a detailer to perform agreed-upon services</li>
                <li>Any claims, losses, or damages arising from the detailer-customer relationship</li>
              </ul>
              <p className="text-red-800 font-medium">
                Detailers are solely and exclusively responsible for the quality of their work,
                handling all customer disputes, issuing refunds to their customers when appropriate,
                maintaining adequate insurance, and complying with all applicable laws and regulations.
                You agree to hold Vector harmless from any and all claims related to detailing services.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Customer Leads and Platform Exclusivity</h2>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="font-medium text-gray-900 mb-2">Lead Attribution:</p>
              <p className="text-gray-700">
                Customer leads generated through Vector&mdash;including but not limited to inquiries,
                quote requests, bookings, and any first contact facilitated by the Platform&mdash;must
                be processed through the Platform for a period of twelve (12) months from the date of
                first contact. Circumventing this requirement by processing Vector-generated leads
                outside the Platform constitutes a material breach of these Terms and may result in
                account termination and recovery of applicable platform fees.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Payment Processing</h2>
            <p>
              Payment processing is provided by Stripe, Inc. through Stripe Connect. By using
              Vector&apos;s payment features, you also agree to Stripe&apos;s{' '}
              <a href="https://stripe.com/connect-account/legal" className="text-amber-600 hover:underline" target="_blank" rel="noreferrer">
                Connected Account Agreement
              </a>{' '}
              and{' '}
              <a href="https://stripe.com/legal" className="text-amber-600 hover:underline" target="_blank" rel="noreferrer">
                Terms of Service
              </a>.
              Vector is not responsible for Stripe&apos;s service availability, processing delays,
              or any disputes between you and Stripe.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">10. User Conduct</h2>
            <p className="mb-2">You agree not to:</p>
            <ul className="list-disc ml-6 space-y-1">
              <li>Use the Platform for any unlawful purpose</li>
              <li>Misrepresent your identity, qualifications, or services</li>
              <li>Submit false or misleading quotes or invoices</li>
              <li>Interfere with or disrupt the Platform&apos;s functionality</li>
              <li>Attempt to gain unauthorized access to other accounts or systems</li>
              <li>Scrape, harvest, or collect data from the Platform without authorization</li>
              <li>Use the Platform to send spam or unsolicited communications</li>
              <li>Reverse engineer, decompile, or disassemble any part of the Platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">11. Intellectual Property</h2>
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
            <h2 className="text-xl font-semibold text-gray-900 mb-3">12. Data Ownership</h2>
            <p>
              You retain ownership of all data you input into the Platform, including customer
              information, quotes, invoices, and business records. You grant Vector a limited
              license to use this data solely to provide and improve the Platform&apos;s services.
              We may use anonymized and aggregated data for analytics, benchmarking, and
              product improvement purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">13. Communications</h2>
            <p>
              Vector may send communications on your behalf (such as quote emails) through
              third-party services. You are responsible for ensuring compliance with applicable
              laws regarding electronic communications, including the CAN-SPAM Act. You represent
              that you have obtained proper consent from recipients before sending communications
              through the Platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">14. Disclaimer of Warranties</h2>
            <p>
              THE PLATFORM IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND,
              EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF
              MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
              WE DO NOT WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
              VECTOR MAKES NO WARRANTY REGARDING THE QUALITY, ACCURACY, OR RELIABILITY OF ANY
              QUOTES, INVOICES, OR CALCULATIONS GENERATED THROUGH THE PLATFORM.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">15. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, VECTOR AVIATION ARTIFICIAL INTELLIGENCE AND ITS
              OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT,
              INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED
              TO LOSS OF PROFITS, DATA, OR BUSINESS OPPORTUNITIES, ARISING OUT OF OR RELATED TO
              YOUR USE OF THE PLATFORM. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID
              TO US IN SUBSCRIPTION FEES IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">16. Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless Vector Aviation Artificial Intelligence
              and its affiliates, officers, directors, employees, and agents from any and all claims,
              damages, losses, liabilities, costs, or expenses (including reasonable attorneys&apos; fees)
              arising from: (a) your use of the Platform; (b) any detailing services you perform or
              fail to perform; (c) any dispute between you and your customers; (d) your violation of
              these Terms; (e) your violation of any applicable law or regulation; or (f) any
              infringement of any third-party rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">17. Termination</h2>
            <p className="mb-2">
              Either party may terminate this agreement at any time. You may cancel your subscription
              through the Platform settings. We may suspend or terminate your access for violation
              of these Terms or for any other reason at our sole discretion, with or without notice.
            </p>
            <p className="mb-2">
              Upon termination, your right to use the Platform ceases immediately. You may request
              an export of your data within 30 days of termination by contacting{' '}
              <a href="mailto:support@vectorav.ai" className="text-amber-600 hover:underline">
                support@vectorav.ai
              </a>.
              After 30 days, your data may be permanently deleted.
            </p>
            <p>
              Sections 5, 6, 7, 8, 11, 14, 15, 16, and 18 survive termination.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">18. Governing Law and Dispute Resolution</h2>
            <p>
              These Terms are governed by the laws of the State of Wyoming, without regard to
              conflict of law principles. Any disputes arising under these Terms shall be resolved
              through binding arbitration administered by the American Arbitration Association in
              accordance with its Commercial Arbitration Rules. The arbitration shall take place in
              Wyoming or remotely at the arbitrator&apos;s discretion. You waive any right to participate
              in a class action lawsuit or class-wide arbitration. Each party shall bear its own
              costs and attorneys&apos; fees, unless the arbitrator determines otherwise.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">19. Changes to Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. Material changes will be
              communicated via email or through a notice on the Platform. Your continued use of
              the Platform after changes are posted constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">20. Contact Information</h2>
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
