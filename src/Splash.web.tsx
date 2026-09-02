/*
 * This is a reimplementation of what exists in our HTML template files
 * already. Once the React tree mounts, this is what gets rendered first, until
 * the app is ready to go.
 */

import {useEffect, useRef, useState} from 'react'
import Svg, {Path} from 'react-native-svg'

import {atoms as a, flatten} from '#/alf'

const size = 64
const ratio = 48 / 30

export function Splash({
  isReady,
  children,
}: React.PropsWithChildren<{
  isReady: boolean
}>) {
  const [isAnimationComplete, setIsAnimationComplete] = useState(false)
  const splashRef = useRef<HTMLDivElement>(null)

  // hide the static one that's baked into the HTML - gets replaced by our React version below
  useEffect(() => {
    // double rAF ensures that the React version gets painted first
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const splash = document.getElementById('splash')
        if (splash) {
          splash.remove()
        }
      })
    })
  }, [])

  // when ready, we fade/scale out
  useEffect(() => {
    if (!isReady) return

    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    const node = splashRef.current
    if (!node || reduceMotion) {
      setIsAnimationComplete(true)
      return
    }

    const animation = node.animate(
      [
        {opacity: 1, transform: 'scale(1)'},
        {opacity: 0, transform: 'scale(1.5)'},
      ],
      {
        duration: 300,
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        fill: 'forwards',
      },
    )
    animation.onfinish = () => setIsAnimationComplete(true)

    return () => {
      animation.cancel()
    }
  }, [isReady])

  return (
    <>
      {isReady && children}

      {!isAnimationComplete && (
        <div
          ref={splashRef}
          style={flatten([
            a.fixed,
            a.inset_0,
            a.flex,
            a.align_center,
            a.justify_center,
            // to compensate for the `top: -50px` below
            {transformOrigin: 'center calc(50% - 50px)'},
          ])}>
          <Svg
            fill="none"
            viewBox="0 0 30 48"
            style={[a.relative, {width: size, height: size * ratio, top: -50}]}>
            <Path
              fill="#006AFF"
              d="M0 41.2222c0 1.5341 1.24365 2.7778 2.77778 2.7778h24.44442c1.5341 0 2.7778-1.2437 2.7778-2.7778v-7.2222c0-8.2843-6.7157-15-15-15-8.28427 0-15 6.7157-15 15z"
            />
            <Path
              fill="#75AFFF"
              d="M0 6.77778c0-1.53413 1.24365-2.77778 2.77778-2.77778h24.44442c1.5341 0 2.7778 1.24365 2.7778 2.77778v7.22222c0 8.2843-6.7157 15-15 15-8.28427 0-15-6.7157-15-15z"
            />
          </Svg>
        </div>
      )}
    </>
  )
}
