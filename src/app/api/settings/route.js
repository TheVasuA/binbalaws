import { NextResponse } from 'next/server';
import { getPortfolioSettings } from '@/lib/app-config';

export const dynamic = 'force-dynamic';

// Read-only: settings are changed through /api/admin/settings.
export async function GET() {
  return NextResponse.json(await getPortfolioSettings(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
