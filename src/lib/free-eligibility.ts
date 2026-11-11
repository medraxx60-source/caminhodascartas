// Pure rules for the free first reading (shared by server and tests).
export type FreeReason = "eligible" | "device_already_used" | "network_limit" | "disabled";
export type ClaimLike = { status: string; expires_at: string };

// A claim counts against the network only if consumed, or reserved and not yet expired.
export function isActiveClaim(c: ClaimLike, now: number = Date.now()) {
  return c.status === "consumed" || (c.status === "reserved" && new Date(c.expires_at).getTime() > now);
}

export function freeReason(o: { enabled: boolean; deviceConsumed: number; networkActive: number; ipLimit: number }): FreeReason {
  if (!o.enabled) return "disabled";
  if (o.deviceConsumed > 0) return "device_already_used";
  if (o.networkActive >= o.ipLimit) return "network_limit";
  return "eligible";
}
