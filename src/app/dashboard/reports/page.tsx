import { requireOwner } from '@/lib/membership';
import { isRangeKey, rangeBounds, type SalesReport } from '@/lib/report';
import SalesReportView from './SalesReportView';

export const metadata = { title: 'Sales · QRave' };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { supabase, cafe } = await requireOwner();
  const { range: r } = await searchParams;
  const range = isRangeKey(r) ? r : '7d';
  const b = rangeBounds(range);
  const { data, error } = await supabase.rpc('sales_report', { p_cafe: cafe.id, p_from: b.from.toISOString(), p_to: b.to.toISOString() });
  if (error || !data) {
    return (
      <div className="card p-6 text-sm">
        Sales reports aren&apos;t switched on yet{error ? ` (${error.message})` : ''}. QRave needs to run the <code>0007_sales_report.sql</code> database update.
      </div>
    );
  }
  return <SalesReportView report={data as SalesReport} range={range} prevLabel={b.prev} basePath="/dashboard/reports" currency={cafe.currency} />;
}
