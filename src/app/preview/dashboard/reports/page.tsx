import SalesReportView from '@/app/dashboard/reports/SalesReportView';
import { demoReport } from '@/lib/demo/report';
import { getDemo } from '@/lib/demo/seed';
import { isRangeKey, rangeBounds } from '@/lib/report';

export const metadata = { title: 'Sales · QRave' };

export default async function PreviewReports({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const demo = await getDemo();
  const { range: r } = await searchParams;
  const range = isRangeKey(r) ? r : '7d';
  const b = rangeBounds(range);
  const report = demoReport(demo.items, demo.categories, b.from, b.to);
  return <SalesReportView report={report} range={range} prevLabel={b.prev} basePath="/preview/dashboard/reports" currency="PHP" />;
}
