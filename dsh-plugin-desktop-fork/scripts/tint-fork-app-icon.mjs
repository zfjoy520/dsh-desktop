/**
 * Tint the fork application artwork so DSH Desktop Fork is distinguishable
 * from stable in the Dock, Cmd-Tab, and window chrome.
 *
 * What it does:
 * - overlays a teal rounded-rect ring + status dot on `build/app-icon.png`
 *   (16-bit RGBA + ICC profile preserved, so the result still satisfies
 *   `scripts/generate-mac-app-icon.mjs` source validation),
 * - regenerates `build/app-icon-mac.png` via `generate-mac-app-icon.mjs`,
 * - rebuilds the `build/fork-icon.iconset` PNG set and `build/app-icon.icns`
 *   with the system `iconutil`,
 * - refreshes the `outputs` hashes in `build/app-icon.resources.json`.
 *
 * Run from this package directory: `node scripts/tint-fork-app-icon.mjs`.
 * Manual step, never part of `yarn build` (see `tests/package.spec.ts`).
 */

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { generateMacAppIcon } from './generate-mac-app-icon.mjs'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const sourcePath = join(packageRoot, 'build', 'app-icon.png')
const macPath = join(packageRoot, 'build', 'app-icon-mac.png')
const icnsPath = join(packageRoot, 'build', 'app-icon.icns')
const resourcesPath = join(packageRoot, 'build', 'app-icon.resources.json')

const SIZE = 1024
const TEAL = '#2DD4BF'

function overlaySvg() {
  const inset = 36
  const side = SIZE - inset * 2
  return Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">`
    + `<rect x="${inset}" y="${inset}" width="${side}" height="${side}" rx="225" fill="none" stroke="${TEAL}" stroke-width="46"/>`
    + `<circle cx="872" cy="872" r="72" fill="${TEAL}"/>`
    + `<circle cx="872" cy="872" r="72" fill="none" stroke="#0B1514" stroke-width="10" opacity="0.55"/>`
    + `</svg>`,
  )
}

async function tintSource() {
  const tinted = await sharp(sourcePath, { failOn: 'warning' })
    .composite([{ input: overlaySvg(), blend: 'over' }])
    .toColourspace('rgb16')
    .keepIccProfile()
    .png({ compressionLevel: 9, progressive: false, adaptiveFiltering: false, palette: false })
    .toBuffer()
  // The tinted source must still satisfy generate-mac-app-icon source validation.
  const metadata = await sharp(tinted).metadata()
  const valid = metadata.format === 'png'
    && metadata.width === SIZE
    && metadata.height === SIZE
    && metadata.space === 'rgb16'
    && metadata.depth === 'ushort'
    && metadata.channels === 4
    && metadata.hasAlpha === true
    && metadata.icc !== undefined
  if (!valid) throw new Error(`tint-fork-app-icon: tinted source failed validation: ${JSON.stringify(metadata)}`)
  writeFileSync(sourcePath, tinted)
}

async function rebuildIconset() {
  const workdir = mkdtempSync(join(tmpdir(), 'dsh-fork-iconset-'))
  try {
    const iconset = join(workdir, 'Fork.iconset')
    execFileSync('mkdir', ['-p', iconset])
    for (const [size, scale] of [[16, 1], [16, 2], [32, 1], [32, 2], [128, 1], [128, 2], [256, 1], [256, 2], [512, 1], [512, 2]]) {
      const pixels = size * scale
      const suffix = scale === 2 ? '@2x' : ''
      const name = `icon_${size}x${size}${suffix}.png`
      const png = await sharp(macPath).resize(pixels, pixels, { fit: 'fill', kernel: sharp.kernel.lanczos3 }).png().toBuffer()
      writeFileSync(join(iconset, name), png)
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', icnsPath])
  } finally {
    rmSync(workdir, { recursive: true, force: true })
  }
}

function refreshResourceHashes() {
  const record = JSON.parse(readFileSync(resourcesPath, 'utf8'))
  for (const name of Object.keys(record.outputs)) {
    record.outputs[name] = createHash('sha256').update(readFileSync(join(packageRoot, 'build', name))).digest('hex')
  }
  writeFileSync(resourcesPath, `${JSON.stringify(record, null, 2)}\n`)
}

await tintSource()
await generateMacAppIcon(sourcePath, macPath)
await rebuildIconset()
refreshResourceHashes()
process.stdout.write(`tint-fork-app-icon: refreshed ${resolve(sourcePath)}, ${resolve(macPath)}, ${resolve(icnsPath)}\n`)
