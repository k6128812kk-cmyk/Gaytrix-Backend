import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { grantPremium } from '../controllers/premium';
dotenv.config();

// ==========================================================================
// Telegram bot — handles /start command, sends notifications and broadcasts.
// If BOT_TOKEN is missing the server still starts; bot features are disabled.
// ==========================================================================

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const MINI_APP_URL = process.env.FRONTEND_URL || 'https://your-app.netlify.app';

if (!BOT_TOKEN) {
  console.warn('⚠️  BOT_TOKEN not set — bot features disabled. Set BOT_TOKEN in Railway env vars.');
}

// Create bot instance (Telegraf throws at first API call if token is empty, not at construction)
export const bot = new Telegraf(BOT_TOKEN || 'placeholder:placeholder');

bot.start(async (ctx) => {
  const user = ctx.from;
  await ctx.reply(
    `👋 Welcome to *K5*, ${user.first_name}!\n\nK5 is a dating and social discovery platform inside Telegram where people of all genders and sexual orientations can meet, chat, and connect.

💜 Find friends, dates, relationships, and new connections near you.\n\nTap the button below to open the app:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: ' Open K5', web_app: { url: MINI_APP_URL } }]],
      },
    }
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    `*K5 Help*\n\n/start — Open K5\n\nFor support, contact @K5Support`,
    { parse_mode: 'Markdown' }
  );
});

bot.on('pre_checkout_query', async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

bot.on('successful_payment', async (ctx) => {
  const payment = ctx.message?.successful_payment;
  if (!payment) return;
  const { db } = await import('../db/pool');
  await db.query(`UPDATE users SET membership_tier = 'premium' WHERE telegram_id = $1`, [ctx.from.id]);
  await ctx.reply('⭐ *Premium activated!* Thank you for your support. Enjoy all K5 Premium features!', { parse_mode: 'Markdown' });
});

export async function sendNotification(telegramId: number, message: string) {
  if (!BOT_TOKEN) return;
  try {
    await bot.telegram.sendMessage(telegramId, message, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error(`Failed to notify user ${telegramId}:`, err);
  }
}

export async function sendBroadcast(telegramIds: number[], message: string) {
  if (!BOT_TOKEN) return;
  let sent = 0;
  for (const id of telegramIds) {
    try {
      await bot.telegram.sendMessage(id, message, { parse_mode: 'Markdown' });
      sent++;
      await new Promise(r => setTimeout(r, 50));
    } catch {}
  }
  console.log(`Broadcast sent to ${sent}/${telegramIds.length} users`);
}

export async function startBot(useWebhook = false, webhookUrl?: string) {
  if (!BOT_TOKEN) {
    console.log('⚠️  Bot not started — BOT_TOKEN missing');
    return;
  }
  try {
    await bot.telegram.setChatMenuButton({
      menuButton: { type: 'web_app', text: 'Open K5', web_app: { url: MINI_APP_URL } },
    });
    console.log('✅ Bot menu button set');
  } catch (err) {
    console.error('Failed to set menu button:', err);
  }

  if (useWebhook && webhookUrl) {
    await bot.telegram.setWebhook(`${webhookUrl}/bot/webhook`);
    console.log('✅ Bot webhook set');
  } else {
    bot.launch();
    console.log('✅ Bot started (polling)');
  }
}
