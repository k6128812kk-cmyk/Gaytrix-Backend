import { useState } from 'react';
import { Crown, Check, Zap, Eye, SlidersHorizontal, Star } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { useSessionStore } from '@/context/sessionStore';
import { useTelegram } from '@/hooks/useTelegram';
import styles from './Premium.module.css';

// ==========================================================================
// Premium — subscription page. Purchases route through Telegram Stars
// using the bot's invoice flow (Bot API sendInvoice with currency "XTR").
// The Mini App triggers this via Telegram.WebApp.openInvoice, which the
// backend creates server-side after this page calls /premium/create-invoice.
// ==========================================================================

const PLANS = [
  { id: 'monthly', label: 'Monthly', stars: 250, period: '/ month' },
  { id: 'quarterly', label: '3 months', stars: 650, period: '/ 3 months', badge: 'Save 13%' },
  { id: 'yearly', label: 'Yearly', stars: 2200, period: '/ year', badge: 'Best value' },
];

const FEATURES = [
  { icon: Zap, label: 'Unlimited profile boosts' },
  { icon: SlidersHorizontal, label: 'Advanced discovery filters' },
  { icon: Eye, label: 'See who viewed your profile' },
  { icon: Crown, label: 'Premium badge on your profile' },
  { icon: Star, label: 'Priority placement in discovery' },
];

export function PremiumPage() {
  const { profile, updateProfile } = useSessionStore();
  const { webApp, haptic } = useTelegram();
  const [selectedPlan, setSelectedPlan] = useState('quarterly');
  const [purchasing, setPurchasing] = useState(false);

  if (!profile) return null;

  async function handlePurchase() {
    if (!webApp) {
      alert('Please open this app inside Telegram to purchase Premium.');
      return;
    }
    setPurchasing(true);
    try {
      const { api } = await import('@/api/client');
      const { data } = await api.post<{ invoiceUrl: string }>(
        '/premium/create-invoice', { planId: selectedPlan }
      );
      webApp.openInvoice(data.invoiceUrl, (status: string) => {
        if (status === 'paid') {
          import('@/api/services').then(({ profileService }) =>
            profileService.getMe().then((p) => updateProfile(p))
          );
          haptic.success();
        }
        setPurchasing(false);
      });
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Could not create invoice. Please try again.';
      alert(msg);
      setPurchasing(false);
    }
  }

  if (profile.membership === 'premium') {
    return (
      <div className={styles.page}>
        <PageHeader title="Premium" showBack />
        <div className={styles.content}>
          <div className={styles.activeBanner}>
            <Crown size={28} />
            <div>
              <h2 className={styles.activeTitle}>You're a Premium member</h2>
              <p className={styles.activeBody}>Enjoy unlimited boosts, advanced filters, and priority placement.</p>
            </div>
          </div>
          <section className={styles.featureList}>
            {FEATURES.map((f) => (
              <div key={f.label} className={styles.featureRow}>
                <span className={styles.featureIcon}>
                  <f.icon size={16} />
                </span>
                <span>{f.label}</span>
                <Check size={16} className={styles.checkIcon} />
              </div>
            ))}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Premium" showBack />

      <div className={styles.content}>
        <div className={styles.hero}>
          <Crown size={32} className={styles.heroIcon} />
          <h1 className={styles.heroTitle}>GayTrix Premium</h1>
          <p className={styles.heroSubtitle}>Get noticed faster and unlock the full experience.</p>
        </div>

        <section className={styles.featureList}>
          {FEATURES.map((f) => (
            <div key={f.label} className={styles.featureRow}>
              <span className={styles.featureIcon}>
                <f.icon size={16} />
              </span>
              <span>{f.label}</span>
            </div>
          ))}
        </section>

        <section className={styles.plans}>
          {PLANS.map((plan) => (
            <button
              key={plan.id}
              className={`${styles.plan} ${selectedPlan === plan.id ? styles.planSelected : ''}`}
              onClick={() => setSelectedPlan(plan.id)}
            >
              <div className={styles.planInfo}>
                <span className={styles.planLabel}>{plan.label}</span>
                {plan.badge && <span className={styles.planBadge}>{plan.badge}</span>}
              </div>
              <div className={styles.planPrice}>
                <Star size={14} className={styles.starIcon} />
                <span>{plan.stars}</span>
                <span className={styles.planPeriod}>{plan.period}</span>
              </div>
            </button>
          ))}
        </section>
      </div>

      <div className={styles.footer}>
        <Button fullWidth onClick={handlePurchase} disabled={purchasing}>
          <Star size={16} />
          {purchasing ? 'Processing...' : `Pay with Telegram Stars`}
        </Button>
      </div>
    </div>
  );
}
