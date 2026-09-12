import { STATUS_LABEL } from '../lib/format'

// Status is never colour alone: every badge carries an icon and the word.
// A colourblind reader, a greyscale print and a screen reader all get the verdict.
function Icon({ status }) {
  return status === 'verified' ? (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2.5 8.5 6 12l7.5-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 1.8 15 14H1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8 6.3v3.1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11.6" r="0.95" fill="currentColor" />
    </svg>
  )
}

export default function StatusBadge({ status, size }) {
  const known = status === 'verified' || status === 'needs_review'
  const label = STATUS_LABEL[status] ?? 'Unknown'
  return (
    <span
      className={`badge badge-${known ? status : 'needs_review'}${size === 'lg' ? ' badge-lg' : ''}`}
    >
      <Icon status={status} />
      {label}
    </span>
  )
}
