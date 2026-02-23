/**
 * Centralized Twilio SMS utility.
 * Uses Twilio REST API directly (no SDK) — matches existing codebase pattern.
 */

export async function sendSms({ to, body, from }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = from || process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.log('SMS skipped: Twilio credentials not configured');
    return { success: false, error: 'Twilio not configured' };
  }

  if (!to) {
    return { success: false, error: 'No recipient phone number' };
  }

  try {
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: fromNumber, To: to, Body: body }).toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Twilio error:', data);
      return { success: false, error: data.message || 'SMS send failed' };
    }

    console.log(`SMS sent: SID=${data.sid} to=${to}`);
    return { success: true, sid: data.sid };
  } catch (error) {
    console.error('SMS exception:', error.message || error);
    return { success: false, error: error.message || String(error) };
  }
}

export async function sendQuoteSms({ clientPhone, clientName, aircraftDisplay, quoteLink, companyName }) {
  const body = `Hi ${clientName || ''}, your ${aircraftDisplay || 'aircraft'} detailing quote is ready! View and pay here: ${quoteLink} - ${companyName || ''}`;
  return sendSms({ to: clientPhone, body });
}

export async function sendFollowup3DaySms({ clientPhone, clientName, aircraft, link, detailerName }) {
  const body = `Hi ${clientName || ''}, checking in on the quote for your ${aircraft || ''}. ${link} - ${detailerName || ''}`;
  return sendSms({ to: clientPhone, body });
}

export async function sendFollowup7DaySms({ clientPhone, clientName, aircraft, link, detailerName }) {
  const body = `Hi ${clientName || ''}, following up one more time on the ${aircraft || ''} quote. ${link} - ${detailerName || ''}`;
  return sendSms({ to: clientPhone, body });
}

export async function sendExpirationWarningSms({ clientPhone, clientName, aircraft, link }) {
  const body = `Hi ${clientName || ''}, your quote for the ${aircraft || ''} expires tomorrow. ${link}`;
  return sendSms({ to: clientPhone, body });
}

export async function sendExpirationAlertSms({ detailerPhone, clientName, aircraft, statusText }) {
  const body = `\u23F0 Quote for ${clientName || ''}'s ${aircraft || ''} expires in 24hrs. Status: ${statusText}`;
  return sendSms({ to: detailerPhone, body });
}

export async function sendPaymentConfirmationSms({ clientPhone, clientName, aircraftDisplay, amount, companyName }) {
  const body = `Payment of ${amount} confirmed for your ${aircraftDisplay || 'aircraft'} detail with ${companyName || ''}. They'll be in touch to schedule. Thank you!`;
  return sendSms({ to: clientPhone, body });
}

export async function sendJobReminderSms({ clientPhone, clientName, aircraftDisplay, companyName, scheduledTime }) {
  const timeStr = scheduledTime ? ` at ${scheduledTime}` : '';
  const body = `Reminder: Your ${aircraftDisplay || 'aircraft'} detail with ${companyName || ''} is scheduled for tomorrow${timeStr}. See you then!`;
  return sendSms({ to: clientPhone, body });
}
