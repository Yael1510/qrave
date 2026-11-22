import { getMembership } from '@/lib/membership';
import OrdersBoard from './OrdersBoard';

export const metadata = { title: 'Orders · QRave' };

export default async function OrdersPage() {
  const { cafe } = await getMembership();
  return <OrdersBoard cafeId={cafe.id} currency={cafe.currency} />;
}
