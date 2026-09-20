const publishable = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

export const stripeConfigured = Boolean(publishable);

export function paymentLinkUrl(invoiceId: string, amount: number): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/pay/${invoiceId}?amount=${amount}`;
}

export function detectBillingSource(medicalCardType: string, insurer?: string) {
  if (medicalCardType === 'gms' || medicalCardType === 'gp_visit') return 'gms' as const;
  if (insurer === 'vhi' || insurer === 'laya' || insurer === 'irish_life' || insurer === 'aviva') {
    return insurer;
  }
  return 'private' as const;
}
