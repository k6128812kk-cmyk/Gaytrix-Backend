import { Response } from 'express';
import { db } from '../db/pool';
import { AuthenticatedRequest } from '../middleware/auth';

// ==========================================================================
// Premium controller — Telegram Stars payment flow.
//
// Flow:
// 1. Frontend POSTs /premium/create-invoice { planId }
// 2. We call Telegram Bot API directly to create an invoice link
// 3. Return the invoice URL to frontend
// 4. Frontend opens it via webApp.openInvoice()
// 5. Telegram calls our bot webhook with successful_payment update
// 6. bot.ts handler upgrades the user's membership in DB
// ==========================================================================

const BOT_TOKEN = process.env.BOT_TOKEN!;

const ADMIN_TELEGRAM_ID = parseInt(process.env.SUPER_ADMIN_TELEGRAM_ID || '528269003');

const PLANS: Record<string, { title: string; description: string; stars: number; adminOnly?: boolean }> = {
  monthly:   { title: 'GayTrix Premium — Monthly',   description: 'Unlimited boosts, advanced filters, and more for 1 month.',   stars: 250 },
  quarterly: { title: 'GayTrix Premium — 3 Months',  description: 'Unlimited boosts, advanced filters, and more for 3 months.',  stars: 650 },
  yearly:    { title: 'GayTrix Premium — Yearly',     description: 'Unlimited boosts, advanced filters, and more for 1 year.',    stars: 2200 },
  admin_test: { title: '⭐ Admin Test Plan',          description: 'Admin-only test subscription for payment system verification.', stars: 1, adminOnly: true },
};

export async function createInvoice(req: AuthenticatedRequest, res: Response) {
  const { planId } = req.body;
  const plan = PLANS[planId];
  if (!plan) return res.status(400).json({ error: 'Invalid plan' });

  // Admin test plan is admin-only
  if (plan.adminOnly) {
    const role = req.user!.adminRole;
    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({ error: 'This plan is not available' });
    }
  }

  try {
    // Call Telegram Bot API directly — avoids Telegraf version quirks
    const payload = JSON.stringify({ userId: req.user!.id, planId });

    const tgRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: plan.title,
          description: plan.description,
          payload,
          currency: 'XTR',
          prices: [{ label: plan.title, amount: plan.stars }],
        }),
      }
    );

    const json = await tgRes.json() as { ok: boolean; result?: string; description?: string };

    if (!json.ok) {
      console.error('Telegram createInvoiceLink error:', json.description);
      // Return real error so it shows in the app
      return res.status(500).json({ error: `Telegram: ${json.description ?? 'Unknown error'}` });
    }

    res.json({ invoiceUrl: json.result });
  } catch (err) {
    console.error('createInvoice error:', err);
    res.status(500).json({ error: 'Could not create invoice' });
  }
}

// Called by bot.ts successful_payment handler to upgrade membership
export async function grantPremium(userId: string) {
  await db.query(
    `UPDATE users SET membership_tier = 'premium' WHERE id = $1`,
    [userId]
  );
}
