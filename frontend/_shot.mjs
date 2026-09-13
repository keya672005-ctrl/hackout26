import { openBrowser, sleep } from './verify_lib.mjs'
import { writeFileSync } from 'node:fs'
const SP = 'C:/Users/singh/AppData/Local/Temp/claude/C--Users-singh-OneDrive-Desktop-Hackout/8928997a-6304-4e06-8e99-f2bc928a320a/scratchpad'
const { page, cleanup } = await openBrowser()
await page.send('Emulation.setDeviceMetricsOverride',
  { width: 1440, height: 860, deviceScaleFactor: 1, mobile: false })
await page.send('Page.navigate', { url: `file:///${SP}/deck.html` })
await page.waitFor(`() => document.querySelectorAll('.slide').length === 10`, 15000, 'deck')
await sleep(1400)
for (const [n, name] of [[0, 'title'], [3, 'diagram'], [4, 'charts'], [5, 'portfolio']]) {
  await page.evaluate(`() => { document.querySelectorAll('.rail button')[${n}].click(); return true }`)
  await sleep(700)
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${SP}/slide-${name}.png`, Buffer.from(data, 'base64'))
  console.log('shot', name)
}
const probe = await page.evaluate(`() => ({
  fonts: document.fonts ? document.fonts.status : 'n/a',
  serif: getComputedStyle(document.querySelector('h1')).fontFamily.slice(0, 40),
  bodyBg: getComputedStyle(document.body).backgroundColor,
  svgFill: getComputedStyle(document.querySelector('.slide[aria-label*="mechanism"] rect') || document.querySelector('rect')).fill,
  overflow: document.documentElement.scrollWidth > window.innerWidth,
})`)
console.log(JSON.stringify(probe))
await cleanup()
