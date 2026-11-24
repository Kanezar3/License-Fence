import { describe, expect, it } from 'vitest';
import {
  computeSha256Hex,
  formatWeiToGen,
  isLicenseCompatibleWithPolicy,
  isValidEvmAddress,
  parseGenToWei,
  validateCommitPinnedGithubUrl,
  validateSlotRepoPrefix,
  validateSlotSpecString,
} from '../validation';
import { mapGenLayerStatusToLifecycle, stageProgressCount } from '../txTracker';

describe('LicenseFence v2 validation, per-slot repo pinning, and tx lifecycle', () => {
  it('evaluates the 5-class SPDX compatibility lattice accurately', () => {
    expect(isLicenseCompatibleWithPolicy('PERMISSIVE_ONLY', 'PERMISSIVE')).toBe(true);
    expect(isLicenseCompatibleWithPolicy('PERMISSIVE_ONLY', 'WEAK_COPYLEFT')).toBe(false);
    expect(isLicenseCompatibleWithPolicy('PROPRIETARY_COMMERCIAL', 'WEAK_COPYLEFT')).toBe(true);
    expect(isLicenseCompatibleWithPolicy('PROPRIETARY_COMMERCIAL', 'SOURCE_AVAILABLE_RESTRICTED')).toBe(false);
    expect(isLicenseCompatibleWithPolicy('SAAS_CLOUD_SERVICE', 'STRONG_COPYLEFT')).toBe(true);
    expect(isLicenseCompatibleWithPolicy('SAAS_CLOUD_SERVICE', 'NETWORK_COPYLEFT')).toBe(false);
    expect(isLicenseCompatibleWithPolicy('SAAS_CLOUD_SERVICE', 'SOURCE_AVAILABLE_RESTRICTED')).toBe(false);
  });

  it('rejects unbounded raw.githubusercontent.com prefixes and requires owner/repo per slot', () => {
    expect(validateSlotRepoPrefix('https://raw.githubusercontent.com/').valid).toBe(false);
    expect(validateSlotRepoPrefix('https://raw.githubusercontent.com/psf/requests/').valid).toBe(true);
    expect(
      validateSlotSpecString(
        'http-client=https://raw.githubusercontent.com/psf/requests/|media-codec=https://raw.githubusercontent.com/FFmpeg/FFmpeg/'
      ).valid
    ).toBe(true);
    expect(validateSlotSpecString('bad=https://raw.githubusercontent.com/').valid).toBe(false);
  });

  it('requires 40-hex commit-pinned URL matching the bound slot prefix', () => {
    const slotPref = 'https://raw.githubusercontent.com/psf/requests/';
    expect(
      validateCommitPinnedGithubUrl(
        'https://raw.githubusercontent.com/psf/requests/3c7baaa05ab4aa49cc819ce3a819d260de19c157/LICENSE',
        slotPref
      ).valid
    ).toBe(true);
    expect(
      validateCommitPinnedGithubUrl(
        'https://raw.githubusercontent.com/grafana/grafana/88998cea58e933452355eb4c7cbe1a452ef0f817/LICENSE',
        slotPref
      ).valid
    ).toBe(false);
  });

  it('maps StudioNet transaction statuses to all 5 lifecycle stages', () => {
    expect(mapGenLayerStatusToLifecycle('SUBMITTED', 'PENDING')).toBe('SUBMITTED');
    expect(mapGenLayerStatusToLifecycle('PROPOSING', '')).toBe('PENDING');
    expect(mapGenLayerStatusToLifecycle('ACCEPTED', 'SUCCESS')).toBe('ACCEPTED');
    expect(mapGenLayerStatusToLifecycle('FINALIZED', 'SUCCESS')).toBe('FINALIZED_SUCCESS');
    expect(mapGenLayerStatusToLifecycle('FINALIZED', 'ERROR')).toBe('FINALIZED_ERROR');
    expect(stageProgressCount('ACCEPTED')).toBe(3);
    expect(stageProgressCount('FINALIZED_SUCCESS')).toBe(5);
  });

  it('validates EVM addresses, GEN conversion, and SHA-256 hashing', async () => {
    expect(isValidEvmAddress('0x52d9d2Ec0d115723A262E7588a28a0210e2C5C2C')).toBe(true);
    expect(parseGenToWei('0.001')).toBe(1000000000000000n);
    expect(formatWeiToGen('200000000000000')).toBe('0.0002 GEN');
    expect(await computeSha256Hex('FFmpeg LGPL v2.1+')).toMatch(/^[0-9a-f]{64}$/);
  });
});
