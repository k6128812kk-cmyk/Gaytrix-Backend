import { useEffect, useState } from 'react';

// ==========================================================================
// useTelegram — Telegram WebApp SDK bridge.
//
// SECURITY DESIGN:
// - initData (the raw string from Telegram) is sent to the backend on every
//   request via X-Telegram-Init-Data header.
// - The backend verifies the HMAC-SHA256 signature of initData using the
//   bot token before trusting ANY identity claim.
// - initDataUnsafe is used CLIENT-SIDE only for display purposes (e.g.
//   showing the user's name while loading). All privileged operations
//   (admin access, bans, verification approvals) are enforced server-side.
// - Super admin role (telegramId 528269003) is assigned server-side only.
//   The client merely reflects what the server returns.
// ==========================================================================

export const SUPER_ADMIN_TELEGRAM_ID = 528269003;

interface TelegramUser {
  id: number;
  username?: string;
  first_name: string;
  last_name?: string;
  language_code?: string;
  photo_url?: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TelegramUser };
  colorScheme: 'light' | 'dark';
  ready: () => void;
  expand: () => void;
  enableClosingConfirmation: () => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  MainButton: {
    show: () => void;
    hide: () => void;
    setText: (text: string) => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  openInvoice: (url: string, callback?: (status: string) => void) => void;
  close: () => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export function useTelegram() {
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);
  const [initData, setInitData] = useState<string>('');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    if (tg) {
      tg.ready();
      tg.expand();
      tg.enableClosingConfirmation();
      tg.setHeaderColor('#16141f');
      tg.setBackgroundColor('#16141f');

      const u = tg.initDataUnsafe.user;
      if (u) setTelegramUser(u);
      setInitData(tg.initData);
    } else {
      // Dev browser fallback — simulates super admin session.
      // In production, real Telegram users will always have initData.
      setTelegramUser({
        id: SUPER_ADMIN_TELEGRAM_ID,
        username: 'k54lid',
        first_name: 'Khalid',
      });
      setInitData('');
    }

    setIsReady(true);
  }, []);

  const haptic = {
    light: () => window.Telegram?.WebApp.HapticFeedback.impactOccurred('light'),
    medium: () => window.Telegram?.WebApp.HapticFeedback.impactOccurred('medium'),
    success: () => window.Telegram?.WebApp.HapticFeedback.notificationOccurred('success'),
    error: () => window.Telegram?.WebApp.HapticFeedback.notificationOccurred('error'),
    selection: () => window.Telegram?.WebApp.HapticFeedback.selectionChanged(),
  };

  return {
    webApp: window.Telegram?.WebApp ?? null,
    telegramUser,
    initData,
    isReady,
    haptic,
  };
}
