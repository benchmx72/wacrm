import { isSmtpConfigured, sendSmtpEmail } from '@/lib/email/smtp';

type SendInvitationEmailInput = {
  to: string;
  fullName: string;
  actionLink: string;
  roleLabel?: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function invitationHtml({ fullName, actionLink, roleLabel }: SendInvitationEmailInput) {
  const safeName = escapeHtml(fullName || 'Usuario');
  const safeLink = escapeHtml(actionLink);
  const safeRole = roleLabel ? escapeHtml(roleLabel) : 'Usuario del CRM';

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Invitacion a SophIA CRM</title>
  </head>
  <body style="margin:0;background:#0E0B2E;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0E0B2E;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#151132;border:1px solid rgba(127,119,221,.28);border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 18px;">
                <div style="font-size:24px;font-weight:800;letter-spacing:-.5px;">Soph<span style="color:#0ABFAD;">IA</span> CRM</div>
                <div style="margin-top:8px;color:#B8B3F0;font-size:13px;">Invitacion de acceso</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 28px;">
                <h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;">Hola ${safeName},</h1>
                <p style="margin:0 0 16px;color:#AEACC4;font-size:15px;line-height:1.6;">
                  Te invitaron a entrar a SophIA CRM como <strong style="color:#ffffff;">${safeRole}</strong>.
                  Para activar tu acceso, abre el enlace y crea tu contrasena.
                </p>
                <p style="margin:0 0 24px;color:#AEACC4;font-size:15px;line-height:1.6;">
                  Este enlace es personal. Si no esperabas esta invitacion, puedes ignorar este correo.
                </p>
                <a href="${safeLink}" style="display:inline-block;background:#534AB7;color:#ffffff;text-decoration:none;font-weight:700;border-radius:10px;padding:13px 18px;">
                  Crear mi contrasena
                </a>
                <p style="margin:24px 0 0;color:#7B78A0;font-size:12px;line-height:1.5;">
                  Si el boton no abre, copia este enlace en tu navegador:<br />
                  <span style="color:#B8B3F0;word-break:break-all;">${safeLink}</span>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendInvitationEmail(input: SendInvitationEmailInput) {
  if (!isSmtpConfigured()) {
    return { sent: false as const, reason: 'smtp_not_configured' as const };
  }

  const roleText = input.roleLabel ? ` como ${input.roleLabel}` : '';
  await sendSmtpEmail({
    to: input.to,
    subject: 'Invitacion a SophIA CRM',
    text: [
      `Hola ${input.fullName || 'Usuario'},`,
      '',
      `Te invitaron a entrar a SophIA CRM${roleText}.`,
      'Abre este enlace para crear tu contrasena:',
      input.actionLink,
      '',
      'Si no esperabas esta invitacion, puedes ignorar este correo.',
    ].join('\n'),
    html: invitationHtml(input),
  });

  return { sent: true as const };
}
