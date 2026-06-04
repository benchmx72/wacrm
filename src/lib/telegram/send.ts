export function telegramChatIdFromContact(phone: string | null | undefined) {
  const match = /^tg:(-?\d+)$/.exec(phone ?? '')
  return match?.[1] ?? null
}

export async function sendTelegramText(args: {
  botToken: string
  chatId: string
  text: string
}) {
  const response = await fetch(
    `https://api.telegram.org/bot${args.botToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: args.chatId,
        text: args.text,
      }),
    },
  )

  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.ok) {
    throw new Error(
      payload?.description ||
        `Telegram API respondio con HTTP ${response.status}`,
    )
  }

  return payload.result as { message_id: number; date: number }
}
