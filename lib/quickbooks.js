/**
 * QuickBooks Online integration helpers.
 * Uses Intuit OAuth2 and REST API directly (no SDK).
 */

const QB_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const QB_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

export function getQBBaseUrl() {
  const env = process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox';
  return env === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

export function getAuthorizationUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.QUICKBOOKS_CLIENT_ID,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: process.env.QUICKBOOKS_REDIRECT_URI,
    state,
  });
  return `${QB_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code) {
  const basicAuth = Buffer.from(
    `${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(QB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.QUICKBOOKS_REDIRECT_URI,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  return await res.json();
}

export async function refreshAccessToken(refreshToken) {
  const basicAuth = Buffer.from(
    `${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(QB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  return await res.json();
}

export async function queryCustomers(accessToken, realmId) {
  const baseUrl = getQBBaseUrl();
  const query = encodeURIComponent('SELECT * FROM Customer MAXRESULTS 1000');
  const url = `${baseUrl}/v3/company/${realmId}/query?query=${query}`;

  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`QB customer query failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.QueryResponse?.Customer || [];
}

export function mapQBCustomerToVector(qbCustomer) {
  return {
    name: qbCustomer.DisplayName || qbCustomer.FullyQualifiedName || '',
    email: qbCustomer.PrimaryEmailAddr?.Address || null,
    phone: qbCustomer.PrimaryPhone?.FreeFormNumber || null,
    company_name: qbCustomer.CompanyName || null,
  };
}
