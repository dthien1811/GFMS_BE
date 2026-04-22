import membershipCardService from "../service/member/membershipCard.service";

let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const count = await membershipCardService.syncExpiredCardsAndNotify();
    if (count > 0) {
      console.log(`[membership-card-expiry] processed ${count} expired card(s)`);
    }
  } catch (e) {
    console.error("[membership-card-expiry] error:", e?.message || e);
  } finally {
    running = false;
  }
}

export function startMembershipCardExpiryJob() {
  tick().catch(() => {});
  const intervalMs = Number(process.env.MEMBERSHIP_CARD_EXPIRY_SYNC_MS || 10 * 60 * 1000);
  setInterval(() => {
    tick().catch(() => {});
  }, intervalMs);
}
