import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

export default async function ShipmentsLayout({ children }: { children: React.ReactNode }) {
  const mode = (await cookies()).get('cp_mode')?.value ?? '';
  if (mode === 'agent') redirect('/agent'); // hard block

  return <>{children}</>;
}