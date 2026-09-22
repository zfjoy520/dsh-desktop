import { describe, expect, it, vi } from 'vitest'
import {
  FORK_UPDATE_CHECKS_DISABLED,
  DESKTOP_CURRENT_VERSION_HEADER,
  checkForStableUpdate,
  checkForDesktopUpdate,
  compareSemVerVersions,
  desktopVersionRequestHeaders,
  parseSemVer,
  type UpdateRequest,
} from '../src/update-checker.ts'
import {
  assertDesktopInstallationId,
  DESKTOP_INSTALLATION_ID_HEADER,
} from '../src/desktop-installation-id.ts'

const INSTALLATION_ID = assertDesktopInstallationId('01234567-89ab-4cde-8f01-23456789abcd')

describe('strict SemVer parsing', () => {
  it('accepts a three-part version, optional lowercase v, prerelease, and build metadata', () => {
    expect(parseSemVer('v2.10.3-alpha.1+mac.arm64')).toEqual({
      version: '2.10.3-alpha.1+mac.arm64',
      major: '2',
      minor: '10',
      patch: '3',
      prerelease: ['alpha', '1'],
      build: ['mac', 'arm64'],
    })
    expect(parseSemVer('0.0.0')).not.toBeNull()
  })

  it.each([
    '1',
    '1.2',
    '01.2.3',
    '1.02.3',
    '1.2.03',
    '1.2.3-01',
    '1.2.3-alpha..1',
    '1.2.3+',
    'V1.2.3',
    ' 1.2.3',
  ])('rejects invalid SemVer %s', version => {
    expect(parseSemVer(version)).toBeNull()
  })

  it('compares strict versions without numeric overflow', () => {
    expect(compareSemVerVersions('2.1.0', '2.0.9')).toBeGreaterThan(0)
    expect(compareSemVerVersions('2.0.0-rc.1', '2.0.0')).toBeLessThan(0)
    expect(compareSemVerVersions('2.0', '2.0.0')).toBeNull()
    expect(compareSemVerVersions(
      '10000000000000000.0.0',
      '9007199254740992.0.0',
    )).toBeGreaterThan(0)
  })
})

describe('fork update gate (official feed is never contacted)', () => {
  it('declares update checks disabled', () => {
    expect(FORK_UPDATE_CHECKS_DISABLED).toBe(true)
  })

  it('reports no result without requesting, even for a valid stable version', async () => {
    const request = vi.fn<UpdateRequest>(async () => Response.json({ version: '9.9.9' }))
    await expect(checkForStableUpdate({
      currentVersion: '2.0.0',
      installationId: INSTALLATION_ID,
      request,
    })).resolves.toBeNull()
    expect(request).not.toHaveBeenCalled()
  })

  it('gates every channel, including next/beta prereleases', async () => {
    const request = vi.fn<UpdateRequest>(async () => Response.json({ version: '9.9.9-next.1', channel: 'next' }))
    await expect(checkForDesktopUpdate({
      currentVersion: '2.0.14-next',
      channel: 'next',
      request,
    })).resolves.toBeNull()
    expect(request).not.toHaveBeenCalled()
  })

  it('still builds the bounded version-check header set for API compatibility', () => {
    expect(desktopVersionRequestHeaders(INSTALLATION_ID, '2.9.9')).toEqual({
      Accept: 'application/json',
      [DESKTOP_CURRENT_VERSION_HEADER]: '2.9.9',
      [DESKTOP_INSTALLATION_ID_HEADER]: INSTALLATION_ID,
    })
  })
})
