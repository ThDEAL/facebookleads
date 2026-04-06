# Facebook Leads + Live Agent Automation Skill

## Project Overview

This is a **Facebook-to-Live Agent lead automation** system for ThailanDeal (thailandeal.com). It captures leads from Facebook channels and automatically creates contacts + support tickets in Live Agent CRM.

**Domain:** Travel agency (Thailand trips with personal VIP agent service)
**Language:** Hebrew (RTL) for all user-facing content
**Deployment:** Vercel serverless functions
**Runtime:** Node.js with zero npm dependencies (native `https` + `crypto` only)

---

## Architecture

```
Facebook Webhook (POST /api/webhook)
  ├── Lead Forms (leadgen) ──→ Fetch lead data ──→ Find/Create Contact ──→ Create Ticket
  ├── Messenger messages ────→ Fetch profile ────→ Find/Create Contact ──→ Create Ticket
  └── Instagram DMs ─────────→ Fetch profile ────→ Find/Create Contact ──→ Create Ticket
```

**Single entry point:** `api/webhook.js` handles all 3 channels.

---

## External APIs

### Facebook Graph API v21.0
- **Base:** `https://graph.facebook.com/v21.0/`
- **Auth:** `FACEBOOK_PAGE_ACCESS_TOKEN` as query param
- **Endpoints used:**
  - `GET /{leadgen_id}` - Fetch lead form data (full_name, email, phone_number)
  - `GET /{sender_id}?fields=name,email` - Fetch Messenger/Instagram sender profile
- **Webhook verification:** GET with `hub.mode`, `hub.verify_token`, `hub.challenge`
- **Webhook signature:** `FACEBOOK_APP_SECRET` via `crypto` module (available but not yet enforced)

### Live Agent REST API
- **Base:** `LIVEAGENT_BASE_URL` environment variable
- **Auth:** `apikey` header with `LIVEAGENT_API_KEY`
- **Endpoints:**
  - `GET /contacts?_filters={email}` - Search contacts by email
  - `POST /contacts` - Create contact (firstname, lastname, system_name, emails[], phones[])
  - `POST /tickets` - Create ticket (subject, departmentid, recipient, message, tags, status)
- **Contact deduplication:** Always search by email before creating

---

## Environment Variables (Required)

| Variable | Purpose |
|----------|---------|
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Facebook Page access token for Graph API |
| `FACEBOOK_APP_SECRET` | Facebook App secret for webhook signature verification |
| `VERIFY_TOKEN` | Custom token for Facebook webhook handshake |
| `LIVEAGENT_API_KEY` | Live Agent API authentication key |
| `LIVEAGENT_BASE_URL` | Live Agent API base URL (e.g. `https://app.liveagent.com/api/v3`) |

These are set in **Vercel dashboard**, not in .env files.

---

## Coding Conventions

1. **Zero dependencies** - Use only native Node.js modules (`https`, `crypto`). Never add npm packages.
2. **Single-file architecture** - All logic in `api/webhook.js`. Keep it that way unless splitting is truly needed.
3. **Hebrew RTL content** - All ticket HTML uses `dir="rtl"` and `lang="he"`. Labels, defaults, and tags are in Hebrew.
4. **Logging pattern** - Use `console.log("[Category] message", data)` with brackets for category (e.g. `[FB GET]`, `[LA POST]`, `[Leadgen]`, `[Webhook]`).
5. **Error handling** - Wrap processing in try-catch but always return `200` to Facebook immediately (before async processing).
6. **HTTP helper pattern** - Use the existing `request()`, `fbGet()`, `laPost()`, `laGet()` functions for all API calls.
7. **Contact flow** - Always `findOrCreateContact()` before `createTicket()`. Never create tickets without a contact lookup.

---

## Tag System

| Source | Hebrew Tags |
|--------|-------------|
| Lead Form | `ליד-פייסבוק,טופס-ליד,facebook-lead-form` |
| Messenger | `ליד-מסנגר,facebook-messenger,הודעה-נכנסת` |
| Instagram | `ליד-אינסטגרם,instagram-dm,הודעה-נכנסת` |

---

## Ticket Format

- **Subject:** `חופשה לתאילנד בליווי סוכן אישי שירות VIP | {Name} ({Source})`
- **Department:** `default`
- **Recipient:** `order@thailandeal.com`
- **Status:** `N` (New)
- **Mail:** `do_not_send_mail: "Y"`
- **Body:** HTML table with lead details (name, email, phone, source, message)

---

## Common Tasks & How To

### Add a new Facebook channel/source
1. Add a new handler function following `handleLeadgen()` / `handleMessaging()` pattern
2. Add routing logic in the main `for (const entry of body.entry)` loop
3. Define Hebrew tags and source label in `createTicket()` sourceLabel mapping
4. Test with Facebook webhook test tool

### Add new fields from lead forms
1. Extend the field parsing loop in `handleLeadgen()` (the `for (const f of fields)` block)
2. Add the field to `buildTicketHtml()` table rows
3. Pass the field through `createTicket()` and `findOrCreateContact()` if relevant

### Add webhook signature verification
Use `crypto.createHmac('sha256', FB_SECRET)` to verify `X-Hub-Signature-256` header against request body. Insert before processing in the POST handler.

### Add a new Live Agent field
Follow the existing pattern in `laPost()` / contact/ticket body objects. Check Live Agent API docs for available fields.

### Debug webhook issues
1. Check Vercel function logs for `[Webhook]`, `[FB GET]`, `[LA POST]` prefixed messages
2. Use Facebook App Dashboard > Webhooks > Test to send test events
3. Verify env vars are set in Vercel dashboard

---

## Testing Webhook Locally

```bash
# Simulate a lead form webhook
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "page",
    "entry": [{
      "id": "PAGE_ID",
      "time": 1234567890,
      "changes": [{
        "field": "leadgen",
        "value": { "leadgen_id": "LEAD_ID" }
      }]
    }]
  }'

# Simulate a Messenger message
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "page",
    "entry": [{
      "id": "PAGE_ID",
      "time": 1234567890,
      "messaging": [{
        "sender": { "id": "SENDER_ID" },
        "message": { "text": "שלום, מעוניין בחופשה לתאילנד" }
      }]
    }]
  }'
```

---

## Key Decisions & Constraints

- **No npm dependencies** - Intentional. Keeps cold starts fast on Vercel and reduces attack surface.
- **Immediate 200 response** - Facebook requires fast responses; processing happens after `res.status(200).json()`.
- **Email-based dedup** - Contacts are matched by email only. If no email, a new contact is always created.
- **Single department** - All tickets go to `default` department. Route by tags, not departments.
- **Hebrew defaults** - `"לא ידוע"` ("unknown") used when name is missing. `"לא צוין"` ("not specified") in HTML.
