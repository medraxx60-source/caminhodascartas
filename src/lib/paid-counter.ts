// Only the display counter is reset; historical orders and revenue remain intact.
export const PAID_COUNTER_SINCE = Date.parse("2026-11-23T06:06:00Z");

export function countPaidSinceReset(orders: readonly { is_free: boolean; status: string; created_at: string }[]) {
  return orders.filter((order) => !order.is_free &&
    (order.status === "done" || order.status === "generating") &&
    Date.parse(order.created_at) >= PAID_COUNTER_SINCE).length;
}