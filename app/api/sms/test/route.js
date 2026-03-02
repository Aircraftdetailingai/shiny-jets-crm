import { NextResponse } from 'next/server';
import twilio from 'twilio';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url);
  const to = url.searchParams.get('to') || '+16194384972';

  // Check env vars
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    return NextResponse.json({
      error: 'Missing Twilio credentials',
      hasSid: !!process.env.TWILIO_ACCOUNT_SID,
      hasToken: !!process.env.TWILIO_AUTH_TOKEN,
      hasPhone: !!process.env.TWILIO_PHONE_NUMBER
    }, { status: 500 });
  }

  try {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    // Format phone number to E.164
    let phone = to.replace(/\D/g, '');
    if (phone.length === 10) phone = '1' + phone;
    if (!phone.startsWith('+')) phone = '+' + phone;

    const message = await client.messages.create({
      body: 'Vector CRM Test - SMS is working! \u{1F6E9}\u{FE0F}',
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });

    return NextResponse.json({
      success: true,
      sid: message.sid,
      status: message.status,
      to: phone,
      from: process.env.TWILIO_PHONE_NUMBER
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code,
      moreInfo: error.moreInfo
    }, { status: 500 });
  }
}
