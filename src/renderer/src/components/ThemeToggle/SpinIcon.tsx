import { useId, type ReactElement } from 'react'

/**
 * The sun/moon morph from toggles.dev's "spin" toggle.
 *
 * Geometry taken verbatim from that component (24x24 viewBox, r=5 disc at
 * centre, eight rays at stroke-width 2). What is NOT taken is its delivery:
 * the original is Tailwind utility classes keyed off a `dark:` variant, so it
 * animates when the DOCUMENT theme changes. Here it is plain CSS keyed off
 * `data-dark` on the svg, which matters because the toggle has to animate
 * from the knob's own position — mid-flip, before anything has committed.
 *
 * Three things move, and the ordering is the whole effect:
 *
 *   - the disc scales to 170%, growing past the frame
 *   - the eight rays rotate 45° and scale to nothing
 *   - a clip path bites a crescent out of the disc, turning it into a moon
 *
 * Rays lead going dark and follow coming back (the 15% delay swaps sides), so
 * the sun sheds its rays before the moon appears rather than both at once.
 */

/** Covers the whole frame — the disc is a full circle. */
const CLIP_SUN = 'M0 0h25a1 1 0 0010 10v14H0Z'
/** Notched — the same disc reads as a crescent. */
const CLIP_MOON = 'M0 2h13a1 1 0 0010 10v14H0Z'

const RAYS = [
  'M12 1.4v2.4',
  'm20.3 3.7-2.5 2.5',
  'M22.6 12h-2.4',
  'M12 22.6v-2.4',
  'M1.4 12h2.4',
  'm20.3 20.3-2.5-2.5',
  'm3.7 20.3 2.5-2.5',
  'm3.7 3.7 2.5 2.5'
]

export interface SpinIconProps {
  dark: boolean
  size?: number
  /** Milliseconds for the whole morph. */
  duration?: number
  className?: string
}

export function SpinIcon({
  dark,
  size = 10,
  duration = 400,
  className
}: SpinIconProps): ReactElement {
  // Two of these can be on screen at once (the footer and a Storybook story),
  // and a duplicate clipPath id would silently apply one node's clip to both.
  const clipId = `spin-clip-${useId()}`

  return (
    <svg
      className={['spin-icon', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      data-dark={dark}
      style={{ '--spin-duration': `${String(duration)}ms` } as React.CSSProperties}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={clipId}>
          {/*
           * `d` is animatable as a presentation attribute in Chromium, which
           * is the only engine this app runs in. Setting it inline rather
           * than in CSS keeps the two path strings next to each other where
           * the shape is easiest to read.
           */}
          <path className="spin-icon-clip" d={dark ? CLIP_MOON : CLIP_SUN} />
        </clipPath>
      </defs>

      <g stroke="currentColor" strokeLinecap="round">
        <circle
          className="spin-icon-disc"
          cx={12}
          cy={12}
          r={5}
          fill="currentColor"
          clipPath={`url(#${clipId})`}
        />
        {RAYS.map((ray) => (
          <path
            key={ray}
            className="spin-icon-ray"
            d={ray}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeMiterlimit={0}
          />
        ))}
      </g>
    </svg>
  )
}
