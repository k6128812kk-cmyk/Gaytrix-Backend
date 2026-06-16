import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { grantPremium } from '../controllers/premium';
dotenv.config();

// ==========================================================================
// Telegram bot — handles /start command with language selection,
// sends notifications and broadcasts in the user's preferred language.
// If BOT_TOKEN is missing the server still starts; bot features are disabled.
// ==========================================================================

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const MINI_APP_URL = process.env.FRONTEND_URL || 'https://your-app.netlify.app';
const SUPER_ADMIN_TELEGRAM_ID = parseInt(process.env.SUPER_ADMIN_TELEGRAM_ID || '528269003');

if (!BOT_TOKEN) {
  console.warn('⚠️  BOT_TOKEN not set — bot features disabled. Set BOT_TOKEN in Railway env vars.');
}

export const bot = new Telegraf(BOT_TOKEN || 'placeholder:placeholder');

// ==========================================================================
// Language selection — shown immediately on /start before onboarding message
// ==========================================================================

const LANG_SELECTION_TEXT = [
  '👋 Welcome to *K5*! Please choose your language:',
].join('\n');

const LANG_SELECTION_KEYBOARD = {
  inline_keyboard: [
    [
      { text: '🇬🇧 English', callback_data: 'lang_en' },
      { text: '🇷🇺 Русский', callback_data: 'lang_ru' },
      { text: '🇹🇷 Türkçe', callback_data: 'lang_tr' },
    ],
  ],
};

const WELCOME_MESSAGES: Record<string, string> = {
  en: `👋 Welcome to *K5*, {name}!\n\nK5 is a dating and social discovery platform inside Telegram where people of all genders and sexual orientations can meet, chat, and connect.\n\n💜 Find friends, dates, relationships, and new connections near you.\n\nTap the button below to open the app:`,
  ru: `👋 Добро пожаловать в *K5*, {name}!\n\nK5 — это платформа для знакомств и социальных открытий внутри Telegram, где люди всех гендеров и сексуальных ориентаций могут встречаться, общаться и находить связи.\n\n💜 Находите друзей, свидания, отношения и новые знакомства рядом с вами.\n\nНажмите кнопку ниже, чтобы открыть приложение:`,
  tr: `👋 *K5*'e hoş geldin, {name}!\n\nK5, Telegram içinde tüm cinsiyet ve cinsel yönelimlerdeki insanların tanışabileceği, sohbet edebileceği ve bağlantı kurabileceği bir sosyal keşif platformudur.\n\n💜 Yakınınızda arkadaşlar, buluşmalar, ilişkiler ve yeni tanışıklıklar bulun.\n\nUygulamayı açmak için aşağıdaki düğmeye dokunun:`,
};

const OPEN_APP_BUTTON_LABELS: Record<string, string> = {
  en: ' 👉🏻Open K5👈🏻',
  ru: ' 👉🏻Открыть K5👈🏻',
  tr: ' 👉🏻K5\'i Aç👈🏻',
};

bot.start(async (ctx) => {
  const user = ctx.from;
  await ctx.reply(LANG_SELECTION_TEXT, {
    parse_mode: 'Markdown',
    reply_markup: LANG_SELECTION_KEYBOARD,
  });
});

// Handle language selection callback
bot.action(/^lang_(en|ru|tr)$/, async (ctx) => {
  const lang = ctx.match[1] as 'en' | 'ru' | 'tr';
  const user = ctx.from;

  // Save language preference to DB
  try {
    const { db } = await import('../db/pool');
    await db.query(
      `UPDATE users SET language_preference = $1 WHERE telegram_id = $2`,
      [lang, user.id]
    );
  } catch (err) {
    console.error('Failed to save language preference:', err);
  }

  // Acknowledge the button press (removes loading state)
  try { await ctx.answerCbQuery(); } catch {}

  // Edit the selection message to show confirmation, then send welcome
  const welcomeText = (WELCOME_MESSAGES[lang] || WELCOME_MESSAGES.en)
    .replace('{name}', user.first_name || 'there');

  try {
    await ctx.editMessageText(
      `✅ Language set to ${lang === 'en' ? 'English' : lang === 'ru' ? 'Русский' : 'Türkçe'}`,
      { parse_mode: 'Markdown' }
    );
  } catch {}

  await ctx.reply(welcomeText, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{
        text: OPEN_APP_BUTTON_LABELS[lang] || OPEN_APP_BUTTON_LABELS.en,
        web_app: { url: MINI_APP_URL },
      }]],
    },
  });
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

  // Get language preference for localized message
  const userRow = await db.query(
    `SELECT id, language_preference FROM users WHERE telegram_id = $1`,
    [ctx.from.id]
  );
  const row = userRow.rows[0];
  const lang = row?.language_preference || 'en';

  await db.query(`UPDATE users SET membership_tier = 'premium' WHERE telegram_id = $1`, [ctx.from.id]);

  const { n } = await import('../i18n/notifications');
  await ctx.reply(n(lang, 'premiumActivated'), { parse_mode: 'Markdown' });

  // Notify admins about Premium purchase
  if (row) {
    await notifyAdmins('premium_purchase', {
      userId: row.id,
      telegramId: ctx.from.id,
      telegramUsername: ctx.from.username || '',
      details: `Plan: ${payment.invoice_payload}`,
    });
  }
});

// ==========================================================================
// Admin notification system — centralized function to alert all admins
// ==========================================================================

export async function notifyAdmins(
  eventType: string,
  data: {
    userId?: string;
    telegramId?: number;
    telegramUsername?: string;
    details?: string;
  }
) {
  if (!BOT_TOKEN) return;
  try {
    const { db } = await import('../db/pool');

    // Fetch all admins and moderators
    const admins = await db.query(
      `SELECT telegram_id FROM users
       WHERE admin_role IN ('admin', 'super_admin', 'moderator')
         AND account_status = 'active'`
    );

    const eventLabels: Record<string, string> = {
      user_report: '🚨 User Report',
      verification_request: '📋 Verification Request',
      premium_purchase: '⭐ Premium Purchase',
      moderation_event: '⚠️ Moderation Event',
    };

    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    const label = eventLabels[eventType] || `📣 ${eventType}`;
    const username = data.telegramUsername ? `@${data.telegramUsername}` : 'N/A';

    const msg = [
      `${label}`,
      ``,
      `👤 User ID: \`${data.userId || 'N/A'}\``,
      `🔗 Username: ${username}`,
      `📱 Telegram ID: \`${data.telegramId || 'N/A'}\``,
      `🕐 Time: ${timestamp}`,
      data.details ? `📝 Details: ${data.details}` : '',
    ].filter(Boolean).join('\n');

    for (const admin of admins.rows) {
      try {
        await bot.telegram.sendMessage(admin.telegram_id, msg, { parse_mode: 'Markdown' });
        await new Promise(r => setTimeout(r, 30));
      } catch {}
    }
  } catch (err) {
    console.error('notifyAdmins error:', err);
  }
}

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
