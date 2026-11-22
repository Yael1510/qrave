import { requireOwner } from '@/lib/membership';
import SettingsForm from './SettingsForm';

export const metadata = { title: 'Settings · QRave' };

export default async function SettingsPage() {
  const { cafe } = await requireOwner();
  return <SettingsForm cafe={cafe} />;
}
