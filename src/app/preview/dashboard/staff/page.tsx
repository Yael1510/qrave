import StaffManager from '@/app/dashboard/staff/StaffManager';
import { getDemo } from '@/lib/demo/seed';

export const metadata = { title: 'Staff · QRave' };

// Display only: adding staff runs a server action against the real database, so it fails here (not signed in).
export default async function PreviewStaff() {
  const demo = await getDemo();
  return <StaffManager members={demo.members} currentUserId="demo-owner" />;
}
