// SEC EDGAR requires a descriptive User-Agent and caps clients at 10 req/s.
// We throttle to 8 req/s to stay clear of the limit.

const USER_AGENT = "InsiderTracker/0.1 (alexislowys@gmail.com)";
const MIN_INTERVAL_MS = 125;

let lastRequestAt = 0;
let queue: Promise<void> = Promise.resolve();

function throttle(): Promise<void> {
  const next = queue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
  });
  queue = next;
  return next;
}

export async function edgarFetch(url: string, retries = 3): Promise<Response> {
  await throttle();
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Encoding": "gzip, deflate",
      },
    });
  } catch (e) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 2000 * (4 - retries)));
      return edgarFetch(url, retries - 1);
    }
    throw e;
  }
  if ((res.status === 429 || res.status === 503) && retries > 0) {
    await new Promise((r) => setTimeout(r, 2000 * (4 - retries)));
    return edgarFetch(url, retries - 1);
  }
  if (!res.ok) {
    throw new Error(`EDGAR ${res.status} ${res.statusText}: ${url}`);
  }
  return res;
}

export async function edgarText(url: string): Promise<string> {
  return (await edgarFetch(url)).text();
}

export async function edgarJson<T>(url: string): Promise<T> {
  return (await edgarFetch(url)).json() as Promise<T>;
}
