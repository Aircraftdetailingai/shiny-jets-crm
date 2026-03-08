export const metadata = {
  title: 'Privacy Policy - Vector',
  description: 'Privacy Policy for Vector Aviation Software',
};

export default function PrivacyPage() {
  return (
    <div className="page-transition min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f]">
      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <a href="/" className="text-amber-400 hover:text-amber-300 text-sm">&larr; Back to Vector</a>
          <h1 className="text-3xl font-bold text-white mt-4">Privacy Policy</h1>
          <p className="text-gray-400 mt-2">Last updated: March 7, 2026</p>
        </div>

        <div className="bg-white rounded-2xl p-8 space-y-8 text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Introduction</h2>
            <p>
              Vector Aviation Artificial Intelligence (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) operates Vector Aviation Software
              (&ldquo;Vector&rdquo; or &ldquo;the Platform&rdquo;). This Privacy Policy explains how we collect, use,
              disclose, and safeguard your information when you use our Platform. By using Vector,
              you consent to the practices described in this policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Information We Collect</h2>

            <h3 className="font-medium text-gray-800 mt-4 mb-2">2.1 Information You Provide</h3>
            <ul className="list-disc ml-6 space-y-1">
              <li>Account information: name, email address, phone number, company name</li>
              <li>Business information: services offered, hourly rates, service areas</li>
              <li>Customer data: names, email addresses, phone numbers, aircraft details</li>
              <li>Financial information: bank account details (processed securely via Stripe)</li>
              <li>Payment information: billing address, subscription plan selection</li>
              <li>Quotes, invoices, and transaction records</li>
              <li>Communications sent through the Platform</li>
            </ul>

            <h3 className="font-medium text-gray-800 mt-4 mb-2">2.2 Information Collected Automatically</h3>
            <ul className="list-disc ml-6 space-y-1">
              <li>Device information: browser type, operating system, device identifiers</li>
              <li>Usage data: pages visited, features used, time spent on the Platform</li>
              <li>IP address and approximate location</li>
              <li>Cookies and similar tracking technologies</li>
            </ul>

            <h3 className="font-medium text-gray-800 mt-4 mb-2">2.3 Information from Third Parties</h3>
            <ul className="list-disc ml-6 space-y-1">
              <li>Payment information from Stripe (transaction status, not full card numbers)</li>
              <li>Aircraft data from public aviation databases</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. How We Use Your Information</h2>
            <p className="mb-2">We use collected information to:</p>
            <ul className="list-disc ml-6 space-y-1">
              <li>Provide, maintain, and improve the Platform</li>
              <li>Process quotes, invoices, and payments</li>
              <li>Send transactional communications (quote notifications, payment confirmations)</li>
              <li>Process billing and subscription management</li>
              <li>Provide customer support</li>
              <li>Generate anonymized analytics and industry benchmarks</li>
              <li>Detect and prevent fraud or unauthorized access</li>
              <li>Comply with legal obligations</li>
              <li>Send product updates and marketing communications (with your consent)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. How We Share Your Information</h2>
            <p className="mb-2">We do not sell your personal information. We may share information with:</p>
            <ul className="list-disc ml-6 space-y-2">
              <li>
                <strong>Stripe, Inc.</strong> &mdash; for payment processing. Stripe&apos;s handling of your data
                is governed by their{' '}
                <a href="https://stripe.com/privacy" className="text-amber-600 hover:underline" target="_blank" rel="noreferrer">
                  Privacy Policy
                </a>.
              </li>
              <li>
                <strong>Resend</strong> &mdash; for email delivery. Only email addresses and message
                content are shared as needed to deliver emails.
              </li>
              <li>
                <strong>Supabase, Inc.</strong> &mdash; for database hosting and authentication.
                Data is stored on secure, encrypted servers.
              </li>
              <li>
                <strong>Twilio, Inc.</strong> &mdash; for SMS delivery (when SMS features are available).
                Only phone numbers and message content are shared as needed to deliver messages.
              </li>
              <li>
                <strong>Vercel, Inc.</strong> &mdash; for hosting and infrastructure.
              </li>
              <li>
                <strong>Your customers</strong> &mdash; when you send quotes, invoices, or messages
                through the Platform, the relevant information is shared with the recipient.
              </li>
              <li>
                <strong>Law enforcement</strong> &mdash; when required by law, subpoena, or court order.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Data Security</h2>
            <p>
              We implement industry-standard security measures to protect your data, including:
            </p>
            <ul className="list-disc ml-6 space-y-1 mt-2">
              <li>Encryption in transit (TLS/SSL) and at rest</li>
              <li>Secure authentication with JWT tokens</li>
              <li>Secure server infrastructure hosted by trusted cloud providers</li>
              <li>Regular security audits and monitoring</li>
              <li>Role-based access controls</li>
              <li>PCI-compliant payment processing through Stripe</li>
            </ul>
            <p className="mt-2">
              No method of electronic storage is 100% secure. While we strive to protect your
              data, we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Data Retention</h2>
            <p>
              We retain your account data for as long as your account is active. After account
              deletion, we retain data for up to 90 days for backup and recovery purposes,
              after which it is permanently deleted. Transaction records may be retained longer
              as required by tax and financial regulations. Anonymized and aggregated data may
              be retained indefinitely for analytics purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Your Rights</h2>
            <p className="mb-2">Depending on your location, you may have the right to:</p>
            <ul className="list-disc ml-6 space-y-1">
              <li><strong>Access</strong> &mdash; request a copy of the personal data we hold about you</li>
              <li><strong>Correction</strong> &mdash; request correction of inaccurate data</li>
              <li><strong>Deletion</strong> &mdash; request deletion of your personal data</li>
              <li><strong>Export</strong> &mdash; request your data in a machine-readable format for portability</li>
              <li><strong>Opt-out</strong> &mdash; opt out of marketing communications at any time</li>
              <li><strong>Restriction</strong> &mdash; request we limit how we use your data</li>
            </ul>
            <p className="mt-2">
              To exercise any of these rights, contact us at{' '}
              <a href="mailto:support@vectorav.ai" className="text-amber-600 hover:underline">
                support@vectorav.ai
              </a>.
              We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Cookies</h2>
            <p>
              Vector uses essential cookies and local storage to maintain your session and
              preferences. We do not use third-party advertising cookies or tracking pixels.
              Essential cookies are required for the Platform to function and cannot be disabled.
              These include:
            </p>
            <ul className="list-disc ml-6 space-y-1 mt-2">
              <li>Session cookies to keep you logged in</li>
              <li>Preference cookies to remember your settings (language, currency, display options)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Children&apos;s Privacy</h2>
            <p>
              Vector is not intended for use by individuals under 18 years of age. We do not
              knowingly collect personal information from children. If we learn that we have
              collected data from a child under 18, we will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">10. California Privacy Rights (CCPA)</h2>
            <p>
              If you are a California resident, you have the right to know what personal information
              we collect, request deletion, and opt out of the sale of personal information.
              We do not sell personal information. To exercise your California privacy rights,
              contact us at{' '}
              <a href="mailto:support@vectorav.ai" className="text-amber-600 hover:underline">
                support@vectorav.ai
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">11. International Data Transfers</h2>
            <p>
              Your data may be processed and stored in the United States. By using the Platform,
              you consent to the transfer and processing of your data in the United States.
              We ensure appropriate safeguards are in place for any international data transfers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">12. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Material changes will be
              communicated via email or through a notice on the Platform. The &ldquo;Last updated&rdquo;
              date at the top of this page indicates when the policy was last revised.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">13. Contact Us</h2>
            <p>
              For questions or concerns about this Privacy Policy or our data practices, contact us at:
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
          <a href="/terms" className="hover:text-gray-300 transition-colors">Terms of Service</a>
          <span className="mx-2">&middot;</span>
          <a href="/" className="hover:text-gray-300 transition-colors">Back to Vector</a>
        </div>
      </div>
    </div>
  );
}
