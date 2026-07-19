// Watchlist alerts: confirm your email (double opt-in), then get an email
// when a new Form 4 lands for a watched ticker. Emails go through Resend's
// REST API when RESEND_API_KEY is set; without a key, sends are logged and
// skipped (nothing is marked sent/confirmed prematurely).

import { randomBytes } from "node:crypto";
import type { Db } from "./db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FROM = process.env.ALERT_FROM ?? "InsiderTracker <onboarding@resend.dev>";
const BASE = process.env.APP_URL ?? "https://insider-tracker-three.vercel.app";

/** Send one email via Resend. Returns false (not throw) so callers continue. */
async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[alerts] RESEND_API_KEY not set — would email ${to}: ${subject}`);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) {
    console.error(`[alerts] send failed (${res.status}): ${await res.text()}`);
    return false;
  }
  return true;
}

export async function subscribe(
  db: Db,
  email: string,
  ticker: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Invalid email" };
  const addr = email.toLowerCase();

  // Abuse cap: one address can't be signed up for an unbounded number of tickers
  const [{ n }] = await db.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM alert_subscriptions WHERE email = $1`,
    [addr],
  );
  if (Number(n) >= 50) {
    return { ok: false, error: "Subscription limit reached for this email" };
  }

  const company = await db.query<{ cik: string }>(
    `SELECT cik FROM companies WHERE ticker = $1`,
    [ticker.toUpperCase()],
  );
  if (company.length === 0) return { ok: false, error: "Unknown ticker" };

  const token = randomBytes(24).toString("hex");
  const [row] = await db.query<{ token: string; confirmed: boolean }>(
    `INSERT INTO alert_subscriptions (email, company_cik, token)
     VALUES ($1, $2, $3)
     ON CONFLICT (email, company_cik) DO UPDATE SET email = EXCLUDED.email
     RETURNING token, confirmed`,
    [addr, company[0].cik, token],
  );

  // Already confirmed from a prior signup — nothing to re-confirm
  if (row.confirmed) return { ok: true };

  // Double opt-in: the address must click the link before any alert fires.
  // This is what stops someone subscribing a victim's email without consent.
  await sendEmail(
    addr,
    `Confirm alerts for ${ticker.toUpperCase()}`,
    `<p>Confirm you want insider-filing alerts for ` +
      `<strong>${ticker.toUpperCase()}</strong>.</p>` +
      `<p><a href="${BASE}/api/alerts/confirm?token=${row.token}">Confirm alerts</a></p>` +
      `<p>If you didn't request this, ignore this email — no alerts are sent ` +
      `until you confirm.</p>`,
  );
  return { ok: true };
}

export async function confirmSubscription(db: Db, token: string): Promise<boolean> {
  const rows = await db.query(
    `UPDATE alert_subscriptions SET confirmed = TRUE
     WHERE token = $1 AND confirmed = FALSE RETURNING id`,
    [token],
  );
  return rows.length > 0;
}

export async function unsubscribe(db: Db, token: string): Promise<boolean> {
  const rows = await db.query(
    `DELETE FROM alert_subscriptions WHERE token = $1 RETURNING id`,
    [token],
  );
  return rows.length > 0;
}

interface PendingAlert {
  subscription_id: string;
  email: string;
  token: string;
  ticker: string;
  company_name: string;
  accession_number: string;
  insider_names: string;
  filed_date: string;
}

/** Send alerts for filings confirmed subscribers haven't been notified about. */
export async function dispatchAlerts(db: Db): Promise<{ sent: number; pending: number }> {
  const pending = await db.query<PendingAlert>(
    `SELECT s.id AS subscription_id, s.email, s.token,
            c.ticker, c.name AS company_name,
            f.accession_number, f.filed_date::text,
            STRING_AGG(DISTINCT i.name, ', ') AS insider_names
     FROM alert_subscriptions s
     JOIN filings f ON f.company_cik = s.company_cik
       AND f.filed_date > GREATEST(s.created_at::date - 1, CURRENT_DATE - 7)
     JOIN companies c ON c.cik = s.company_cik
     JOIN filing_owners fo ON fo.accession_number = f.accession_number
     JOIN insiders i ON i.cik = fo.insider_cik
     WHERE s.confirmed
       AND NOT EXISTS (
         SELECT 1 FROM alert_notifications n
         WHERE n.subscription_id = s.id AND n.accession_number = f.accession_number
       )
     GROUP BY s.id, s.email, s.token, c.ticker, c.name, f.accession_number, f.filed_date
     ORDER BY s.email, f.filed_date`,
    [],
  );

  if (pending.length === 0) return { sent: 0, pending: 0 };

  let sent = 0;
  for (const a of pending) {
    const ok = await sendEmail(
      a.email,
      `${a.ticker}: new insider filing (${a.insider_names})`,
      `<p>New Form 4 filed for <strong>${a.ticker}</strong> (${a.company_name}) ` +
        `on ${a.filed_date.slice(0, 10)} by ${a.insider_names}.</p>` +
        `<p><a href="${BASE}/company/${a.ticker}">View activity</a> · ` +
        `<a href="${BASE}/api/alerts/unsubscribe?token=${a.token}">Unsubscribe</a></p>`,
    );
    if (!ok) continue; // stays pending, retried next cron run
    await db.query(
      `INSERT INTO alert_notifications (subscription_id, accession_number)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [a.subscription_id, a.accession_number],
    );
    sent++;
  }
  return { sent, pending: pending.length };
}
