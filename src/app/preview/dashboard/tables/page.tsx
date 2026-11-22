import TablesManager from '@/app/dashboard/tables/TablesManager';
import { getDemo } from '@/lib/demo/seed';

export const metadata = { title: 'Tables & QR · QRave' };

export default async function PreviewTables() {
  const demo = await getDemo();
  return <TablesManager cafe={demo.cafe} initialTables={demo.tables} siteUrl="" />;
}
