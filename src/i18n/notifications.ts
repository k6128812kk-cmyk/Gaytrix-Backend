// ==========================================================================
// Server-side notification strings — used when pushing Telegram messages
// to offline users. Matched to the user's stored language_preference.
// Falls back to English for any missing key or unknown language.
// ==========================================================================

export type NotificationLang = 'en' | 'tr' | 'ru';

const notificationStrings: Record<NotificationLang, Record<string, string>> = {
  en: {
    newMessage: '💬 You have a new message on K5.',
    newGroupMessage: '💬 New message in {groupName}',
    storyReply: '💬 {senderName} replied to your story on K5',
    verificationApproved: '✅ Your verification has been approved! You now have a verified badge.',
    verificationRejected: '❌ Your verification was not approved. You can try again in the app.',
    premiumActivated: '⭐ *Premium activated!* Thank you for your support. Enjoy all K5 Premium features!',
    accountSuspended: '⚠️ Your K5 account has been suspended. Contact @K5Support for more info.',
    welcome: '👋 Welcome to *K5*! Tap below to open the app.',
    announcement: '📢 *K5 Announcement*\n\n{message}',
  },
  tr: {
    newMessage: '💬 K5\'te yeni bir mesajınız var.',
    newGroupMessage: '💬 {groupName} grubunda yeni mesaj',
    storyReply: '💬 {senderName} K5\'teki hikayenizi yanıtladı',
    verificationApproved: '✅ Doğrulamanız onaylandı! Artık doğrulama rozetiniz var.',
    verificationRejected: '❌ Doğrulamanız onaylanmadı. Uygulamadan tekrar deneyebilirsiniz.',
    premiumActivated: '⭐ *Premium aktif!* Desteğiniz için teşekkürler. Tüm K5 Premium özelliklerinin keyfini çıkarın!',
    accountSuspended: '⚠️ K5 hesabınız askıya alındı. Daha fazla bilgi için @K5Support ile iletişime geçin.',
    welcome: '👋 *K5\'e* hoş geldiniz! Uygulamayı açmak için aşağıya dokunun.',
    announcement: '📢 *K5 Duyurusu*\n\n{message}',
  },
  ru: {
    newMessage: '💬 У вас новое сообщение в K5.',
    newGroupMessage: '💬 Новое сообщение в {groupName}',
    storyReply: '💬 {senderName} ответил(а) на вашу историю в K5',
    verificationApproved: '✅ Ваша верификация одобрена! Теперь у вас есть значок верификации.',
    verificationRejected: '❌ Ваша верификация не прошла. Вы можете попробовать снова в приложении.',
    premiumActivated: '⭐ *Premium активирован!* Спасибо за поддержку. Наслаждайтесь всеми функциями K5 Premium!',
    accountSuspended: '⚠️ Ваш аккаунт K5 приостановлен. Свяжитесь с @K5Support для получения информации.',
    welcome: '👋 Добро пожаловать в *K5*! Нажмите ниже, чтобы открыть приложение.',
    announcement: '📢 *Объявление K5*\n\n{message}',
  },
};

/**
 * Get a localized notification string.
 * @param lang  - user's language preference (falls back to 'en')
 * @param key   - notification key
 * @param vars  - optional template variables like {senderName}
 */
export function n(
  lang: string | null | undefined,
  key: string,
  vars?: Record<string, string>
): string {
  const safeL = (lang && lang in notificationStrings ? lang : 'en') as NotificationLang;
  let str = notificationStrings[safeL][key] ?? notificationStrings.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, v);
    }
  }
  return str;
}
