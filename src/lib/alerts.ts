// Watchlist alerts: subscribe to a ticker, get an email when a new Form 4
// lands. Emails go through Resend's REST API when RESEND_API_KEY is set;
// without a key, pending alerts are logged and left unsent (they dispatch
// once a key is configured — nothing is marked sent prematurely).

import { randomBytes } from "node:crypto";
import type { Db } from "./db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function subscribe(
  db: Db,
  email: string,
  ticker: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Invalid email" };

  // Abuse cap: one address can't be signed up for an unbounded number of
  // tickers (junk-row / email-bomb surface, since there's no double opt-in)
  const [{ n }] = await db.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM alert_subscriptions WHERE email = $1`,
    [email.toLowerCase()],
  );
  if (Number(n) >= 50) {
    return { ok: false, error: "Subscription limit reached for this email" };
  }

  const company = await db.query<{ cik: string }>(
    `SELECT cik FROM companies WHERE ticker = $1`,
    [ticker.toUpperCase()],
  );
  if (company.length === 0) return { ok: false, error: "Unknown ticker" };

  await db.query(
    `INSERT INTO alert_subscriptions (email, company_cik, token)
     VALUES ($1, $2, $3) ON CONFLICT (email, company_cik) DO NOTHING`,
    [email.toLowerCase(), company[0].cik, randomBytes(24).toString("hex")],
  );
  return { ok: true };
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

/** Send alerts for filings subscribers haven't been notified about yet. */
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
     WHERE NOT EXISTS (
       SELECT 1 FROM alert_notifications n
       WHERE n.subscription_id = s.id AND n.accession_number = f.accession_number
     )
     GROUP BY s.id, s.email, s.token, c.ticker, c.name, f.accession_number, f.filed_date
     ORDER BY s.email, f.filed_date`,
    [],
  );

  if (pending.length === 0) return { sent: 0, pending: 0 };

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[alerts] ${pending.length} alerts pending, RESEND_API_KEY not set — skipping send`);
    return { sent: 0, pending: pending.length };
  }

  const from = process.env.ALERT_FROM ?? "InsiderTracker <onboarding@resend.dev>";
  const base = process.env.APP_URL ?? "https://insider-tracker-three.vercel.app";
  let sent = 0;

  for (const a of pending) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: a.email,
        subject: `${a.ticker}: new insider filing (${a.insider_names})`,
        html:
          `<p>New Form 4 filed for <strong>${a.ticker}</strong> (${a.company_name}) ` +
          `on ${a.filed_date.slice(0, 10)} by ${a.insider_names}.</p>` +
          `<p><a href="${base}/company/${a.ticker}">View activity</a> · ` +
          `<a href="${base}/api/alerts/unsubscribe?token=${a.token}">Unsubscribe</a></p>`,
      }),
    });
    if (!res.ok) {
      console.error(`[alerts] send failed (${res.status}): ${await res.text()}`);
      continue; // stays pending, retried next cron run
    }
    await db.query(
      `INSERT INTO alert_notifications (subscription_id, accession_number)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [a.subscription_id, a.accession_number],
    );
    sent++;
  }
  return { sent, pending: pending.length };
}
