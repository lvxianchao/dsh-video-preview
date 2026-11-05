/**
 * End-to-end check through the auth gate: browser → dsh-web-guard → DSH.
 *
 * The production path for an internet-exposed deployment is the guard in front
 * of the harness, and the guard proxies responses (`proxyRes.pipe`). This test
 * proves the video route still streams byte ranges through that proxy: log in,
 * open a video, confirm `206` + `Content-Range` arrive and a seek lands.
 *
 * Prerequisites:
 *   - a shadow instance with BOTH plugins installed and the guard on its own
 *     port, e.g. --patch test/guard.patch.yml (listenPort 3181, known password)
 *   - a video file in the shadow workspace (use a >32 MB one to prove streaming)
 *   - puppeteer-core + a Chrome binary
 *
 * Env:
 *   GUARD_URL      e.g. http://127.0.0.1:3181/
 *   GUARD_PASSWORD the password configured for the shadow guard
 *   CHROME         path to a Chrome/headless-shell binary
 *   VIDEO          file name to open (default: big-video.mp4)
 */
import puppeteer from 'puppeteer-core'

const url = process.env.GUARD_URL
const password = process.env.GUARD_PASSWORD
const chrome = process.env.CHROME
const video = process.env.VIDEO ?? 'big-video.mp4'
if (!url || !password || !chrome) {
  console.error('set GUARD_URL, GUARD_PASSWORD and CHROME (see the header of this file)')
  process.exit(2)
}

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'shell',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required']
})
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1000 })

// Observe the stream route on the wire — it must go through the guard's origin.
const streamResponses = []
page.on('response', (response) => {
  const parsed = new URL(response.url())
  if (parsed.pathname.endsWith('/api/video-preview.stream')) {
    streamResponses.push({
      origin: parsed.origin,
      status: response.status(),
      range: response.headers()['content-range'] ?? null
    })
  }
})

// ── sign in ────────────────────────────────────────────────────────────────
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForSelector('input[name="password"]', { timeout: 20_000 })
await page.type('input[name="password"]', password)
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60_000 }).catch(() => {}),
  page.keyboard.press('Enter')
])
await new Promise((r) => setTimeout(r, 4_000))
const afterLogin = await page.evaluate(() => location.pathname)
if (afterLogin === '/login') {
  console.error('login failed — still on /login')
  await browser.close()
  process.exit(1)
}

// ── first-run onboarding and workspace selection ───────────────────────────
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

// ── open the video ─────────────────────────────────────────────────────────
const editor = await page.$('[contenteditable="true"], textarea')
await editor.click()
await page.keyboard.type(`@${video}`)
await new Promise((r) => setTimeout(r, 1_500))
await page.keyboard.press('Enter')
await new Promise((r) => setTimeout(r, 1_200))
await page.evaluate((name) => {
  const nodes = [...document.querySelectorAll('*')].filter((e) => {
    const text = (e.innerText || '').trim()
    return text.includes(name) && e.offsetParent !== null && e.children.length <= 2 && !e.closest('[role="listbox"]')
  })
  nodes[nodes.length - 1]?.click()
}, video)

await page.waitForFunction(
  () => {
    const v = document.querySelector('video')
    return v !== null && v.readyState >= 2 && v.duration > 0
  },
  { timeout: 40_000 }
)

const initial = await page.evaluate(() => {
  const v = document.querySelector('video')
  return { duration: v.duration, src: v.src, width: v.videoWidth, error: v.error?.message ?? null }
})

const seek = await page.evaluate(async () => {
  const v = document.querySelector('video')
  const target = Math.max(0, v.duration - 4)
  v.currentTime = target
  const deadline = Date.now() + 25_000
  while (Date.now() < deadline) {
    if (v.readyState >= 2 && Math.abs(v.currentTime - target) < 2) break
    await new Promise((r) => setTimeout(r, 250))
  }
  return { target, reached: v.currentTime }
})

await page.screenshot({ path: 'test/e2e-guard-result.png' })
await browser.close()

console.log(JSON.stringify({ initial, seek, stream: streamResponses.slice(0, 6) }, null, 1))

const guardOrigin = new URL(url).origin
const ok =
  initial.error === null &&
  initial.duration > 60 &&
  new URL(initial.src).origin === guardOrigin && // the request went through the gate
  streamResponses.some((r) => r.status === 206 && r.range !== null) &&
  Math.abs(seek.reached - seek.target) < 2

console.log(ok ? 'PASS' : 'FAIL')
process.exit(ok ? 0 : 1)
