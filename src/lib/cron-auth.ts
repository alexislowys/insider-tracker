import { timingSafeEqual } from "node:crypto";

// Fails closed: an unset CRON_SECRET means nobody is authorized, not
// everybody — losing the env var must not silently open the endpoints.
export function cronAuthorized(authorization: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(authorization ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}
