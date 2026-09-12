import { useEffect, useState } from 'react'

/**
 * Theme switch.
 *
 * The platform ships dark — a lit, glass-panelled ground that suits a screen in
 * a dim judging room and suits algae. Light is not a lesser fallback: it is the
 * Phase 0 design-canvas palette intact, and it is what to switch to when a
 * projector washes the darks into a single flat grey, which is the failure this
 * control exists for. One click apart, on purpose.
 *
 * The attribute is set on <html> by an inline script in `index.html` before
 * first paint, so the page never flashes the wrong theme on a cold load; this
 * component only reads that decision back and flips it. The choice is kept in
 * localStorage, which can throw or come back empty (a private window, cleared
 * site data) — so every access is guarded and the failure mode is simply that
 * the preference does not survive a reload.
 */
const KEY = 'acm-theme'

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

function Sun() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" fill="none"
      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
    </svg>
  )
}

function Moon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" fill="none"
      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.5 14.3A8.6 8.6 0 0 1 9.7 3.5a8.6 8.6 0 1 0 10.8 10.8Z" />
    </svg>
  )
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(currentTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      // Private window or blocked site data: the theme still applies, it just
      // does not persist across a reload.
    }
  }, [theme])

  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      className="theme-toggle no-print"
      onClick={() => setTheme(next)}
      aria-label={`Switch to the ${next} theme`}
      title={`Switch to the ${next} theme`}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </button>
  )
}
