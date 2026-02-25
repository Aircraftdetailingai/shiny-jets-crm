export const dynamic = 'force-dynamic';

// Industry averages for aircraft detailing (hardcoded, no cross-user data)
const INDUSTRY_BENCHMARKS = {
  closeRate: {
    average: 45,
    label: 'Close Rate',
    format: 'percent',
  },
  quoteSpeed: {
    average: 8,
    label: 'Quote Speed',
    format: 'minutes',
  },
  avgTicket: {
    average: 1200,
    label: 'Avg Ticket',
    format: 'currency',
  },
};

// GET - Return industry benchmarks (no cross-user data)
export async function GET() {
  return Response.json({
    benchmarks: INDUSTRY_BENCHMARKS,
  });
}
