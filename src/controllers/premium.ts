import { Response } from 'express';
import { db } from '../db/pool';
import { AuthenticatedRequest } from '../middleware/auth';
import { bot } from '../bot/bot';

// ==========================================================================
// Premium controller — Telegram Stars payment flow.
//
// Flow:
// 1. Frontend POSTs /premium/create-invoice { planId }
// 2. We call bot.telegram.createInvoiceLink with currency "XTR" (Stars)
// 3. Return the invoice URL to frontend
// 4. Frontend opens it via webApp.openInvoice()
// 5. Telegram calls our bot webhook with successful_payment update
// 6. Bot handler (bot.ts) upgrades membership in DB
// ==========================================================================

const PLANS: Record<string, { title: string; description: string; stars: number }> = {
  monthly:   { title: 'GayTrix Premium — Monthly',   description: 'Unlimited boosts, advanced filters, and more for 1 month.',   stars: 250 },
  quarterly: { title: 'GayTrix Premium — 3 Months',  description: 'Unlimited boosts, advanced filters, and more for 3 months.',  stars: 650 },
  yearly:    { title: 'GayTrix Premium — Yearly',     description: 'Unlimited boosts, advanced filters, and more for 1 year.',    stars: 2200 },
};

export async function createInvoice(req: AuthenticatedRequest, res: Response) {
  const { planId } = req.body;
  const plan = PLANS[planId];
  if (!plan) return res.status(400).json({ error: 'Invalid plan' });

  try {
    const invoiceUrl = await bot.telegram.createInvoiceLink({
      title: plan.title,
      description: plan.description,
      payload: JSON.stringify({ userId: req.user!.id, planId }),
      currency: 'XTR',
      prices: [{ label: plan.title, amount: plan.stars }],
    });
    res.json({ invoiceUrl });
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
