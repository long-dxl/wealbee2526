const OPEN_API = '/api/dnse-open';
const DATE_HEADER = 'X-Aux-Date'; // browsers forbid setting 'Date' header directly

function uuid4hex(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }).replace(/-/g, '');
}

async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function buildHeaders(
  apiKey: string, apiSecret: string, method: string, path: string
): Promise<HeadersInit> {
  const date = new Date().toUTCString();
  const nonce = uuid4hex();
  const target = `${method.toLowerCase()} ${path}`;
  const signingString = `(request-target): ${target}\n${DATE_HEADER.toLowerCase()}: ${date}\nnonce: ${nonce}`;
  const b64sig = await hmacSha256Base64(apiSecret, signingString);
  const encodedSig = encodeURIComponent(b64sig);

  return {
    [DATE_HEADER]: date,
    'X-API-Key': apiKey,
    'X-Signature': `Signature keyId="${apiKey}",algorithm="hmac-sha256",headers="(request-target) ${DATE_HEADER.toLowerCase()}",signature="${encodedSig}",nonce="${nonce}"`,
    'Content-Type': 'application/json',
  };
}

export interface DnseAccountInfo {
  accountNo: string;
  accountName?: string;
  status?: string;
}

export interface DnsePosition {
  symbol: string;
  quantity: number;       // total shares
  availableQuantity: number;
  averagePrice: number;
  marketPrice?: number;
  marketValue?: number;
  pnl?: number;
  pnlPercent?: number;
}

export interface DnseCashBalance {
  cashBalance: number;
  availableCash: number;
  holdCash: number;
}

export async function discoverAccounts(
  apiKey: string, apiSecret: string
): Promise<DnseAccountInfo[]> {
  const path = '/accounts';
  const headers = await buildHeaders(apiKey, apiSecret, 'GET', path);
  const res = await fetch(`${OPEN_API}${path}`, { headers });
  if (!res.ok) throw new Error(`DNSE accounts: ${res.status} ${await res.text()}`);
  const json = await res.json();
  // DNSE returns array or { data: [...] }
  const rows: any[] = Array.isArray(json) ? json : (json.data ?? []);
  return rows.map((r: any) => ({
    accountNo: r.accountNo ?? r.account_no ?? r.id ?? '',
    accountName: r.accountName ?? r.full_name ?? r.name ?? '',
    status: r.status ?? '',
  }));
}

export async function fetchPositions(
  accountNo: string, apiKey: string, apiSecret: string
): Promise<DnsePosition[]> {
  const path = `/accounts/${accountNo}/positions`;
  const headers = await buildHeaders(apiKey, apiSecret, 'GET', path);
  const res = await fetch(`${OPEN_API}${path}`, { headers });
  if (!res.ok) throw new Error(`DNSE positions: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const rows: any[] = Array.isArray(json) ? json : (json.data ?? []);
  return rows.map((r: any) => ({
    symbol: r.symbol ?? r.stockCode ?? '',
    quantity: Number(r.quantity ?? r.totalQuantity ?? 0),
    availableQuantity: Number(r.availableQuantity ?? r.availQty ?? 0),
    averagePrice: Number(r.averagePrice ?? r.avgPrice ?? 0),
    marketPrice: r.marketPrice != null ? Number(r.marketPrice) : undefined,
    marketValue: r.marketValue != null ? Number(r.marketValue) : undefined,
    pnl: r.pnl != null ? Number(r.pnl) : undefined,
    pnlPercent: r.pnlPercent != null ? Number(r.pnlPercent) : undefined,
  }));
}

export async function fetchCashBalance(
  accountNo: string, apiKey: string, apiSecret: string
): Promise<DnseCashBalance> {
  const path = `/accounts/${accountNo}/cash-balance`;
  const headers = await buildHeaders(apiKey, apiSecret, 'GET', path);
  const res = await fetch(`${OPEN_API}${path}`, { headers });
  if (!res.ok) throw new Error(`DNSE cash-balance: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const d = json.data ?? json;
  return {
    cashBalance: Number(d.cashBalance ?? d.cash_balance ?? 0),
    availableCash: Number(d.availableCash ?? d.available_cash ?? 0),
    holdCash: Number(d.holdCash ?? d.hold_cash ?? 0),
  };
}
