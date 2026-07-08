import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const url = new URL('/login', request.url);
  url.searchParams.set('clearDevice', '1');
  url.searchParams.set('external', '1');

  return NextResponse.redirect(url);
}
