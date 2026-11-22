import { notFound } from 'next/navigation';
import CustomerMenu from '@/app/c/[slug]/CustomerMenu';
import DemoProvider from '@/lib/demo/DemoProvider';
import { getDemo } from '@/lib/demo/seed';

// Development-only: the customer menu as scanned from table N, ordering into the demo data.
export const dynamic = 'force-dynamic';

export default async function PreviewTable({ params }: { params: Promise<{ n: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const n = Number((await params).n);
  const demo = await getDemo();
  const table = demo.tables.find(t => t.number === n);
  if (!table) notFound();
  const { cafe, categories, items } = demo;
  return (
    <DemoProvider seed={demo.seed()}>
      <div style={{ ['--brand' as string]: cafe.primary_color }}>
        <CustomerMenu cafe={cafe} categories={categories} items={items} token={table.token} table={{ number: table.number, label: table.label }} />
      </div>
    </DemoProvider>
  );
}
