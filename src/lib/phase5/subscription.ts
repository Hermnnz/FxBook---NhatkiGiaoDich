export type Subscription = { user_id: string; trial_started_at: string; trial_ends_at: string; paid_until: string | null };
export type SubscriptionStatus = { state: 'trial' | 'active' | 'expired'; daysLeft: number; endsAt: string };

export function getSubscriptionStatus(subscription: Subscription, now = new Date()): SubscriptionStatus {
  const paidEnd = subscription.paid_until ? new Date(subscription.paid_until).getTime() : 0;
  const trialEnd = new Date(subscription.trial_ends_at).getTime();
  const activePaid = paidEnd > now.getTime();
  const end = Math.max(trialEnd, paidEnd);
  const state = activePaid ? 'active' : trialEnd > now.getTime() ? 'trial' : 'expired';
  return { state, daysLeft: Math.max(0, Math.ceil((end - now.getTime()) / 86_400_000)), endsAt: new Date(end).toISOString() };
}
