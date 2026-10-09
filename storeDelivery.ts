export const STORE_DELIVERY_METHODS = ['Campus Meetup', 'Store Pickup', 'Campus Delivery', 'Pickup or Campus Delivery', 'Courier Delivery', 'Digital Delivery', 'On-site Service'] as const;
export function storeDeliveryMode(store: any): string {
  const value = typeof store?.deliveryMode === 'string' && store.deliveryMode.trim() ? store.deliveryMode : store?.deliveryForm;
  return typeof value === 'string' ? value.trim() : '';
}
