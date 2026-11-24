import type { TargetPolicy } from '../types/licenseFence';

export const POLICY_ALLOWED_CLASSES: Record<TargetPolicy, string[]> = {
  PERMISSIVE_ONLY: ['PERMISSIVE'],
  PROPRIETARY_COMMERCIAL: ['PERMISSIVE', 'WEAK_COPYLEFT'],
  SAAS_CLOUD_SERVICE: ['PERMISSIVE', 'WEAK_COPYLEFT', 'STRONG_COPYLEFT'],
};

const REPO_PREFIX_RE =
  /^https:\/\/raw\.githubusercontent\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/$/;

const GITHUB_40HEX_RE =
  /^https:\/\/raw\.githubusercontent\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/[0-9a-fA-F]{40}\/[^\s?#]+$/;

const EVM_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

export function isValidEvmAddress(addr: string): boolean {
  return EVM_ADDR_RE.test(addr.trim());
}

export function validateSlotRepoPrefix(prefix: string): { valid: boolean; reason?: string } {
  const clean = prefix.trim();
  if (!REPO_PREFIX_RE.test(clean)) {
    return {
      valid: false,
      reason: 'Slot repo prefix must bind owner/repo: https://raw.githubusercontent.com/<owner>/<repo>/',
    };
  }
  return { valid: true };
}

export function validateSlotSpecString(spec: string): { valid: boolean; count: number; reason?: string } {
  const entries = spec
    .split(/[|\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (entries.length < 1 || entries.length > 5) {
    return { valid: false, count: entries.length, reason: 'Specify 1 to 5 dependency slots.' };
  }
  const seen = new Set<string>();
  for (const entry of entries) {
    const eq = entry.indexOf('=');
    if (eq <= 0) {
      return { valid: false, count: entries.length, reason: 'Each slot must use format: slot_name=https://raw.githubusercontent.com/<owner>/<repo>/' };
    }
    const name = entry.slice(0, eq).trim().toLowerCase();
    const pref = entry.slice(eq + 1).trim();
    if (seen.has(name)) {
      return { valid: false, count: entries.length, reason: `Duplicate slot name: ${name}` };
    }
    const check = validateSlotRepoPrefix(pref);
    if (!check.valid) return { valid: false, count: entries.length, reason: check.reason };
    seen.add(name);
  }
  return { valid: true, count: entries.length };
}

export function validateCommitPinnedGithubUrl(
  url: string,
  slotRepoPrefix?: string
): { valid: boolean; reason?: string } {
  const clean = url.trim();
  if (!clean) return { valid: false, reason: 'Evidence URL is required.' };
  if (slotRepoPrefix && !clean.startsWith(slotRepoPrefix)) {
    return { valid: false, reason: `URL must start with slot repo prefix ${slotRepoPrefix}` };
  }
  if (!GITHUB_40HEX_RE.test(clean)) {
    return {
      valid: false,
      reason: 'URL must be a 40-hex commit-pinned raw.githubusercontent.com URL.',
    };
  }
  return { valid: true };
}

export function isLicenseCompatibleWithPolicy(
  policy: TargetPolicy,
  licenseClass: string
): boolean {
  return POLICY_ALLOWED_CLASSES[policy].includes(licenseClass);
}

export async function computeSha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function formatWeiToGen(weiStr?: string | number | null): string {
  if (weiStr === undefined || weiStr === null || weiStr === '') return '0 GEN';
  try {
    const wei = BigInt(String(weiStr));
    if (wei === 0n) return '0 GEN';
    const whole = wei / 10n ** 18n;
    const rem = wei % 10n ** 18n;
    if (rem === 0n) return `${whole.toString()} GEN`;
    const frac = rem.toString().padStart(18, '0').slice(0, 6).replace(/0+$/, '');
    return `${whole.toString()}.${frac || '0'} GEN`;
  } catch {
    return `${String(weiStr)} wei`;
  }
}

export function parseGenToWei(genInput: string): bigint {
  const cleaned = genInput.trim();
  if (!cleaned || cleaned === '0') return 0n;
  if (!/^\d+(\.\d{1,18})?$/.test(cleaned)) {
    throw new Error('Enter a valid non-negative GEN amount.');
  }
  const [whole, frac = ''] = cleaned.split('.');
  return BigInt(whole) * 10n ** 18n + BigInt(frac.padEnd(18, '0').slice(0, 18));
}

export function truncateMiddle(val: string, head = 8, tail = 6): string {
  if (!val || val.length <= head + tail + 3) return val;
  return `${val.slice(0, head)}...${val.slice(-tail)}`;
}
