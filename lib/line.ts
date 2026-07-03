import 'server-only';

// ยืนยัน LINE ID token ฝั่ง server → คืน LINE userId (sub) ที่เชื่อถือได้
// ป้องกันการปลอม userId จาก client
export async function verifyLineIdToken(idToken: string | null | undefined): Promise<string | null> {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!idToken || !channelId) return null;

  try {
    const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { sub?: string };
    return data.sub ?? null;
  } catch {
    return null;
  }
}
