import StockList from '@/app/dashboard/stock/StockList';
import { getDemo } from '@/lib/demo/seed';

export const metadata = { title: 'Sold out · QRave' };

export default async function PreviewStock() {
  const demo = await getDemo();
  const { categories, items } = demo;
  return <StockList categories={categories} initialItems={items} />;
}
