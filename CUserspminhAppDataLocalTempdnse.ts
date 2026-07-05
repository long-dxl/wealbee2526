// DNSE OpenAPI - https://openapi.dnse.com.vn
// Tested live with real credentials 28-May-2026.
//
// AUTH (verified working):
//   x-api-key   : API key (eyJvcmci...)
//   Date        : RFC 2822 UTC  e.g. "Thu, 28 May 2026 04:48:02 +0000"
//   X-Signature : Signature keyId="{key}",algorithm="hmac-sha256",
//                 headers="(request-target) date",signature="{urlEnc(b64(HMAC-SHA256(secret,msg)))}",
//                 nonce="{uuid4hex}"
//   version     : "2026-05-07"
//
// String-to-sign (exact, \n separated, no trailing newline):
//   (request-target): get /accounts/0003757782/positions
//   date: Thu, 28 May 2026 04:48:02 +0000
//   nonce: 798b699dec114a1985a0add3fcaef86c
//
// GET /accounts                          → { accounts: [{ id: "0003757782" }] }
// GET /accounts/:id/positions?marketType=STOCK&pageSize=100 → { positions: [...] }
//
// Position fields (actual from API):
//   symbol, openQuantity, costPrice, marketPrice, breakEvenPrice, accumulateQuantity

const OPEN_API    = '/api/dnse-open'; // Vite proxy → https://openapi.dnse.com.vn
const API_VERSION = '2026-05-07';

// ── Auth helpers ──────────────────────────────────────────────────────────────

function utcDate(): string {
  return new Date().toUTCString().replace('GMT', '+0000');
}

function randomNonce(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

// ⚠️ Browsers forbid setting the standard `Date` header via fetch.
// DNSE also accepts `X-Aux-Date` (shown in official docs), which browsers CAN set.
// String-to-sign uses the lowercase header name: "x-aux-date".
const DATE_HEADER = 'X-Aux-Date';

async function buildHeaders(
  apiKey: string,
  apiSecret: string,
  method: string,
  path: string,         // path only, NO query string (e.g. "/accounts/123/positions")
): Promise<HeadersInit> {
  const dateStr  = utcDate();
  const nonce    = randomNonce();
  const hkLower  = DATE_HEADER.toLowerCase(); // "x-aux-date"

  const stringToSign =
    `(request-target): ${method.toLowerCase()} ${path}\n` +
    `${hkLower}: ${dateStr}\n` +
    `nonce: ${nonce}`;

  const keyBytes = new TextEncoder().encode(apiSecret);
  const msgBytes = new TextEncoder().encode(stringToSign);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBytes = await crypto.subtle.sign('HMAC', cryptoKey, msgBytes);
  const b64      = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));
  const sig      = encodeURIComponent(b64);

  const xSignature =
    `Signature keyId="${apiKey.trim()}",` +
    `algorithm="hmac-sha256",` +
    `headers="(request-target) ${hkLower}",` +
    `signature="${sig}",` +
    `nonce="${nonce}"`;

  return {
    'x-api-key':      apiKey.trim(),
    [DATE_HEADER]:    dateStr,      // X-Aux-Date - browser-safe
    'X-Signature':    xSignature,
    'version':        API_VERSION,
    'Accept':         'application/json',
    'Content-Type':   'application/json',
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DnseSubAccount {
  subAccountId: string;
  subAccountType?: string;
}

export interface DnseAccountInfo {
  accountNo: string;
  subAccounts: DnseSubAccount[];
  rawData?: unknown;
}

export interface DnsePosition {
  symbol: string;
  totalVolume: number;
  availableVolume: number;
  avgPrice: number;
  marketPrice: number;
  totalValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  breakEvenPrice: number;
  createdDate: string | null;
  modifiedDate: string | null;
}

// ── Normalise position from actual DNSE API response ──────────────────────────
// Actual fields returned:
//   symbol, openQuantity, accumulateQuantity, costPrice, marketPrice, breakEvenPrice

function normalizePosition(d: unknown): DnsePosition {
  const o = d as Record<string, unknown>;
  const qty      = Number(o['openQuantity'] ?? o['accumulateQuantity'] ?? o['volume'] ?? 0);
  const cost     = Number(o['costPrice'] ?? o['avgPrice'] ?? o['purchasePrice'] ?? 0);
  const mktPrice = Number(o['marketPrice'] ?? o['currentPrice'] ?? o['lastPrice'] ?? 0);
  const pnl      = (mktPrice - cost) * qty;
  const pnlPct   = cost > 0 ? ((mktPrice - cost) / cost) * 100 : 0;
  return {
    symbol:           String(o['symbol'] ?? ''),
    totalVolume:      qty,
    availableVolume:  Number(o['availableVolume'] ?? o['sellableVolume'] ?? qty),
    avgPrice:         cost,
    marketPrice:      mktPrice,
    totalValue:       qty * mktPrice,
    unrealizedPnl:    pnl,
    unrealizedPnlPct: pnlPct,
    breakEvenPrice:   Number(o['breakEvenPrice'] ?? cost),
    createdDate:      (o['createdDate'] as string) ?? null,
    modifiedDate:     (o['modifiedDate'] as string) ?? null,
  };
}

// ── Account discovery ─────────────────────────────────────────────────────────
// GET /accounts  →  { name, custodyCode, accounts: [{ id: "0003757782" }] }

export async function discoverAccounts(apiKey: string, apiSecret: string): Promise<DnseAccountInfo> {
  const path = '/accounts';
  const h    = await buildHeaders(apiKey, apiSecret, 'GET', path);
  const res  = await fetch(`${OPEN_API}${path}`, { headers: h });
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`DNSE /accounts ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = JSON.parse(text) as Record<string, unknown>;
  console.debug('[DNSE] /accounts:', data);

  const rawAccounts = (data['accounts'] ?? []) as Array<Record<string, unknown>>;
  const subAccounts: DnseSubAccount[] = rawAccounts.map((a) => ({
    subAccountId:   String(a['id'] ?? a['accountNo'] ?? ''),
    subAccountType: a['derivativeAccount'] ? 'STOCK+DERIVATIVE' : 'STOCK',
  }));

  const accountNo = subAccounts[0]?.subAccountId ?? '';

  return { accountNo, subAccounts, rawData: data };
}

export async function fetchAccounts(apiKey: string, apiSecret: string): Promise<DnseAccountInfo> {
  return discoverAccounts(apiKey, apiSecret);
}

// ── Positions ─────────────────────────────────────────────────────────────────
// GET /accounts/:accountNo/positions?marketType=STOCK&pageSize=100
// Response: { positions: [...], pageIndex, pageSize, total }

export async function fetchPositions(
  accountNo: string,
  apiKey: string,
  apiSecret: string,
): Promise<DnsePosition[]> {
  const path = `/accounts/${encodeURIComponent(accountNo)}/positions`;
  const h    = await buildHeaders(apiKey, apiSecret, 'GET', path);
  const url  = `${OPEN_API}${path}?marketType=STOCK&pageSize=100`;

  const res  = await fetch(url, { headers: h });
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`DNSE positions ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = JSON.parse(text) as Record<string, unknown>;
  console.debug('[DNSE] positions:', data);

  const raw = (data['positions'] ?? data['data'] ?? []) as unknown[];
  return raw
    .map(normalizePosition)
    .filter((p) => p.symbol && p.totalVolume > 0); // only open positions
}
