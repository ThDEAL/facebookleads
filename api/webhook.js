const https = require("https");
const crypto = require("crypto");

const FB_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const FB_SECRET = process.env.FACEBOOK_APP_SECRET;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const LA_KEY = process.env.LIVEAGENT_API_KEY;
const LA_BASE = process.env.LIVEAGENT_BASE_URL;

// ---------------------------------------------------------------------------
// HTTP helpers (native https, no dependencies)
// ---------------------------------------------------------------------------

function request(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method,
      headers: { ...headers },
    };
    if (body) {
      const data = typeof body === "string" ? body : JSON.stringify(body);
      opts.headers["Content-Type"] = opts.headers["Content-Type"] || "application/json";
      opts.headers["Content-Length"] = Buffer.byteLength(data);
    }
    const req = https.request(opts, (res) => {
      let chunks = "";
      res.on("data", (c) => (chunks += c));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(chunks) });
        } catch {
          resolve({ status: res.statusCode, data: chunks });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

function fbGet(path) {
  const url = `https://graph.facebook.com/v21.0/${path}${path.includes("?") ? "&" : "?"}access_token=${FB_TOKEN}`;
  console.log("[FB GET]", url.replace(FB_TOKEN, "TOKEN"));
  return request("GET", url);
}

function laPost(endpoint, body) {
  const url = `${LA_BASE}${endpoint}`;
  console.log("[LA POST]", url, JSON.stringify(body));
  return request("POST", url, body, {
    "Content-Type": "application/json",
    apikey: LA_KEY,
  });
}

function laGet(endpoint) {
  const url = `${LA_BASE}${endpoint}`;
  console.log("[LA GET]", url);
  return request("GET", url, null, { apikey: LA_KEY });
}

// ---------------------------------------------------------------------------
// Lead processing helpers
// ---------------------------------------------------------------------------

function splitName(fullName) {
  if (!fullName) return { first: "לא ידוע", last: "" };
  const parts = fullName.trim().split(/\s+/);
  return { first: parts[0], last: parts.slice(1).join(" ") || "" };
}

async function findOrCreateContact({ name, email, phone }) {
  const { first, last } = splitName(name);

  // Try to find existing contact by email
  if (email) {
    try {
      const filters = encodeURIComponent(JSON.stringify({ email: email }));
      const search = await laGet(`/contacts?_filters=${filters}`);
      console.log("[LA] Contact search result:", JSON.stringify(search.data));
      if (search.data && search.data.response && search.data.response.length > 0) {
        const existing = search.data.response[0];
        console.log("[LA] Found existing contact:", existing.contactid || existing.id);
        return existing.contactid || existing.id;
      }
    } catch (err) {
      console.error("[LA] Contact search error:", err.message);
    }
  }

  // Create new contact
  const contactBody = {
    firstname: first,
    lastname: last,
    system_name: name || "לא ידוע",
    emails: email ? [email] : [],
    phones: phone ? [phone] : [],
  };

  const res = await laPost("/contacts", contactBody);
  console.log("[LA] Create contact response:", JSON.stringify(res.data));

  if (res.data && res.data.response && res.data.response.contactid) {
    return res.data.response.contactid;
  }
  if (res.data && res.data.response && res.data.response.id) {
    return res.data.response.id;
  }
  return null;
}

function buildTicketHtml({ name, email, phone, source, message }) {
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;direction:rtl;text-align:right;">
<h2 style="color:#1a73e8;">ליד חדש מ${source}</h2>
<table style="border-collapse:collapse;width:100%;max-width:500px;" dir="rtl">
  <tr style="background:#f0f4ff;">
    <td style="padding:8px 12px;border:1px solid #ddd;font-weight:bold;width:120px;">שם מלא</td>
    <td style="padding:8px 12px;border:1px solid #ddd;">${name || "לא צוין"}</td>
  </tr>
  <tr>
    <td style="padding:8px 12px;border:1px solid #ddd;font-weight:bold;">אימייל</td>
    <td style="padding:8px 12px;border:1px solid #ddd;">${email || "לא צוין"}</td>
  </tr>
  <tr style="background:#f0f4ff;">
    <td style="padding:8px 12px;border:1px solid #ddd;font-weight:bold;">טלפון</td>
    <td style="padding:8px 12px;border:1px solid #ddd;">${phone || "לא צוין"}</td>
  </tr>
  <tr>
    <td style="padding:8px 12px;border:1px solid #ddd;font-weight:bold;">מקור</td>
    <td style="padding:8px 12px;border:1px solid #ddd;">${source}</td>
  </tr>
  ${message ? `<tr style="background:#f0f4ff;">
    <td style="padding:8px 12px;border:1px solid #ddd;font-weight:bold;">הודעה</td>
    <td style="padding:8px 12px;border:1px solid #ddd;">${message}</td>
  </tr>` : ""}
</table>
<p style="color:#888;font-size:12px;margin-top:16px;">נוצר אוטומטית מ-Facebook Webhook</p>
</body>
</html>`;
}

async function createTicket({ name, email, phone, source, tags, message, contactId }) {
  const sourceLabel =
    source === "leadform" ? "טופס לידים" :
    source === "messenger" ? "מסנג'ר" :
    source === "instagram" ? "אינסטגרם" : source;

  const subject = `חופשה לתאילנד בליווי סוכן אישי שירות VIP | ${name || "לא ידוע"} (${sourceLabel})`;

  const ticketBody = {
    subject,
    departmentid: "default",
    recipient: "order@thailandeal.com",
    message: buildTicketHtml({ name, email, phone, source: sourceLabel, message }),
    tags,
    do_not_send_mail: "Y",
    status: "N",
  };

  if (contactId) {
    ticketBody.contactid = contactId;
  }

  const res = await laPost("/tickets", ticketBody);
  console.log("[LA] Create ticket response:", JSON.stringify(res.data));
  return res;
}

// ---------------------------------------------------------------------------
// Event handlers per channel
// ---------------------------------------------------------------------------

async function handleLeadgen(entry) {
  for (const change of entry.changes || []) {
    if (change.field !== "leadgen") continue;
    const leadgenId = change.value && change.value.leadgen_id;
    if (!leadgenId) continue;

    console.log("[Leadgen] Processing lead ID:", leadgenId);

    const leadRes = await fbGet(`${leadgenId}`);
    console.log("[Leadgen] FB response:", JSON.stringify(leadRes.data));

    const fields = (leadRes.data && leadRes.data.field_data) || [];
    let name = "", email = "", phone = "";
    for (const f of fields) {
      const val = (f.values && f.values[0]) || "";
      if (f.name === "full_name") name = val;
      else if (f.name === "email") email = val;
      else if (f.name === "phone_number") phone = val;
    }

    console.log("[Leadgen] Parsed:", { name, email, phone });

    const contactId = await findOrCreateContact({ name, email, phone });
    await createTicket({
      name,
      email,
      phone,
      source: "leadform",
      tags: "ליד-פייסבוק,טופס-ליד,facebook-lead-form",
      contactId,
    });
  }
}

async function handleMessaging(entry, source) {
  for (const msg of entry.messaging || []) {
    if (!msg.message || msg.message.is_echo) continue;
    const senderId = msg.sender && msg.sender.id;
    if (!senderId) continue;

    console.log(`[${source}] Message from sender:`, senderId);

    const profileRes = await fbGet(`${senderId}?fields=name,email`);
    console.log(`[${source}] Profile:`, JSON.stringify(profileRes.data));

    const name = (profileRes.data && profileRes.data.name) || "";
    const email = (profileRes.data && profileRes.data.email) || "";
    const text = (msg.message && msg.message.text) || "";

    const tags =
      source === "messenger"
        ? "ליד-מסנגר,facebook-messenger,הודעה-נכנסת"
        : "ליד-אינסטגרם,instagram-dm,הודעה-נכנסת";

    const contactId = await findOrCreateContact({ name, email, phone: "" });
    await createTicket({
      name,
      email,
      phone: "",
      source,
      tags,
      message: text,
      contactId,
    });
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

module.exports = async function handler(req, res) {
  // --- GET: Facebook verification ---
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    console.log("[Verify] mode:", mode, "token:", token);

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("[Verify] Success");
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  }

  // --- POST: Webhook events ---
  if (req.method === "POST") {
    const body = req.body;
    console.log("[Webhook] Received:", JSON.stringify(body));

    // Always respond 200 to Facebook immediately
    res.status(200).json({ status: "ok" });

    try {
      if (!body || !body.entry) {
        console.log("[Webhook] No entry in body");
        return;
      }

      for (const entry of body.entry) {
        // Lead form
        if (body.object === "page" && entry.changes) {
          const hasLeadgen = entry.changes.some((c) => c.field === "leadgen");
          if (hasLeadgen) {
            await handleLeadgen(entry);
            continue;
          }
        }

        // Messenger
        if (body.object === "page" && entry.messaging) {
          await handleMessaging(entry, "messenger");
          continue;
        }

        // Instagram
        if (body.object === "instagram" && entry.messaging) {
          await handleMessaging(entry, "instagram");
          continue;
        }
      }
    } catch (err) {
      console.error("[Webhook] Error processing event:", err.message, err.stack);
    }
    return;
  }

  res.status(405).send("Method Not Allowed");
};
