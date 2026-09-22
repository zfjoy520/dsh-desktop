import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {
  ConnectionRequestRejection,
  ConnectionTrustRequest,
} from '@deepseek-ai/dsh-client-connection'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  DesktopNotification,
  DesktopRuntime,
  DesktopTrayItem,
} from '../src/runtime.ts'
import type {
  UpdateCheckResult,
} from '../src/update-checker.ts'
import { apply, Config, inject, type Config as UpdateConfig } from '../src/updates.ts'

const testConfig: UpdateConfig = {
  enabled: true,
  initialDelayMs: 10,
  intervalMs: 1000,
  requestTimeoutMs: 1000,
}

function versionResponse(version: unknown): Response {
  return Response.json({ version })
}

interface Harness {
  readonly statePath: string
  readonly tray: DesktopTrayItem
  readonly trays: readonly DesktopTrayItem[]
  readonly notifications: DesktopNotification[]
  readonly warnings: unknown[][]
  readonly confirmDownload: ReturnType<typeof vi.fn>
  readonly showManualCheckResult: ReturnType<typeof vi.fn>
  readonly downloadAndOpen: ReturnType<typeof vi.fn>
  readonly refresh: ReturnType<typeof vi.fn>
  readonly registrationDispose: ReturnType<typeof vi.fn>
  readonly requestRejection: ReturnType<typeof vi.fn<(
    request: ConnectionTrustRequest,
  ) => ConnectionRequestRejection>>
  readonly route: WebRoute
  dispose(): Promise<void>
}

async function createHarness(options: {
  readonly packaged?: boolean
  readonly canDownload?: boolean
  readonly config?: UpdateConfig
  readonly request?: DesktopRuntime['updates']['request']
  readonly releaseChannel?: 'stable' | 'beta'
  readonly currentVersion?: string
  readonly confirmDownload?: (version: string, channel?: 'stable' | 'beta') => Promise<boolean>
  readonly showManualCheckResult?: (result: UpdateCheckResult | null) => Promise<void>
  readonly downloadAndOpen?: (
    version: string,
    signal: AbortSignal,
    channel?: 'stable' | 'beta',
    installerSha256?: Readonly<Partial<Record<'win32' | 'darwin', string>>>,
  ) => Promise<void>
  readonly notify?: (notification: DesktopNotification) => void
  readonly locale?: DesktopRuntime['locale']
  readonly state?: string
} = {}): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-updates-'))
  const statePath = join(root, 'private', 'state.json')
  if (options.state !== undefined) {
    await mkdir(join(root, 'private'), { recursive: true })
    await writeFile(statePath, options.state, { mode: 0o600 })
  }
  const notifications: DesktopNotification[] = []
  const warnings: unknown[][] = []
  const refresh = vi.fn()
  const registrationDispose = vi.fn()
  const confirmDownload = vi.fn(options.confirmDownload ?? (async () => false))
  const showManualCheckResult = vi.fn(options.showManualCheckResult ?? (async () => {}))
  const downloadAndOpen = vi.fn(options.downloadAndOpen ?? (async () => {}))
  const requestRejection = vi.fn<(
    request: ConnectionTrustRequest,
  ) => ConnectionRequestRejection>(() => undefined)
  let tray: DesktopTrayItem | undefined
  const trays: DesktopTrayItem[] = []
  let route: WebRoute | undefined
  let disposer: (() => void | Promise<void>) | undefined
  const runtime = {
    locale: options.locale ?? 'en',
    updates: {
      isPackaged: options.packaged ?? true,
      currentVersion: options.currentVersion ?? '2.0.0',
      ...(options.releaseChannel === undefined ? {} : { releaseChannel: options.releaseChannel }),
      statePath,
      canDownload: options.canDownload ?? true,
      request: options.request ?? (async () => versionResponse('2.0.0')),
      confirmDownload,
      showManualCheckResult,
      downloadAndOpen,
      notify: options.notify ?? ((notification: DesktopNotification) => { notifications.push(notification) }),
    },
    registerTrayItem: (item: DesktopTrayItem) => {
      tray ??= item
      trays.push(item)
      return { refresh, dispose: registrationDispose }
    },
  } as unknown as DesktopRuntime
  const ctx = {
    desktopRuntime: runtime,
    webServer: {
      port: 43120,
      register: (registered: WebRoute) => {
        route = registered
        return () => {}
      },
    },
    connection: { requestRejection },
    logger: { warn: (...args: unknown[]) => { warnings.push(args) } },
    effect: (register: () => (() => void | Promise<void>)) => {
      disposer = register()
      return disposer
    },
  } as unknown as Context

  apply(ctx, options.config ?? testConfig)
  if (tray === undefined) throw new Error('Update tray item was not registered.')
  if (route === undefined) throw new Error('Update route was not registered.')
  return {
    statePath,
    tray,
    trays,
    notifications,
    warnings,
    confirmDownload,
    showManualCheckResult,
    downloadAndOpen,
    refresh,
    registrationDispose,
    requestRejection,
    route,
    dispose: async () => { await disposer?.() },
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('desktop update Host plugin (fork: official updates disabled)', () => {
  it('exposes the packaged policy with background polling off by default', () => {
    expect(inject).toEqual(['desktopRuntime', 'webServer', 'connection'])
    expect(Config({} as UpdateConfig)).toEqual({
      enabled: false,
      initialDelayMs: 60_000,
      intervalMs: 21_600_000,
      requestTimeoutMs: 15_000,
    })
    expect(() => Config({ intervalMs: 0 } as UpdateConfig)).toThrow()
    expect(() => Config({ requestTimeoutMs: 0 } as UpdateConfig)).toThrow()
  })

  it('registers the manual check tray item but performs no request on invoke', async () => {
    const request = vi.fn(async () => versionResponse('9.9.9'))
    const harness = await createHarness({ request })
    expect(harness.tray.label()).toBe('Check for Updates…')
    await harness.tray.invoke()
    expect(request).not.toHaveBeenCalled()
    expect(harness.showManualCheckResult).toHaveBeenCalledWith(null)
    expect(harness.confirmDownload).not.toHaveBeenCalled()
    expect(harness.downloadAndOpen).not.toHaveBeenCalled()
    expect(harness.notifications).toEqual([])
    await harness.dispose()
  })

  it('schedules no background checks while polling is disabled', async () => {
    vi.useFakeTimers()
    const request = vi.fn(async () => versionResponse('9.9.9'))
    const harness = await createHarness({ request, config: { ...testConfig, enabled: false } })
    await vi.advanceTimersByTimeAsync(testConfig.initialDelayMs + testConfig.intervalMs * 2)
    expect(request).not.toHaveBeenCalled()
    expect(harness.notifications).toEqual([])
    await harness.dispose()
  })

  it('never offers a download even when polling is explicitly enabled', async () => {
    vi.useFakeTimers()
    const request = vi.fn(async () => versionResponse('9.9.9'))
    const confirmDownload = vi.fn(async () => true)
    const harness = await createHarness({
      request,
      confirmDownload,
      config: { ...testConfig, enabled: true },
    })
    await vi.advanceTimersByTimeAsync(testConfig.initialDelayMs + 100)
    await harness.tray.invoke()
    expect(request).not.toHaveBeenCalled()
    expect(confirmDownload).not.toHaveBeenCalled()
    expect(harness.downloadAndOpen).not.toHaveBeenCalled()
    expect(harness.notifications).toEqual([])
    await harness.dispose()
  })
})
