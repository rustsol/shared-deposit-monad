// One-off responsive/accessibility audit (not part of CI). Screenshots every
// route at the five required viewports against the running dev server and
// reports horizontal overflow, tiny touch targets, and missing labels.
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = 'http://localhost:5173'
const VIEWPORTS = [
  { name: '360x800', width: 360, height: 800 },
  { name: '390x844', width: 390, height: 844 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1440x900', width: 1440, height: 900 },
]
const ROUTES = [
  ['landing', '/'],
  ['login', '/login'],
  ['dashboard', '/dashboard'],
  ['new-agreement', '/agreements/new'],
  ['agreement-2', '/agreements/10143/0x5720c3f77c66527b59f9f63cd3631a3019400910/2'],
  ['invitation-invalid', '/invitations/not-a-real-token'],
  ['settings', '/settings'],
  ['developer-network', '/developer/network'],
  ['not-found', '/definitely-not-a-page'],
]

mkdirSync('viewport-audit', { recursive: true })
const browser = await chromium.launch()
const problems = []

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  })
  const page = await context.newPage()
  for (const [name, path] of ROUTES) {
    try {
      await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 })
    } catch {
      await page.goto(BASE + path, { waitUntil: 'load', timeout: 30000 }).catch(() => {})
    }
    await page.waitForTimeout(600)
    const audit = await page.evaluate(() => {
      const issues = []
      const doc = document.documentElement
      if (doc.scrollWidth > doc.clientWidth + 1) {
        issues.push(`horizontal overflow: ${doc.scrollWidth} > ${doc.clientWidth}`)
      }
      for (const el of document.querySelectorAll('button, a[href]')) {
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        const inline = getComputedStyle(el).display === 'inline'
        if (!inline && rect.height < 30) {
          issues.push(`small target (<30px h): ${el.tagName} "${(el.textContent || '').trim().slice(0, 30)}" ${Math.round(rect.height)}px`)
        }
      }
      for (const input of document.querySelectorAll('input, select, textarea')) {
        const labelled =
          input.closest('label') ||
          input.getAttribute('aria-label') ||
          input.getAttribute('aria-labelledby') ||
          (input.id && document.querySelector(`label[for="${input.id}"]`))
        if (!labelled && input.type !== 'hidden') {
          issues.push(`unlabelled input: ${input.outerHTML.slice(0, 60)}`)
        }
      }
      const h1s = document.querySelectorAll('h1').length
      if (h1s !== 1) issues.push(`h1 count = ${h1s}`)
      return issues
    })
    for (const issue of audit) problems.push(`${viewport.name} ${name}: ${issue}`)
    await page.screenshot({
      path: `viewport-audit/${name}--${viewport.name}.png`,
      fullPage: true,
    })
  }
  await context.close()
}
await browser.close()

if (problems.length === 0) {
  console.log('AUDIT CLEAN: no overflow, no small targets, no unlabelled inputs, single h1 per page')
} else {
  console.log(`AUDIT FINDINGS (${problems.length}):`)
  for (const problem of problems) console.log(' -', problem)
}
