/**
 * End-to-end check: install the plugin into a shadow instance, open the Web UI
 * in headless Chrome, reference a video with `@`, click the reference, and
 * assert the document body is a playing <video>.
 *
 * Prerequisites:
 *   - a shadow instance (see test/shadow.patch.yml) printing a `?token=` URL
 *   - a video file inside the shadow's workspace
 *   - puppeteer-core + a Chrome binary reachable from this project
 *
 * Env:
 *   SHADOW_URL   e.g. http://127.0.0.1:3199/?token=...
 *   CHROME       path to a Chrome/headless-shell binary
 *   WORKSPACE    expected workspace directory (default: the shadow instance's home)
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
await new Promise((r) => setTimeout(r, 4_000))

const state = await page.evaluate(() => {
  const video = document.querySelector('video')
  return video === null ? { found: false } : {
    found: true,
    readyState: video.readyState,
    duration: video.duration,
    paused: video.paused,
    width: video.videoWidth,
    height: video.videoHeight,
    error: video.error?.message ?? null
  }
})

await page.screenshot({ path: 'test/e2e-result.png' })
await browser.close()

const ok = state.found && state.readyState >= 2 && state.duration > 0 && state.error === null
console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(state))
process.exit(ok ? 0 : 1)
