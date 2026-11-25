import { createHmac, timingSafeEqual } from 'crypto';

// ===================== Tiện ích chung =====================

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a.toLowerCase());
  const y = Buffer.from(b.toLowerCase());

  return x.length === y.length && timingSafeEqual(x, y);
}

// ===================== VNPAY (v2.1.0) =====================

export interface VnpayConfig {
  tmnCode: string;
  hashSecret: string;
  payUrl: string; // https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
}

// Mã hóa giống demo chính thức của VNPAY: encodeURIComponent, khoảng trắng thành "+"
function vnpEncode(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, '+');
}

function vnpSignData(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== '')
    .sort()
    .map((k) => `${vnpEncode(k)}=${vnpEncode(params[k])}`)
    .join('&');
}

function vnpHash(secret: string, data: string): string {
  return createHmac('sha512', secret).update(Buffer.from(data, 'utf-8')).digest('hex');
}

// yyyyMMddHHmmss theo giờ Việt Nam (GMT+7)
function vnTime(date: Date): string {
  const t = new Date(date.getTime() + 7 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');

  return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}`;
}

export function vnpayBuildUrl(
  cfg: VnpayConfig,
  opts: { orderId: string; amount: number; info: string; returnUrl: string; ipAddr: string; createdAt: Date; expireMinutes: number },
): string {
  const params: Record<string, string> = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: cfg.tmnCode,
    vnp_Amount: String(opts.amount * 100),
    vnp_CurrCode: 'VND',
    vnp_TxnRef: opts.orderId,
    vnp_OrderInfo: opts.info,
    vnp_OrderType: 'other',
    vnp_Locale: 'vn',
    vnp_ReturnUrl: opts.returnUrl,
    vnp_IpAddr: opts.ipAddr,
    vnp_CreateDate: vnTime(opts.createdAt),
    vnp_ExpireDate: vnTime(new Date(opts.createdAt.getTime() + opts.expireMinutes * 60_000)),
  };

  const data = vnpSignData(params);

  return `${cfg.payUrl}?${data}&vnp_SecureHash=${vnpHash(cfg.hashSecret, data)}`;
}

export interface VnpayResult {
  valid: boolean;
  orderId: string;
  amount: number; // VND
  success: boolean;
  txnNo: string;
  responseCode: string;
}

export function vnpayVerify(cfg: VnpayConfig, query: Record<string, unknown>): VnpayResult {
  const params: Record<string, string> = {};

  for (const [k, v] of Object.entries(query)) {
    if (k.startsWith('vnp_') && k !== 'vnp_SecureHash' && k !== 'vnp_SecureHashType' && typeof v === 'string') {
      params[k] = v;
    }
  }

  const given = typeof query.vnp_SecureHash === 'string' ? query.vnp_SecureHash : '';
  const valid = !!given && safeEqual(vnpHash(cfg.hashSecret, vnpSignData(params)), given);

  return {
    valid,
    orderId: params.vnp_TxnRef ?? '',
    amount: Math.round(Number(params.vnp_Amount ?? 0) / 100),
    success: params.vnp_ResponseCode === '00' && params.vnp_TransactionStatus === '00',
    txnNo: params.vnp_TransactionNo ?? '',
    responseCode: params.vnp_ResponseCode ?? '',
  };
}

// ===================== MOMO (API v2) =====================

export interface MomoConfig {
  partnerCode: string;
  accessKey: string;
  secretKey: string;
  endpoint: string; // https://test-payment.momo.vn/v2/gateway/api/create
}

function momoSign(secret: string, raw: string): string {
  return createHmac('sha256', secret).update(raw).digest('hex');
}

export async function momoCreate(
  cfg: MomoConfig,
  opts: { orderId: string; amount: number; info: string; redirectUrl: string; ipnUrl: string },
): Promise<{ payUrl: string }> {
  const requestId = `${opts.orderId}-${Date.now()}`;
  const requestType = 'captureWallet';
  const extraData = '';

  const raw =
    `accessKey=${cfg.accessKey}&amount=${opts.amount}&extraData=${extraData}` +
    `&ipnUrl=${opts.ipnUrl}&orderId=${opts.orderId}&orderInfo=${opts.info}` +
    `&partnerCode=${cfg.partnerCode}&redirectUrl=${opts.redirectUrl}` +
    `&requestId=${requestId}&requestType=${requestType}`;

  const response = await fetch(cfg.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      partnerCode: cfg.partnerCode,
      requestId,
      amount: opts.amount,
      orderId: opts.orderId,
      orderInfo: opts.info,
      redirectUrl: opts.redirectUrl,
      ipnUrl: opts.ipnUrl,
      requestType,
      extraData,
      lang: 'vi',
      signature: momoSign(cfg.secretKey, raw),
    }),
  });

  const data = (await response.json().catch(() => ({}))) as { resultCode?: number; payUrl?: string; message?: string };

  if (data.resultCode !== 0 || !data.payUrl) {
    throw new Error(data.message || 'MoMo từ chối tạo giao dịch');
  }

  return { payUrl: data.payUrl };
}

export interface MomoResult {
  valid: boolean;
  orderId: string;
  amount: number;
  success: boolean;
  transId: string;
  resultCode: string;
}

// Dùng chung cho IPN (POST body) và trang quay về (GET query)
export function momoVerify(cfg: MomoConfig, input: Record<string, unknown>): MomoResult {
  const g = (k: string) => (input[k] === undefined || input[k] === null ? '' : String(input[k]));

  const raw =
    `accessKey=${cfg.accessKey}&amount=${g('amount')}&extraData=${g('extraData')}` +
    `&message=${g('message')}&orderId=${g('orderId')}&orderInfo=${g('orderInfo')}` +
    `&orderType=${g('orderType')}&partnerCode=${g('partnerCode')}&payType=${g('payType')}` +
    `&requestId=${g('requestId')}&responseTime=${g('responseTime')}&resultCode=${g('resultCode')}` +
    `&transId=${g('transId')}`;

  const given = g('signature');
  const valid = !!given && g('partnerCode') === cfg.partnerCode && safeEqual(momoSign(cfg.secretKey, raw), given);

  return {
    valid,
    orderId: g('orderId'),
    amount: Number(g('amount')),
    success: g('resultCode') === '0',
    transId: g('transId'),
    resultCode: g('resultCode'),
  };
}
