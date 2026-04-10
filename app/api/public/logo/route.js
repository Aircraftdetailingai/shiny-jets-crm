// Public redirect to the Shiny Jets master logo (Brett's detailer record)
export const dynamic = 'force-dynamic';

const SHINY_JETS_LOGO = 'https://wvdwgiouwjvdcsuvwshd.supabase.co/storage/v1/object/public/logos/9f2b9f6a-a104-4497-a5fc-735ab3a7c170/logo.png';

export async function GET() {
  return Response.redirect(SHINY_JETS_LOGO, 302);
}
