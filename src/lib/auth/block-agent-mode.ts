import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function blockIfAgentMode() {
  const mode = (await cookies()).get('cp_mode')?.value ?? '';
  if (mode === 'agent') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return null;
}