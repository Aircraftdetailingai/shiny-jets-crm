// Aircraft Detailing AI Terms of Service (approved by Brett, Oct 3 2026; ownership, no-copying,
// no-tampering, enforcement and ignored-guidance additions approved Oct 4 2026).
// Same text and version as aircraftdetailing.ai/terms (repo aircraftdetailing-ai, content/terms/adai-terms.md).
// Bump TERMS_VERSION whenever the text changes materially: every user is asked to accept again
// at their next Detailing AI visit, and the chat is blocked until they do.
export const TERMS_VERSION = '2026-10-04';
export const TERMS_LABEL = 'Aircraft Detailing AI Terms';

export const TERMS_TEXT = `AIRCRAFT DETAILING AI TERMS OF SERVICE
Shiny Jets LLC, Threshold Aviation, 8352 Kimball Ave, Chino Airport, Chino, CA. Phone 858-267-4469.

1. Acceptance. You accept these terms when you check "I agree" at purchase and again when you click "I agree" at your first login. We record the date and time of each agreement.

2. Subscription and automatic renewal. Aircraft Detailing AI costs $59.95 per month or $599 per year. Your subscription renews automatically at the same price, charged to your payment method on file, until you cancel. You can cancel anytime in your shinyjets.com account or by calling 858-267-4469. Cancellation takes effect at the end of your current billing period, and you keep access until then.

3. Refunds. Payments are non-refundable once charged, including partial months or years.

4. Ask a Shiny Jets Expert. Each $4.99 purchase covers one answered question. If we don't answer it, you get a refund. Once it's answered, it isn't refundable.

5. AI guidance only. Aircraft Detailing AI gives detailing guidance only. It is not maintenance instructions or airworthiness advice. The aircraft manufacturer's manuals, the operator's maintenance program, and a licensed A&P mechanic always come first. Test every product and method in an inconspicuous area first. You are responsible for the work you perform. If you ignore the AI's warnings, cautions or advice to test a spot first, the result is solely your responsibility.

6. Assumption of risk and hold harmless. You use the service at your own risk. You agree to hold harmless and indemnify Shiny Jets LLC, its owners and its staff from any claims, damage to aircraft or property, injury, or losses that come from your use of the service or work you perform, including any result of ignoring the AI's warnings, cautions or test-spot advice.

7. Limitation of liability. Shiny Jets' total liability for any claim is limited to the amount you paid for the service in the 12 months before the claim. We aren't liable for indirect, incidental or consequential damages.

8. No warranty. The service is provided "as is," with no guarantee that answers are complete, error-free, or uninterrupted.

9. Account and license. One subscription covers one user. Don't share logins, resell answers, or copy or scrape the service. We may suspend accounts that break these rules.

10. Ownership. The AI's answers, methods, SOPs and book content belong to Shiny Jets LLC. Your subscription gives you a license to use them only in your own shop. No other rights are granted to you.

11. No copying or competing use. You may not copy, scrape or bulk download the service or its answers. You may not use any answers to train or build another AI, app, dataset, course, or competing product or service.

12. No tampering. You may not try to extract the AI's instructions or hidden content, reverse engineer the service, or bypass its safeguards or usage limits.

13. Enforcement. If you break section 10, 11 or 12, Shiny Jets may terminate your account immediately with no refund and may pursue damages and any other legal remedies.

14. Photos and questions. You keep ownership of the photos and questions you submit. You allow Shiny Jets to process them to answer you and to use them in de-identified form to improve the service.

15. Changes. We may update these terms. If we make material changes, we'll notify you and ask you to accept them again at login. The effective version of these terms is 2026-10-04.

16. Governing law. These terms are governed by California law, with any dispute heard in San Bernardino County, California.

17. Contact. Shiny Jets LLC, 858-267-4469.
`;

// Line 1 = title, line 2 = company line, then "N. Heading. Body." paragraphs.
export function parseTerms(text = TERMS_TEXT) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const [title = '', company = '', ...rest] = lines;
  const sections = rest.map((line) => {
    const m = /^(\d+)\.\s+([^.]+)\.\s*(.*)$/.exec(line);
    return m ? { n: m[1], heading: m[2], body: m[3] } : { n: '', heading: '', body: line };
  });
  return { title, company, sections };
}

export const TERMS = parseTerms();
