import {createSinglePathSVG} from './TEMPLATE'

/** "Insert audio" toolbar button. Figma layer name inherited Untitled UI's own `recording-02` naming, but the design's actual intent is embedding lecture/recitation audio, not video (see `articles client ui plan.md` finding 19). */
export const AudioWaveform_Stroke2_Corner0_Rounded = createSinglePathSVG({
  viewBox: '0 0 20 20',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  path: 'M2.5 8.33333L2.5 11.6667M6.25 9.16667V10.8333M10 5V15M13.75 2.5V17.5M17.5 8.33333V11.6667',
})
