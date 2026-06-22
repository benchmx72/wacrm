# SophIA CRM - Guia de despliegue y operacion

Esta guia resume el estado operativo de SophIA CRM para la primera version en
produccion. La idea es que podamos reinstalar, probar o explicar el sistema sin
depender de capturas ni memoria.

## 1. Arquitectura

- App: Next.js 16, React 19, TypeScript.
- Base de datos, Auth y Storage: Supabase.
- Hosting actual: EasyPanel en VPS.
- Dominio actual: `https://crm.sofiaitsolutions.com`.
- Correo: Stalwart SMTP interno.
- Canales soportados: Telegram Bot API y WhatsApp Business API oficial.
- IA: OpenAI para agente, clasificacion, respuestas y transcripcion de audio.

## 2. Comandos principales

Local:

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

Produccion:

```bash
npm ci
npm run build
npm run start
```

En EasyPanel la app esta corriendo con puerto interno `80`. Si se crea otra
instalacion, validar que `PORT=80` o el puerto del servicio coincida con el
dominio configurado.

## 3. Variables de entorno

No guardar secretos reales en Git.

### Supabase

```bash
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SITE_URL=https://crm.sofiaitsolutions.com
```

`SUPABASE_SERVICE_ROLE_KEY` solo debe existir del lado servidor.

### Seguridad y cifrado

```bash
ENCRYPTION_KEY=...
META_APP_SECRET=...
```

`ENCRYPTION_KEY` debe mantenerse estable. Si cambia, las credenciales cifradas
de WhatsApp/Telegram tendran que guardarse de nuevo.

### IA

```bash
OPENAI_API_KEY=...
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
```

`OPENAI_TRANSCRIPTION_MODEL` es opcional.

### SMTP

Configuracion usada con Stalwart interno:

```bash
SMTP_HOST=stalwart
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=usuario@sofiaitsolutions.com
SMTP_PASS=...
SMTP_FROM=usuario@sofiaitsolutions.com
SMTP_FROM_NAME=SophIA CRM
SMTP_TLS_REJECT_UNAUTHORIZED=false
```

Notas:

- Si aparece `535 5.7.8 Authentication credentials invalid`, revisar usuario,
  password y nombre exacto de la cuenta en Stalwart.
- Si aparece error de certificado self-signed, usar
  `SMTP_TLS_REJECT_UNAUTHORIZED=false` para el SMTP interno.

### Citas, recordatorios y cron

```bash
APPOINTMENT_NOTIFICATIONS_SECRET=...
AUTOMATION_CRON_SECRET=...
APPOINTMENT_DEFAULT_TIMEZONE=America/Belem
NEXT_PUBLIC_DEFAULT_TIMEZONE=America/Belem
```

`APPOINTMENT_NOTIFICATIONS_SECRET` protege el worker que envia correos y
recordatorios.

## 4. Supabase

Aplicar todas las migraciones en orden, desde `001_initial_schema.sql` hasta
`027_accounts.sql`.

Revisar especialmente que existan las tablas de:

- cuentas/clientes
- perfiles y roles
- canales de mensajeria
- citas
- notificaciones de citas
- solicitudes de cambio de cita
- control de IA por conversacion

### Auth URL Configuration

En Supabase Auth:

- Site URL: `https://crm.sofiaitsolutions.com`
- Redirect URLs: `https://crm.sofiaitsolutions.com/**`

Si una invitacion o reset password manda a `localhost`, revisar esta seccion y
tambien `NEXT_PUBLIC_SITE_URL`.

## 5. EasyPanel

Crear un proyecto y una app:

- Tipo: App.
- Fuente: GitHub.
- Repo: `benchmx72/wacrm`.
- Rama: `main`.
- Build path: `/`.
- Builder: Nixpacks.
- Install command: `npm ci`.
- Build command: `npm run build`.
- Start command: `npm run start`.
- Puerto interno: `80`.

Agregar las variables de entorno en la seccion `Ambiente` de la app.

Dominio:

- Host: `crm.sofiaitsolutions.com`.
- HTTPS activo.
- Ruta: `/`.
- Destino interno: app en puerto `80`.

## 6. DNS

En Cloudflare:

- Registro `A`
- Nombre: `crm`
- Valor: IP del VPS
- Proxy: normalmente `DNS only` mientras EasyPanel emite SSL.

Despues de validar SSL y dominio, se puede evaluar activar proxy de Cloudflare.

## 7. Telegram

1. Crear bot en BotFather.
2. Copiar usuario del bot y token.
3. En SophIA CRM, ir a Configuracion -> Canal y seleccionar Telegram.
4. Ir a Configuracion -> Config. Telegram.
5. Guardar usuario y token.
6. Webhook:

```text
https://crm.sofiaitsolutions.com/api/telegram/webhook
```

Si hay que registrarlo manualmente:

```text
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://crm.sofiaitsolutions.com/api/telegram/webhook
```

Respuesta esperada:

```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

El bot debe recibir `/start` y mensajes reales. El CRM debe crear conversacion,
contacto y mensajes en Bandeja.

## 8. WhatsApp oficial

Para clientes que usen WhatsApp:

1. Crear app en Meta for Developers.
2. Agregar producto WhatsApp.
3. Configurar:
   - Phone Number ID.
   - WhatsApp Business Account ID.
   - Permanent Access Token.
   - Webhook Verify Token.
4. Webhook callback:

```text
https://crm.sofiaitsolutions.com/api/whatsapp/webhook
```

Las plantillas de mensajes solo aplican para WhatsApp, porque Meta exige
plantillas aprobadas para ciertos envios y campanas.

## 9. Cron de citas y recordatorios

El endpoint recomendado es:

```text
/api/appointments/notifications/drain
```

Prueba manual dentro del contenedor de la app:

```bash
curl "http://localhost:80/api/appointments/notifications/drain?secret=$APPOINTMENT_NOTIFICATIONS_SECRET"
```

Respuesta esperada:

```json
{"reminders_queued":0,"processed":2,"sent":2,"failed":0,"skipped":0}
```

### Cron en SSH del VPS

Entrar por SSH y ejecutar:

```bash
crontab -e
```

Elegir `nano` si pregunta editor. Agregar:

```cron
APPOINTMENT_NOTIFICATIONS_SECRET=REEMPLAZAR_CON_LA_MISMA_LLAVE
*/5 * * * * curl -fsS "https://crm.sofiaitsolutions.com/api/appointments/notifications/drain?secret=$APPOINTMENT_NOTIFICATIONS_SECRET" >/dev/null 2>&1
```

Guardar en nano:

- `Ctrl + O`
- `Enter`
- `Ctrl + X`

Validar:

```bash
crontab -l
```

## 10. Flujo completo de prueba V1

1. Iniciar sesion como Super Admin.
2. Crear o revisar cliente/cuenta.
3. Seleccionar canal: Telegram o WhatsApp.
4. Configurar credenciales del canal.
5. Enviar mensaje real desde Telegram/WhatsApp.
6. Confirmar que aparece en Bandeja.
7. Confirmar que se crea contacto.
8. Confirmar que el agente responde si IA esta activa.
9. Confirmar que captura nombre, telefono, email e intencion.
10. Confirmar que crea o actualiza negocio en Pipeline.
11. Confirmar que propone/gestiona cita.
12. Confirmar que al editar/confirmar cita se generan notificaciones.
13. Ejecutar el drain manual o esperar cron.
14. Confirmar correo recibido por staff y cliente.
15. Confirmar que la cita aparece con historial operativo.

## 11. Roles

Resumen operativo:

- Super Admin:
  - ve demos y administracion global
  - configura clientes/cuentas
  - puede ver y administrar todo
- Admin cliente:
  - administra su cuenta
  - gestiona equipo, canal, contactos, bandeja, citas, pipelines y reglas
  - no ve demos globales ni configuracion de otros clientes
- Staff:
  - opera bandeja, contactos y citas
  - no administra integraciones criticas ni usuarios
- Viewer/consulta:
  - acceso limitado de lectura donde aplique

## 12. Problemas comunes

### El worker responde 401

La llave no coincide. Probar con query param:

```bash
curl "http://localhost:80/api/appointments/notifications/drain?secret=$APPOINTMENT_NOTIFICATIONS_SECRET"
```

Si se ejecuta desde cron del servidor, definir la variable dentro del crontab o
pegar la llave exacta en la URL.

### Correos fallan con credenciales invalidas

Error:

```text
535 5.7.8 Authentication credentials invalid
```

Revisar `SMTP_USER`, `SMTP_PASS` y que el usuario exista exactamente igual en
Stalwart.

### Correos fallan por certificado self-signed

Usar:

```bash
SMTP_TLS_REJECT_UNAUTHORIZED=false
```

### Invitaciones o reset password mandan a localhost

Revisar:

- `NEXT_PUBLIC_SITE_URL`
- Supabase Auth -> Site URL
- Supabase Auth -> Redirect URLs

### Telegram no llega a la bandeja

Revisar:

- canal activo en Configuracion -> Canal
- token guardado
- webhook registrado
- endpoint `https://crm.sofiaitsolutions.com/api/telegram/webhook`
- logs del servicio en EasyPanel

### EasyPanel muestra SIGTERM en logs

Durante redeploy es normal ver procesos anteriores terminados con `SIGTERM`.
Validar que al final aparezca `Ready` y la app responda por dominio.

## 13. Checklist antes de vender demo

- Dominio productivo funcionando con HTTPS.
- Login, invitacion y reset password apuntan al dominio real.
- Super Admin no se mezcla con cliente.
- Admin cliente y Staff ven solo lo que corresponde.
- Telegram probado extremo a extremo.
- WhatsApp oficial probado cuando aplique.
- IA responde y respeta pausa/intervencion humana.
- Contactos, pipeline y citas se actualizan.
- Correo SMTP envia confirmaciones y recordatorios.
- Cron activo.
- Backups definidos para Supabase y repo.

## 14. Pendientes recomendados

- Pantalla de salud del cron y ultimos envios.
- Auditoria final de RLS/API por rol.
- Campos configurables de intake por cliente.
- Configuracion visual de disponibilidad de citas.
- Exportacion ICS mas visible en correos.
- Integracion opcional futura con Google Calendar/CalDAV.
- Migrar `middleware` a `proxy` cuando Next.js lo requiera.
