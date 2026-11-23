import { describe, expect, it } from 'vitest';
import {
  computeSha256Hex,
  formatWeiToGen,
  isLicenseCompatibleWithPolicy,
  isValidEvmAddress,
  parseGenToWei,
  validateCommitPinnedGithubUrl,
} from '../validation';

describe('LicenseFence validation & policy lattice', () => {
  it('evaluates the deterministic SPDX compatibility lattice accurately', () => {
    expect(isLicenseCompatibleWithPolicy('PERMISSIVE_ONLY', 'PERMISSIVE')).toBe(true);
    expect(isLicenseCompatibleWithPolicy('PERMISSIVE_ONLY', 'WEAK_COPYLEFT')).toBe(false);
    expect(isLicenseCompatibleWithPolicy('PROPRIETARY_COMMERCIAL', 'WEAK_COPYLEFT')).toBe(true);
    expect(isLicenseCompatibleWithPolicy('PROPRIETARY_COMMERCIAL', 'STRONG_COPYLEFT')).toBe(false);
    expect(isLicenseCompatibleWithPolicy('PROPRIETARY_COMMERCIAL', 'NETWORK_COPYLEFT')).toBe(false);
    expect(isLicenseCompatibleWithPolicy('SAAS_CLOUD_SERVICE', 'STRONG_COPYLEFT')).toBe(true);
    expect(isLicenseCompatibleWithPolicy('SAAS_CLOUD_SERVICE', 'NETWORK_COPYLEFT')).toBe(false);
  });

  it('requires 40-hex commit-pinned raw.githubusercontent.com URLs', () => {
    expect(
      validateCommitPinnedGithubUrl(
        'https://raw.githubusercontent.com/psf/requests/3c7baaa05ab4aa49cc819ce3a819d260de19c157/LICENSE'
      ).valid
    ).toBe(true);
    expect(
      validateCommitPinnedGithubUrl(
        'https://raw.githubusercontent.com/psf/requests/main/LICENSE'
      ).valid
    ).toBe(false);
  });

  it('validates EVM addresses and GEN/wei conversion', () => {
    expect(isValidEvmAddress('0x52d9d2Ec0d115723A262E7588a28a0210e2C5C2C')).toBe(true);
    expect(isValidEvmAddress('0x123')).toBe(false);
    expect(parseGenToWei('0.001')).toBe(1000000000000000n);
    expect(formatWeiToGen('200000000000000')).toBe('0.0002 GEN');
  });

  it('computes lowercase 64-hex SHA-256 digests', async () => {
    const sha = await computeSha256Hex('Apache License Version 2.0');
    expect(sha).toMatch(/^[0-9a-f]{64}$/);
  });
});
