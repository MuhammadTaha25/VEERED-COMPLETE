/**
 * POST /api/recruiters/checkout
 * Processes stub payment for recruiter subscription / job posting credit.
 * Preserves fixed price points:
 *  - Single vacancy: £149 / €169
 *  - Team monthly: £399 / €449
 *  - Enterprise: £1,499 / €1,699
 * Recruiter selects billing country/currency explicitly or auto-detected (GB -> GBP, IE -> EUR).
 */
import { NextResponse } from 'next/server.js';
import { getSession } from '../../../../lib/auth/index.js';
import { dbGet, dbRun } from '../../../../lib/db/index.js';

const FIXED_PRICES = {
  single: { gbp: 149, eur: 169 },
  monthly: { gbp: 399, eur: 449 },
  enterprise: { gbp: 1499, eur: 1699 }
};

const VAT_RATES = {
  GB: { currency: 'GBP', symbol: '£', rate: 0.20 },
  IE: { currency: 'EUR', symbol: '€', rate: 0.23 },
  OTHER: { currency: 'GBP', symbol: '£', rate: 0.00 }
};

export async function POST(req) {
  try {
    const session = await getSession();
    const { plan, billingCountry, cardholderName, recruiterId: bodyRecruiterId } = await req.json();

    const recruiterId = bodyRecruiterId || session?.userId;

    if (!plan || !FIXED_PRICES[plan]) {
      return NextResponse.json({ ok: false, error: 'Invalid plan selected' }, { status: 400 });
    }

    if (!billingCountry || !VAT_RATES[billingCountry]) {
      return NextResponse.json({ ok: false, error: 'Invalid billing country selected' }, { status: 400 });
    }

    const countryConfig = VAT_RATES[billingCountry];
    const currency = countryConfig.currency;
    const currencyKey = currency.toLowerCase();
    const basePrice = FIXED_PRICES[plan][currencyKey];
    const vatAmount = Math.round(basePrice * countryConfig.rate * 100) / 100;
    const totalAmount = Math.round((basePrice + vatAmount) * 100) / 100;

    // Log stub payment to console clearly per requirement
    console.log(`[STUB PAYMENT LOG] Recruiter ID: ${recruiterId || 'guest'} | Plan: ${plan} | Country: ${billingCountry} | Base: ${countryConfig.symbol}${basePrice} | VAT: ${countryConfig.symbol}${vatAmount} | Total: ${countryConfig.symbol}${totalAmount} (${currency}) | Status: PAID (Simulated)`);

    // Update recruiter record if recruiterId exists in DB
    if (recruiterId) {
      await dbRun(`
        UPDATE recruiters
        SET plan = ?, billing_country = ?, billing_currency = ?, payment_status = 'stub_paid', payment_amount = ?
        WHERE id = ?
      `, [plan, billingCountry, currency, totalAmount, recruiterId]);
    }

    return NextResponse.json({
      ok: true,
      recruiterId: recruiterId || null,
      plan,
      billingCountry,
      currency,
      currencySymbol: countryConfig.symbol,
      basePrice,
      vatAmount,
      totalAmount,
      formattedPrice: `${countryConfig.symbol}${basePrice.toFixed(2)} + ${countryConfig.symbol}${vatAmount.toFixed(2)} VAT = ${countryConfig.symbol}${totalAmount.toFixed(2)}`,
      paymentStatus: 'stub_paid',
      message: `Simulated payment of ${countryConfig.symbol}${totalAmount.toFixed(2)} ${currency} successful. Account updated.`,
    });

  } catch (err) {
    console.error('[RECRUITER CHECKOUT ERROR]', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
