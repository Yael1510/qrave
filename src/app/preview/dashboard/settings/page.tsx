import SettingsForm from '@/app/dashboard/settings/SettingsForm';
import { getDemo } from '@/lib/demo/seed';

export const metadata = { title: 'Settings · QRave' };

export default async function PreviewSettings() {
  const demo = await getDemo();
  return <SettingsForm cafe={demo.cafe} />;
}
