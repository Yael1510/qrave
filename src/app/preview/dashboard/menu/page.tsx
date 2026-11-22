import MenuEditor from '@/app/dashboard/menu/MenuEditor';
import { getDemo } from '@/lib/demo/seed';

export const metadata = { title: 'Menu · QRave' };

export default async function PreviewMenu() {
  const demo = await getDemo();
  const { categories, items } = demo;
  return <MenuEditor cafe={demo.cafe} initialCategories={categories} initialItems={items} />;
}
