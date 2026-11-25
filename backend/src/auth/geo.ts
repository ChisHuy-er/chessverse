// Đoán quốc gia của người chơi (mã ISO 2 chữ cái, ví dụ "VN", "BR") khi đăng ký / đăng nhập.
// Thứ tự ưu tiên:
//   1. Header vị trí do CDN gắn sẵn (Cloudflare: cf-ipcountry, Vercel: x-vercel-ip-country)
//   2. Tra IP bằng thư viện geoip-lite (nếu đã cài: npm i geoip-lite)
//   3. Múi giờ của trình duyệt (Asia/Saigon → VN, America/Sao_Paulo → BR)
//   4. Vùng trong ngôn ngữ trình duyệt (vi-VN → VN, pt-BR → BR)

export interface GeoHints {
  geoHeader?: string;
  ip?: string;
  timeZone?: string;
  locale?: string;
}

// Múi giờ phổ biến → quốc gia
const TZ: Record<string, string> = {
  'Asia/Saigon': 'VN', 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Bangkok': 'TH', 'Asia/Phnom_Penh': 'KH', 'Asia/Vientiane': 'LA',
  'Asia/Yangon': 'MM', 'Asia/Rangoon': 'MM', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Kuching': 'MY', 'Asia/Singapore': 'SG',
  'Asia/Jakarta': 'ID', 'Asia/Makassar': 'ID', 'Asia/Jayapura': 'ID', 'Asia/Pontianak': 'ID', 'Asia/Manila': 'PH',
  'Asia/Brunei': 'BN', 'Asia/Dili': 'TL', 'Asia/Shanghai': 'CN', 'Asia/Chongqing': 'CN', 'Asia/Urumqi': 'CN',
  'Asia/Hong_Kong': 'HK', 'Asia/Macau': 'MO', 'Asia/Taipei': 'TW', 'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR',
  'Asia/Pyongyang': 'KP', 'Asia/Ulaanbaatar': 'MN', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Dhaka': 'BD',
  'Asia/Karachi': 'PK', 'Asia/Kathmandu': 'NP', 'Asia/Colombo': 'LK', 'Asia/Thimphu': 'BT', 'Indian/Maldives': 'MV',
  'Asia/Kabul': 'AF', 'Asia/Tehran': 'IR', 'Asia/Baghdad': 'IQ', 'Asia/Riyadh': 'SA', 'Asia/Dubai': 'AE',
  'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW', 'Asia/Bahrain': 'BH', 'Asia/Muscat': 'OM', 'Asia/Aden': 'YE',
  'Asia/Amman': 'JO', 'Asia/Beirut': 'LB', 'Asia/Damascus': 'SY', 'Asia/Jerusalem': 'IL', 'Asia/Tel_Aviv': 'IL',
  'Asia/Gaza': 'PS', 'Asia/Hebron': 'PS', 'Asia/Tbilisi': 'GE', 'Asia/Yerevan': 'AM', 'Asia/Baku': 'AZ',
  'Asia/Almaty': 'KZ', 'Asia/Qostanay': 'KZ', 'Asia/Tashkent': 'UZ', 'Asia/Samarkand': 'UZ', 'Asia/Bishkek': 'KG',
  'Asia/Dushanbe': 'TJ', 'Asia/Ashgabat': 'TM', 'Europe/Istanbul': 'TR', 'Asia/Istanbul': 'TR', 'Asia/Nicosia': 'CY',
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Lisbon': 'PT', 'Atlantic/Madeira': 'PT', 'Atlantic/Azores': 'PT',
  'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES', 'Europe/Paris': 'FR', 'Europe/Brussels': 'BE', 'Europe/Amsterdam': 'NL',
  'Europe/Luxembourg': 'LU', 'Europe/Berlin': 'DE', 'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT', 'Europe/Rome': 'IT',
  'Europe/Malta': 'MT', 'Europe/Monaco': 'MC', 'Europe/Copenhagen': 'DK', 'Europe/Oslo': 'NO', 'Europe/Stockholm': 'SE',
  'Europe/Helsinki': 'FI', 'Atlantic/Reykjavik': 'IS', 'Europe/Tallinn': 'EE', 'Europe/Riga': 'LV', 'Europe/Vilnius': 'LT',
  'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ', 'Europe/Bratislava': 'SK', 'Europe/Budapest': 'HU', 'Europe/Ljubljana': 'SI',
  'Europe/Zagreb': 'HR', 'Europe/Belgrade': 'RS', 'Europe/Sarajevo': 'BA', 'Europe/Podgorica': 'ME', 'Europe/Skopje': 'MK',
  'Europe/Tirane': 'AL', 'Europe/Athens': 'GR', 'Europe/Sofia': 'BG', 'Europe/Bucharest': 'RO', 'Europe/Chisinau': 'MD',
  'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA', 'Europe/Minsk': 'BY', 'Europe/Moscow': 'RU', 'Europe/Samara': 'RU',
  'Europe/Kaliningrad': 'RU', 'Asia/Yekaterinburg': 'RU', 'Asia/Omsk': 'RU', 'Asia/Novosibirsk': 'RU', 'Asia/Krasnoyarsk': 'RU',
  'Asia/Irkutsk': 'RU', 'Asia/Yakutsk': 'RU', 'Asia/Vladivostok': 'RU', 'Asia/Magadan': 'RU', 'Asia/Kamchatka': 'RU',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Phoenix': 'US', 'America/Los_Angeles': 'US',
  'America/Anchorage': 'US', 'Pacific/Honolulu': 'US', 'America/Detroit': 'US', 'America/Indiana/Indianapolis': 'US', 'America/Boise': 'US',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA',
  'America/St_Johns': 'CA', 'America/Regina': 'CA', 'America/Montreal': 'CA', 'America/Mexico_City': 'MX', 'America/Cancun': 'MX',
  'America/Monterrey': 'MX', 'America/Tijuana': 'MX', 'America/Guatemala': 'GT', 'America/El_Salvador': 'SV', 'America/Tegucigalpa': 'HN',
  'America/Managua': 'NI', 'America/Costa_Rica': 'CR', 'America/Panama': 'PA', 'America/Havana': 'CU', 'America/Jamaica': 'JM',
  'America/Port-au-Prince': 'HT', 'America/Santo_Domingo': 'DO', 'America/Puerto_Rico': 'PR', 'America/Bogota': 'CO', 'America/Caracas': 'VE',
  'America/Guayaquil': 'EC', 'America/Lima': 'PE', 'America/La_Paz': 'BO', 'America/Santiago': 'CL', 'America/Asuncion': 'PY',
  'America/Montevideo': 'UY', 'America/Argentina/Buenos_Aires': 'AR', 'America/Buenos_Aires': 'AR', 'America/Argentina/Cordoba': 'AR', 'America/Argentina/Mendoza': 'AR',
  'America/Sao_Paulo': 'BR', 'America/Bahia': 'BR', 'America/Fortaleza': 'BR', 'America/Recife': 'BR', 'America/Belem': 'BR',
  'America/Manaus': 'BR', 'America/Cuiaba': 'BR', 'America/Campo_Grande': 'BR', 'America/Porto_Velho': 'BR', 'America/Rio_Branco': 'BR',
  'America/Maceio': 'BR', 'America/Araguaina': 'BR', 'America/Boa_Vista': 'BR', 'America/Noronha': 'BR', 'America/Guyana': 'GY',
  'America/Paramaribo': 'SR', 'America/Cayenne': 'GF', 'Africa/Cairo': 'EG', 'Africa/Tripoli': 'LY', 'Africa/Tunis': 'TN',
  'Africa/Algiers': 'DZ', 'Africa/Casablanca': 'MA', 'Africa/Lagos': 'NG', 'Africa/Accra': 'GH', 'Africa/Abidjan': 'CI',
  'Africa/Dakar': 'SN', 'Africa/Nairobi': 'KE', 'Africa/Addis_Ababa': 'ET', 'Africa/Kampala': 'UG', 'Africa/Dar_es_Salaam': 'TZ',
  'Africa/Kigali': 'RW', 'Africa/Khartoum': 'SD', 'Africa/Johannesburg': 'ZA', 'Africa/Harare': 'ZW', 'Africa/Lusaka': 'ZM',
  'Africa/Maputo': 'MZ', 'Africa/Luanda': 'AO', 'Africa/Kinshasa': 'CD', 'Africa/Douala': 'CM', 'Indian/Mauritius': 'MU',
  'Indian/Antananarivo': 'MG', 'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU', 'Australia/Perth': 'AU',
  'Australia/Adelaide': 'AU', 'Australia/Hobart': 'AU', 'Australia/Darwin': 'AU', 'Pacific/Auckland': 'NZ', 'Pacific/Fiji': 'FJ',
  'Pacific/Port_Moresby': 'PG', 'Pacific/Guam': 'GU',
};

const CODE = /^[A-Z]{2}$/;

function clean(code?: string | null): string | null {
  const c = (code ?? '').trim().toUpperCase();

  // XX / T1 là mã "không rõ" / Tor của Cloudflare
  return CODE.test(c) && c !== 'XX' ? c : null;
}

function isPublicIp(ip: string): boolean {
  return !!ip && !/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(ip);
}

type GeoLite = { lookup(ip: string): { country?: string } | null };
let geoLite: GeoLite | null | undefined;

function lookupIp(ip: string): string | null {
  if (geoLite === undefined) {
    try {
      // Tùy chọn: chỉ dùng khi đã cài "geoip-lite"
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      geoLite = require('geoip-lite') as GeoLite;
    } catch {
      geoLite = null;
    }
  }

  return geoLite ? clean(geoLite.lookup(ip)?.country) : null;
}

export function detectCountry(h: GeoHints): string | null {
  const fromHeader = clean(h.geoHeader);
  if (fromHeader) return fromHeader;

  const ip = (h.ip ?? '').split(',')[0].trim().replace(/^::ffff:/, '');
  if (isPublicIp(ip)) {
    const fromIp = lookupIp(ip);
    if (fromIp) return fromIp;
  }

  const fromTz = h.timeZone ? clean(TZ[h.timeZone]) : null;
  if (fromTz) return fromTz;

  const region = (h.locale ?? '').split(/[-_]/)[1];
  return clean(region);
}

// Lấy gợi ý từ header của request (Next.js chuyển tiếp sang)
export function hintsFrom(headers: Record<string, string | string[] | undefined>): GeoHints {
  const one = (k: string) => {
    const v = headers[k];
    return (Array.isArray(v) ? v[0] : v) || undefined;
  };

  return {
    geoHeader: one('x-geo-country'),
    ip: one('x-forwarded-for'),
    timeZone: one('x-client-tz'),
    locale: one('x-client-locale'),
  };
}
