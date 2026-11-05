/**
 * End-to-end check: install the plugin into a shadow instance, open the Web UI
 * in headless Chrome, reference a video with `@`, click the reference, and
 * assert the document body is a playing <video> streaming from the plugin's
 * authenticated byte-range route.
 *
 * Streaming assertions (v0.2):
 *   - the video source is the /api/video-preview.stream route, not a Blob
 *   - at least one 206 Partial Content response arrives with a Content-Range
 *   - seeking near the END of a file larger than the old 32 MB complete-read
 *     cap actually lands there (impossible for the v0.1 Blob path)
 *   - the meta line reports the stat size
 *
 * Prerequisites:
 *   - a shadow instance (see test/shadow.patch.yml) printing a `?token=` URL
 *   - a video file inside the shadow's workspace (bigger than 32 MB to prove
 *     streaming: pass VIDEO=big-video.mp4)
 *   - puppeteer-core + a Chrome binary reachable from this project
 *
 * Env:
 *   SHADOW_URL   e.g. http://127.0.0.1:3199/?token=...
 *   CHROME       path to a Chrome/headless-shell binary
 *   VIDEO        file name to open (default: test-video.mp4)
 */
import puppeteer from 'puppeteer-core'

const url = process.env.SHADOW_URL
const chrome = process.env.CHROME
const video = process.env.VIDEO ?? 'test-video.mp4'
if (!url || !chrome) {
  console.error('set SHADOW_URL and CHROME (see the header of this file)')
  process.exit(2)
}

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'shell',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required']
})
const page = await browser.newPage()

// Observe the stream route on the wire.
const streamResponses = []
page.on('response', (response) => {
  const path = new URL(response.url()).pathname
  if (path.endsWith('/api/video-preview.stream')) {
    streamResponses.push({
      status: response.status(),
      range: response.headers()['content-range'] ?? null,
      size: response.headers()['content-length'] ?? null
    })
  }
})

await page.setViewport({ width: 1600, height: 1000 })
await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 })
await new Promise((r) => setTimeout(r, 5_000))

// Dismiss first-run onboarding and pick a workspace when the instance is fresh.
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

// Reference the video with an @ mention and confirm it.
const editor = await page.$('[contenteditable="true"], textarea')
await editor.click()
await page.keyboard.type(`@${video}`)
await new Promise((r) => setTimeout(r, 1_500))
await page.keyboard.press('Enter')
await new Promise((r) => setTimeout(r, 1_200))

// Click the file reference; the document preview opens on the right.
await page.evaluate((name) => {
  const nodes = [...document.querySelectorAll('*')].filter((e) => {
    const text = (e.innerText || '').trim()
    return text.includes(name) && e.offsetParent !== null && e.children.length <= 2 && !e.closest('[role="listbox"]')
  })
  nodes[nodes.length - 1]?.click()
}, video)

// Wait for playback to start.
await page.waitForFunction(
  () => {
    const v = document.querySelector('video')
    return v !== null && v.readyState >= 2 && v.duration > 0
  },
  { timeout: 30_000 }
)

// Initial state.
const initial = await page.evaluate(() => {
  const v = document.querySelector('video')
  return { duration: v.duration, currentTime: v.currentTime, src: v.src.slice(0, 120), paused: v.paused, width: v.videoWidth, error: v.error?.message ?? null }
})

// Seek near the END of the file: the server must serve a range from ~195 s.
const seek = await page.evaluate(async () => {
  const v = document.querySelector('video')
  const target = Math.max(0, v.duration - 4)
  try {
    v.currentTime = target
  } catch {
    return { target, reached: -1 }
  }
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (v.readyState >= 2 && Math.abs(v.currentTime - target) < 2) break
    await new Promise((r) => setTimeout(r, 250))
  }
  return { target, reached: v.currentTime }
})

// Meta line: stat-driven size (waits for the stat response to render).
await page.waitForFunction(() => /格式 [A-Z0-9]+ · [\d.]+ [KMG]?B/.test(document.body.innerText), { timeout: 15_000 })
const meta = await page.evaluate(() => document.body.innerText.match(/格式 [A-Z0-9]+ · ([\d.]+ [KMG]?B)/)?.[1] ?? null)

await page.screenshot({ path: 'test/e2e-result.png' })
await browser.close()

const report = {
  initial,
  seek,
  meta,
  stream: streamResponses.slice(0, 6)
}
console.log(JSON.stringify(report, null, 1))

const ok =
  initial.error === null &&
  initial.duration > 60 && // the big file must be the one that played
  initial.src.includes('video-preview.stream') &&
  streamResponses.some((r) => r.status === 206 && r.range !== null) &&
  seek.reached >= 0 && Math.abs(seek.reached - seek.target) < 2 &&
  meta !== null && meta.includes('MB')

console.log(ok ? 'PASS' : 'FAIL')
process.exit(ok ? 0 : 1)
