import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const update = await request.json().catch(() => null);
  console.log('[telegram/webhook] update received', update);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: 'Telegram webhook endpoint ready',
  });
}
