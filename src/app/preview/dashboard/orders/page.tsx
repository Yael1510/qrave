import OrdersBoard from '@/app/dashboard/orders/OrdersBoard';
import { getDemo } from '@/lib/demo/seed';

export const metadata = { title: 'Orders · QRave' };

export default async function PreviewOrders() {
  const demo = await getDemo();
  return <OrdersBoard cafeId={demo.cafeId} currency="PHP" />;
}
