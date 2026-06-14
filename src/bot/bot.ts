import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { grantPremium } from '../controllers/premium';
dotenv.config();

// ==========================================================================
// Telegram bot — handles /start command, sends notifications and broadcasts.
// The Mini App is launched via the menu button or /start command.
// ==========================================================================

const BOT_TOKEN = process.env.BOT_TOKEN!;
const MINI_APP_URL = process.env.FRONTEND_URL || 'https://your-app.netlify.app';

export const bot = new Telegraf(BOT_TOKEN);

bot.start(async (ctx) => {
  const user = ctx.from;
  await ctx.reply(
    `👋 Welcome to *GayTrix*, ${user.first_name}!\n\nThe LGBTQ+ community discovery platform built inside Telegram.\n\nTap the button below to open the app:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '🌈 Open GayTrix', web_app: { url: MINI_APP_URL } },
        ]],
      },
    }
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    `*GayTrix Help*\n\n` +
    `/start — Open GayTrix\n` +
    `/profile — View your profile\n` +
    `/privacy — Manage privacy settings\n\n` +
    `For support, contact @GayTrixSupport`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('profile', async (ctx) => {
  await ctx.reply(
    'Open GayTrix to manage your profile:',
    {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Open GayTrix', web_app: { url: `${MINI_APP_URL}/profile` } },
        ]],
      },
    }
  );
});

// Handle webhook updates (for Telegram Stars payments)
bot.on('pre_checkout_query', async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

bot.on('successful_payment', async (ctx) => {
  const payment = ctx.message?.successful_payment;
  if (!payment) return;

  // Update user membership in database
  const { db } = await import('../db/pool');
  await db.query(
    `UPDATE users SET membership_tier = 'premium'
     WHERE telegram_id = $1`,
    [ctx.from.id]
  );

  await ctx.reply(
    '⭐ *Premium activated!*\n\nThank you for your support. Enjoy all GayTrix Premium features!',
    { parse_mode: 'Markdown' }
  );
});

// Send a notification to a single user
export async function sendNotification(telegramId: number, message: string) {
  try {
    await bot.telegram.sendMessage(telegramId, message, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error(`Failed to notify user ${telegramId}:`, err);
  }
}

// Send broadcast to multiple users (used by admin announcement)
export async function sendBroadcast(telegramIds: number[], message: string) {
  let sent = 0;
  for (const id of telegramIds) {
    try {
      await bot.telegram.sendMessage(id, message, { parse_mode: 'Markdown' });
      sent++;
      // Rate limit: Telegram allows 30 messages/second
      await new Promise(r => setTimeout(r, 50));
    } catch {
      // User may have blocked the bot — skip silently
    }
  }
  console.log(`Broadcast sent to ${sent}/${telegramIds.length} users`);
}

export async function startBot(useWebhook = false, webhookUrl?: string) {
  // Set the menu button to always show the Mini App launch button
  try {
    await bot.telegram.setChatMenuButton({
      menuButton: {
        type: 'web_app',
        text: '🌈 Open GayTrix',
        web_app: { url: MINI_APP_URL },
      },
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
