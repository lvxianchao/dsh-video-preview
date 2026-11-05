/**
 * Record the README demo GIF from a shadow instance.
 *
 * Uses CDP Page.startScreencast to capture real frames while the script drives
 * the actual UI: @ reference → click → playback → seek. Frames land as JPEGs,
 * then ffmpeg builds a palette-optimized GIF.
 *
 * Env: SHADOW_URL, CHROME, VIDEO (file name in the shadow workspace),
 *      OUT_DIR (frame directory), GIF (output path)
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import puppeteer from 'puppeteer-core'

const url = process.env.SHADOW_URL
const chrome = process.env.CHROME
const video = process.env.VIDEO ?? 'demo-video.mp4'
const outDir = process.env.OUT_DIR ?? '/tmp/gif-frames'
const gifPath = process.env.GIF ?? '/tmp/demo.gif'
if (!url || !chrome) {
  console.error('set SHADOW_URL and CHROME')
  process.exit(2)
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'shell',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required']
})
const page = await browser.newPage()
await page.setViewport({ width: 1500, height: 940, deviceScaleFactor: 1 })
await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 })
await new Promise((r) => setTimeout(r, 5_000))

// First-run onboarding + workspace selection.
await page.evaluate(() => document.querySelector('[aria-label="关闭"]')?.click())
if (!(await page.evaluate(() => document.body.innerText.includes('工作区内修改')))) {
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button,a,[role="button"]')].find((e) => (e.innerText || '').trim() === '选择工作区')
    button?.click()
  })
  await new Promise((r) => setTimeout(r, 1_200))
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('*')].find((e) => (e.innerText || '').trim() === 'work' && e.children.length === 0)
    row?.click()
  })
  await new Promise((r) => setTimeout(r, 500))
  await page.evaluate(() => [...document.querySelectorAll('button')].find((e) => (e.innerText || '').trim() === '打开')?.click())
  await new Promise((r) => setTimeout(r, 2_500))
}

// Prepare the @ reference but do not confirm it until recording starts.
const editor = await page.$('[contenteditable="true"], textarea')
await editor.click()
await page.keyboard.type(`@${video}`)
await new Promise((r) => setTimeout(r, 1_500))

// Start the screencast.
const cdp = await page.createCDPSession()
const frames = []
cdp.on('Page.screencastFrame', (frame) => {
  frames.push(frame.data)
  cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {})
})
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: 1500, maxHeight: 940, everyNthFrame: 1 })

// Beat 1: confirm the mention (file chip appears).
await page.keyboard.press('Enter')
await new Promise((r) => setTimeout(r, 900))
// Beat 2: open the preview.
await page.evaluate((name) => {
  const nodes = [...document.querySelectorAll('*')].filter((e) => {
    const text = (e.innerText || '').trim()
    return text.includes(name) && e.offsetParent !== null && e.children.length <= 2 && !e.closest('[role="listbox"]')
  })
  nodes[nodes.length - 1]?.click()
}, video)
// Beat 3: let it play.
await new Promise((r) => setTimeout(r, 2_600))
// Beat 4: seek forward to show range streaming.
await page.evaluate(() => {
  const v = document.querySelector('video')
  if (v !== null) v.currentTime = Math.max(0, v.duration * 0.62)
})
await new Promise((r) => setTimeout(r, 1_800))
// Beat 5: seek to the end.
await page.evaluate(() => {
  const v = document.querySelector('video')
  if (v !== null) v.currentTime = Math.max(0, v.duration - 1.2)
})
await new Promise((r) => setTimeout(r, 1_600))

await cdp.send('Page.stopScreencast')
await browser.close()

frames.forEach((data, index) => {
  writeFileSync(`${outDir}/f-${String(index).padStart(5, '0')}.jpg`, Buffer.from(data, 'base64'))
})
console.log(`frames: ${frames.length} → ${outDir}`)

// Build the GIF: 12 fps, 900 px wide, palette-optimized.
execFileSync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-framerate', '12', '-i', `${outDir}/f-%05d.jpg`,
  '-vf', 'scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=192:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4',
  '-loop', '0', gifPath
], { stdio: 'inherit' })
console.log(`gif: ${gifPath}`)
