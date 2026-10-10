export const metadata = {
  title: 'Terms of Service - Shiny Jets CRM',
  description: 'Terms of Service for Shiny Jets CRM',
};

export default function TermsPage() {
  return (
    <div className="page-transition min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f]">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="mb-8">
          <a href="/" className="text-v-gold hover:text-v-gold text-sm">&larr; Back to Shiny Jets CRM</a>
          <h1 className="text-3xl font-bold text-white mt-4">Terms of Service</h1>
          <p className="text-gray-400 mt-2">Last updated: October 10, 2026</p>
          <p className="text-gray-300 mt-4 text-sm leading-relaxed">
            These terms are the agreement between your detailing business and Shiny Jets CRM, the software.
            The service terms your customers read on a quote or invoice are separate. Those are on the{' '}
            <a href="/legal/quote-terms" className="text-v-gold hover:underline">service terms page</a>.
          </p>
        </div>

        <div className="bg-white rounded-2xl p-8 space-y-8 text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Accepting these terms</h2>
            <p>
              Shiny Jets CRM (&ldquo;Shiny Jets CRM,&rdquo; &ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;the Platform&rdquo;)
              is operated by Vector Aviation Artificial Intelligence. If you use the Platform, you agree to these terms.
              If you do not agree, do not use it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. What the software does</h2>
            <p>
              Shiny Jets CRM is software for aircraft detailing businesses. It helps you quote, invoice, schedule,
              keep customer records, take payments, manage a team, and see business reports.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-3">
              <p className="font-medium text-blue-900 mb-2">Important</p>
              <p className="text-blue-800">
                Shiny Jets CRM is only the software. It does not perform, supervise, or control aircraft detailing.
                It is not an aircraft detailing company, and it does not employ or hire detailers to do the work.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Your account</h2>
            <p className="mb-2">To use Shiny Jets CRM you must:</p>
            <ul className="list-disc ml-6 space-y-1">
              <li>Be at least 18 years old</li>
              <li>Give accurate and complete registration information</li>
              <li>Keep your login private</li>
              <li>Update your information when it changes</li>
              <li>Be responsible for everything done under your account</li>
            </ul>
            <p className="mt-2">
              Do not share your login or let someone else use your account. We may suspend or close an account that breaks these terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Plans and billing</h2>
            <p className="mb-2">
              Shiny Jets CRM has Free, Lite, and Business plans. Paid plans bill monthly, and some bill yearly.
              If you choose a paid plan, you agree that:
            </p>
            <ul className="list-disc ml-6 space-y-1">
              <li>The subscription renews on its own at the end of each billing period, monthly or yearly</li>
              <li>Payment is due at the start of each billing period</li>
              <li>A yearly plan is paid up front for the full year, at a lower rate</li>
              <li>Subscription fees are not refundable, unless the law requires a refund</li>
              <li>We may change prices if we tell you at least 30 days ahead</li>
              <li>If you do not pay, we may move you to the Free plan</li>
              <li>You may cancel at any time. You keep access through the end of the period you already paid for</li>
              <li>We do not refund or credit a partial billing period</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Platform fee</h2>
            <p className="mb-3">
              Shiny Jets CRM charges a platform fee on payments that run through the Platform.
              The rate depends on your plan: 5% on Free, 2% on Lite, and 0% on Business.
              The fee is taken out of those payments automatically.
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="font-bold text-red-900 mb-2">No refund of the platform fee</p>
              <p className="text-red-800">
                Once a service has been performed, the platform fee is not refundable. That stays true if the
                customer is unhappy, if you and your customer disagree, or for any other reason. The fee pays for
                the software, payment tools, hosting, and support, which have already been provided. If you refund
                your customer, that refund is yours to handle. It does not entitle you to a refund of the platform fee.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. You run your own business</h2>
            <div className="bg-v-gold/5 border border-v-gold/20 rounded-lg p-4">
              <p className="font-bold text-v-gold-muted mb-2">Detailers are independent businesses</p>
              <p className="text-v-gold-muted mb-3">
                Detailers who use Shiny Jets CRM are independent businesses. They are not employees, agents,
                representatives, or partners of Vector Aviation Artificial Intelligence. Shiny Jets CRM does not:
              </p>
              <ul className="list-disc ml-6 space-y-1 text-v-gold-muted">
                <li>Employ, hire, or contract detailers to do the work</li>
                <li>Set or control your prices, schedule, or methods</li>
                <li>Supervise or direct any detailing work</li>
                <li>Guarantee the quality, safety, or result of any service</li>
                <li>Say that a detailer has any particular qualification or certificate</li>
                <li>Act as a broker or marketplace for detailing services</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. We are not liable for the detailing work</h2>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="font-bold text-red-900 mb-2">No liability for detailing services</p>
              <p className="text-red-800 mb-3">
                Vector has no liability for work performed by detailers who use the Platform. That includes:
              </p>
              <ul className="list-disc ml-6 space-y-1 text-red-800 mb-3">
                <li>Damage to an aircraft, a vehicle, or other property during or because of detailing</li>
                <li>Injury during or because of detailing</li>
                <li>A customer who is unhappy with the work</li>
                <li>A disagreement about price, scope, or quality</li>
                <li>A detailer who does not do the work that was agreed</li>
                <li>Any other claim that comes from the relationship between a detailer and a customer</li>
              </ul>
              <p className="text-red-800 font-medium">
                You alone are responsible for the quality of your work, for customer disputes, for refunds you
                choose to give, for carrying enough insurance, and for following the law. You agree to hold
                Shiny Jets CRM harmless from claims about detailing services.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Leads stay on the Platform for 12 months</h2>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="font-medium text-gray-900 mb-2">Lead attribution</p>
              <p className="text-gray-700">
                A customer lead that comes through Shiny Jets CRM — including an inquiry, a quote request, a booking,
                or any first contact the Platform made possible — must be handled through the Platform for twelve
                (12) months from that first contact. Taking that lead off the Platform to avoid it is a serious
                breach of these terms. We may close the account and recover the platform fees that apply.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Payments run through Stripe</h2>
            <p>
              Stripe, Inc. processes payments through Stripe Connect. If you use payment features, you also agree to Stripe&apos;s{' '}
              <a href="https://stripe.com/connect-account/legal" className="text-v-gold-dim hover:underline" target="_blank" rel="noreferrer">
                Connected Account Agreement
              </a>{' '}
              and{' '}
              <a href="https://stripe.com/legal" className="text-v-gold-dim hover:underline" target="_blank" rel="noreferrer">
                Terms of Service
              </a>.
              Shiny Jets CRM is not responsible for Stripe being down, for processing delays, or for a dispute between you and Stripe.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">10. How you may not use the Platform</h2>
            <p className="mb-2">You agree not to:</p>
            <ul className="list-disc ml-6 space-y-1">
              <li>Use the Platform for anything illegal</li>
              <li>Misstate who you are, what you are qualified to do, or what you offer</li>
              <li>Send a quote or invoice that is false or misleading</li>
              <li>Interfere with or disrupt the Platform</li>
              <li>Try to get into another account or system without permission</li>
              <li>Scrape, harvest, or collect data from the Platform without permission</li>
              <li>Send spam or other unsolicited messages</li>
              <li>Reverse engineer, decompile, or take apart any part of the Platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">11. Our content, your license, and feedback</h2>
            <p className="mb-3">
              The Platform and everything in it — software, text, graphics, logos, design, courses, curricula,
              training materials, standard operating procedures (SOPs), checklists, templates, documentation, and
              videos (together, the &ldquo;Materials&rdquo;) — belong to Vector Aviation Artificial Intelligence LLC,
              the operator of Shiny Jets CRM. Copyright, trademark, and other intellectual-property laws protect them.
            </p>
            <p className="mb-3">
              We give you a limited license to use the Platform and the Materials only for your own business, only
              while your access is active. The license is not exclusive, you cannot transfer it, and we can revoke it.
              The same license applies on every plan (Free, Starter, Pro, Business, and Enterprise) and no matter how
              you got access: bought directly, bought in our store, or given to you, including CRM access that comes
              with a course. Complimentary access is a license, not ownership, and we can revoke it if you break these terms.
            </p>
            <p className="mb-3">You may not, and you may not help anyone else to:</p>
            <ul className="list-disc ml-6 space-y-1">
              <li>Copy, reproduce, distribute, sell, resell, sublicense, or publicly display the Platform or the Materials</li>
              <li>Share, transfer, or resell account access or a login</li>
              <li>Scrape, harvest, or bulk-export the Platform or the Materials, including with bots or AI tools</li>
              <li>Use the Platform or the Materials to build or train a competing product, service, course, or training program</li>
              <li>Make derivative works from the Materials</li>
              <li>Remove or change proprietary notices</li>
            </ul>
            <p className="mb-3">
              If you send us an idea, suggestion, feature request, or other feedback (&ldquo;Feedback&rdquo;), you do it
              voluntarily and not in confidence. We may use, change, and sell it with no duty to credit you or pay you.
              You assign to Vector Aviation Artificial Intelligence LLC all rights in that Feedback and in anything we
              build from it. This applies on every plan, including Enterprise. This paragraph does not take ownership of
              your business data. Section 12 covers that data.
            </p>
            <p className="mb-3">
              These limits continue after your account ends. Breaking them is a serious breach and an infringement of
              our intellectual property. We keep every remedy the law allows, including ending your access immediately.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">12. Your data, and the license you give us</h2>
            <p className="mb-3">
              You own the data you put into the Platform, including customer information, quotes, invoices, and business records.
            </p>
            <p className="mb-3">
              You give Vector Aviation Artificial Intelligence LLC a license to collect, store, process, and use
              anonymized, aggregated data from how you use the Platform. We may use it for analytics, to improve the
              product, for industry benchmarks, and for commercial purposes, including selling, licensing, or otherwise
              transferring that aggregated data. The license is perpetual, irrevocable, non-exclusive, royalty-free,
              worldwide, sublicensable, and transferable.
            </p>
            <p className="mb-3">
              This license, and the anonymized data sets made under it, continue after your account ends. We may assign
              them to a buyer or successor in a merger, acquisition, financing, reorganization, or sale of all or
              substantially all of the assets or equity of Vector Aviation Artificial Intelligence LLC. That successor
              may keep using every right in this section.
            </p>
            <p>
              This license covers only anonymized and aggregated data. Data that identifies your business stays under
              your control and is used only to provide the Platform to you.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">13. Combined data is not tied to you</h2>
            <p className="mb-3">
              We may combine and anonymize data from all users to make industry reports, benchmarks, and analytics.
              We may share or sell that data for research, analytics, or commercial purposes.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="font-medium text-blue-900 mb-2">No one is named</p>
              <p className="text-blue-800">
                Data we share or sell is never tied to a particular account, user, or business. We use technical and
                organizational measures so a recipient cannot work backward to identify an account.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">14. Messages we send for you</h2>
            <p>
              We may send messages for you, such as quote emails, through other companies&apos; services. You are
              responsible for following the law on electronic messages, including the CAN-SPAM Act. You confirm that
              you have the recipient&apos;s permission before you send through the Platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">15. No warranty</h2>
            <p>
              THE PLATFORM IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE,&rdquo; WITH NO WARRANTY OF ANY KIND,
              EXPRESS OR IMPLIED. THAT INCLUDES ANY IMPLIED WARRANTY OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
              PURPOSE, AND NON-INFRINGEMENT. WE DO NOT PROMISE THAT THE PLATFORM WILL BE UNINTERRUPTED, ERROR-FREE, OR
              SECURE. VECTOR MAKES NO WARRANTY ABOUT THE QUALITY, ACCURACY, OR RELIABILITY OF ANY QUOTE, INVOICE, OR
              CALCULATION THE PLATFORM PRODUCES.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">16. Limit on our liability</h2>
            <p>
              TO THE MAXIMUM EXTENT THE LAW ALLOWS, VECTOR AVIATION ARTIFICIAL INTELLIGENCE AND ITS OFFICERS, DIRECTORS,
              EMPLOYEES, AND AGENTS ARE NOT LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.
              THAT INCLUDES LOST PROFITS, LOST DATA, AND LOST BUSINESS OPPORTUNITIES, ARISING OUT OF OR RELATED TO YOUR
              USE OF THE PLATFORM. OUR TOTAL LIABILITY WILL NOT EXCEED THE SUBSCRIPTION FEES YOU PAID US IN THE TWELVE
              (12) MONTHS BEFORE THE CLAIM.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">17. You protect us from claims</h2>
            <p>
              You agree to indemnify, defend, and hold harmless Vector Aviation Artificial Intelligence and its
              affiliates, officers, directors, employees, and agents from claims, damages, losses, liabilities, costs,
              and expenses (including reasonable attorneys&apos; fees) that come from: (a) your use of the Platform;
              (b) detailing work you do or fail to do; (c) a dispute between you and your customers; (d) your breaking
              these terms; (e) your breaking any law; or (f) your infringing someone else&apos;s rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">18. Ending the agreement</h2>
            <p className="mb-2">
              Either of us may end this agreement at any time. You may cancel in the Platform settings. We may suspend
              or end your access if you break these terms, or for any other reason, with or without notice.
            </p>
            <p className="mb-2">
              When the agreement ends, your right to use the Platform ends immediately. You may ask for an export of
              your data within 30 days by emailing{' '}
              <a href="mailto:support@shinyjets.com" className="text-v-gold-dim hover:underline">
                support@shinyjets.com
              </a>.
              After 30 days, we may delete your data permanently.
            </p>
            <p>
              Sections 5, 6, 7, 8, 11, 12, 13, 15, 16, 17, 19, 22, and 24 still apply after the agreement ends.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">19. California law and arbitration in San Diego</h2>
            <p>
              These terms follow the laws of the State of California, without regard to conflict-of-law rules. A dispute
              under these terms is resolved by binding arbitration with the American Arbitration Association under its
              Commercial Arbitration Rules. The arbitration is held in San Diego, California, or remotely if the arbitrator decides
              that. You give up any right to take part in a class action or a class-wide arbitration. Each side pays
              its own costs and attorneys&apos; fees, unless the arbitrator decides otherwise.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">20. Changes to these terms</h2>
            <p>
              We may change these terms. We will give at least 30 days&apos; notice before a material change, by email
              or by a notice on the Platform. For a significant update, we may ask you to accept the new terms before
              you keep using the Platform. If you keep using the Platform after the notice period, you accept the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">21. Accessibility</h2>
            <p>
              Vector Aviation Artificial Intelligence LLC wants the Platform to be usable by people with disabilities.
              We keep improving it and we apply the relevant accessibility standards so people have equal access.
            </p>
            <p className="mt-2">
              We aim to meet Web Content Accessibility Guidelines (WCAG) 2.1 Level AA. If you cannot use part of the
              Platform, email{' '}
              <a href="mailto:support@shinyjets.com" className="text-v-gold-dim hover:underline">
                support@shinyjets.com
              </a>{' '}
              and we will work with you to provide the information or service another way that you can use.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">22. Chargebacks</h2>
            <p className="mb-3">
              <strong>Who processes the payment:</strong> Stripe, Inc. processes payments. Vector Aviation Artificial
              Intelligence LLC only provides the software. Shiny Jets CRM is not a party to a payment between a detailer
              and that detailer&apos;s customer.
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-3">
              <p className="font-bold text-red-900 mb-2">You handle chargebacks</p>
              <p className="text-red-800 mb-2">
                You are solely responsible for chargebacks, disputes, and refunds your customers start. By using
                Shiny Jets CRM you agree to:
              </p>
              <ul className="list-disc ml-6 space-y-1 text-red-800">
                <li>Answer every Stripe chargeback notice in the time Stripe requires</li>
                <li>Give Stripe evidence to fight a chargeback that is not legitimate</li>
                <li>Keep accurate service records and customer messages to use as evidence</li>
                <li>Indemnify and hold harmless Vector Aviation Artificial Intelligence LLC from chargeback losses, fees, or penalties</li>
              </ul>
            </div>
            <p className="mb-3">
              <strong>Platform fee stays paid:</strong> The Shiny Jets CRM platform fee is not refundable because of a
              chargeback or a dispute between you and a customer.
            </p>
            <p>
              <strong>Stripe&apos;s terms:</strong> Payment processing also follows Stripe&apos;s{' '}
              <a href="https://stripe.com/legal" className="text-v-gold-dim hover:underline" target="_blank" rel="noreferrer">
                Terms of Service
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">23. Points and rewards</h2>
            <p>
              Shiny Jets CRM has a points rewards program (&ldquo;Rewards Program&rdquo;) on these rules:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>You earn 200 points per $1.00 USD in booked services, plus bonus points for qualifying actions.</li>
              <li>Points have no cash value. You cannot trade them for money, give them to another user, or sell them.</li>
              <li>200 points equals $1.00 in credit, and that credit can be used only on items in the Shiny Jets CRM reward catalog.</li>
              <li>Only Lite and Business users can redeem. Free users can collect points but cannot redeem until they upgrade.</li>
              <li>Your plan multiplies points: Lite 1.5x, Business 2.0x.</li>
              <li>We may change the conversion rate, the catalog, or these program rules with 30 days&apos; notice.</li>
              <li>If we close an account for breaking these terms, that account&apos;s points may be forfeited.</li>
              <li>A redemption is final. Rewards depend on availability and on how long fulfillment takes.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">24. Assignment and a change of control</h2>
            <p className="mb-3">
              You may not assign or transfer these terms, or your rights or duties under them, without our written
              consent first. An assignment that breaks this section is void.
            </p>
            <p className="mb-3">
              Vector Aviation Artificial Intelligence LLC may assign, transfer, or delegate these terms and its rights
              and duties, in whole or in part, without your consent and without notice. That includes a merger,
              acquisition, financing, reorganization, change of control, or a sale of all or substantially all of its
              assets or equity.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="font-medium text-blue-900 mb-2">Data and the Platform can transfer</p>
              <p className="text-blue-800">
                In a transaction like that, the anonymized and aggregated data sets, the licenses in Sections 12 and 13,
                your account data, and the other Platform assets may move to the successor. That successor may use every
                right these terms give Vector Aviation Artificial Intelligence LLC. These terms bind and benefit the
                parties and their successors and permitted assigns.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">25. Contact</h2>
            <p>Questions about these Terms of Service:</p>
            <p className="mt-2">
              Vector Aviation Artificial Intelligence LLC<br />
              Email:{' '}
              <a href="mailto:support@shinyjets.com" className="text-v-gold-dim hover:underline">
                support@shinyjets.com
              </a>
            </p>
          </section>
        </div>

        <div className="mt-8 text-center text-sm text-gray-500">
          <a href="/privacy" className="hover:text-gray-300 transition-colors">Privacy Policy</a>
          <span className="mx-2">&middot;</span>
          <a href="/legal/quote-terms" className="hover:text-gray-300 transition-colors">Quote and invoice service terms</a>
          <span className="mx-2">&middot;</span>
          <a href="/" className="hover:text-gray-300 transition-colors">Back to Shiny Jets CRM</a>
        </div>
      </div>
    </div>
  );
}
