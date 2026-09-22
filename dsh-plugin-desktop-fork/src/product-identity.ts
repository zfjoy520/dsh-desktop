/**
 * Fork identity: a locally-maintained DSH Desktop variant that shares `~/.dsh`
 * with stable (same sessions, same profiles) but installs and reports as its
 * own application (`ai.deepseek.dsh.desktop.fork` / `DSH Desktop Fork`).
 *
 * `releaseChannel` deliberately stays `'stable'` so every channel-gated code
 * path (update-checker channel validation, profile checkpoints, channel-home
 * resolution) reuses the stable logic unchanged. Because `homeDirectoryName`
 * is also `'.dsh'`, `resolveDesktopChannelHome()` takes the
 * `channelHome === legacyHome` branch and reports status `'channel'` with no
 * shared-home warning. Auto-update is disabled separately in
 * `src/update-checker.ts` / `src/updates.ts`, so the official stable feed can
 * never overwrite this build.
 */
export const DESKTOP_RELEASE_IDENTITIES = Object.freeze({
  stable: Object.freeze({
    releaseChannel: 'stable' as const,
    packageName: 'dsh-plugin-desktop',
    productName: 'DSH Desktop',
    appId: 'ai.deepseek.dsh.desktop',
    homeDirectoryName: '.dsh',
  }),
  beta: Object.freeze({
    releaseChannel: 'beta' as const,
    packageName: 'dsh-plugin-desktop-beta',
    productName: 'DSH Desktop Beta',
    appId: 'ai.deepseek.dsh.desktop.beta',
    homeDirectoryName: '.dsh-beta',
  }),
  fork: Object.freeze({
    releaseChannel: 'stable' as const,
    packageName: 'dsh-plugin-desktop-fork',
    productName: 'DSH Desktop Fork',
    appId: 'ai.deepseek.dsh.desktop.fork',
    homeDirectoryName: '.dsh',
  }),
})

export type DesktopProductIdentity = typeof DESKTOP_RELEASE_IDENTITIES[keyof typeof DESKTOP_RELEASE_IDENTITIES]

/** Fork release-channel identities that must stay aligned with electron-builder. */
export const DESKTOP_PRODUCT_IDENTITY = DESKTOP_RELEASE_IDENTITIES.fork
export const OTHER_DESKTOP_PRODUCT_IDENTITY = DESKTOP_RELEASE_IDENTITIES.stable
export const DESKTOP_PACKAGE_NAME = DESKTOP_PRODUCT_IDENTITY.packageName
export const BETA_DESKTOP_PACKAGE_NAME = DESKTOP_RELEASE_IDENTITIES.beta.packageName
export const STABLE_DESKTOP_PACKAGE_NAME = OTHER_DESKTOP_PRODUCT_IDENTITY.packageName
export const DESKTOP_PRODUCT_NAME = DESKTOP_PRODUCT_IDENTITY.productName
export const DESKTOP_APP_ID = DESKTOP_PRODUCT_IDENTITY.appId
export const DESKTOP_RELEASE_CHANNEL = DESKTOP_PRODUCT_IDENTITY.releaseChannel
export const DESKTOP_HOME_DIRECTORY_NAME = DESKTOP_PRODUCT_IDENTITY.homeDirectoryName

/** All Desktop package identities are launcher-owned, never Profile plugins. */
export const DESKTOP_PACKAGE_NAMES: ReadonlySet<string> = new Set([
  DESKTOP_PACKAGE_NAME,
  STABLE_DESKTOP_PACKAGE_NAME,
  BETA_DESKTOP_PACKAGE_NAME,
])
