import {
  computeBottomToolbarLift,
  computeTopToolbarTop,
  computeWebViewMarginTop,
} from '../keyboardLayout'

describe('computeTopToolbarTop', () => {
  it('rests at headerHeight when nothing is focused (panOffset 0) - the regression where it painted over the visible header', () => {
    expect(computeTopToolbarTop(120, 0)).toBe(120)
  })

  it('stays at headerHeight while the pan is still smaller than it', () => {
    expect(computeTopToolbarTop(120, 50)).toBe(120)
  })

  it('tracks the pan once it exceeds headerHeight, so the toolbar stays on-screen as the header scrolls away', () => {
    expect(computeTopToolbarTop(120, 200)).toBe(200)
  })

  it('is exactly headerHeight at the boundary where panOffset equals it', () => {
    expect(computeTopToolbarTop(120, 120)).toBe(120)
  })

  it('handles a zero header height (degenerate, but should never throw or go negative)', () => {
    expect(computeTopToolbarTop(0, 0)).toBe(0)
    expect(computeTopToolbarTop(0, 80)).toBe(80)
  })
})

describe('computeWebViewMarginTop', () => {
  it('equals the toolbar height alone while the toolbar still rests on the header (panOffset at or below headerHeight) - the original double-counting fix', () => {
    expect(
      computeWebViewMarginTop({
        headerHeight: 120,
        topToolbarHeight: 64,
        panOffset: 0,
      }),
    ).toBe(64)
    expect(
      computeWebViewMarginTop({
        headerHeight: 120,
        topToolbarHeight: 64,
        panOffset: 50,
      }),
    ).toBe(64)
  })

  it('is still exactly the toolbar height at the boundary where panOffset equals headerHeight - the same boundary computeTopToolbarTop rests at', () => {
    expect(
      computeWebViewMarginTop({
        headerHeight: 120,
        topToolbarHeight: 64,
        panOffset: 120,
      }),
    ).toBe(64)
  })

  it('adds the excess pan once it pushes the toolbar past its resting position - the caret-under-toolbar regression found live', () => {
    // computeTopToolbarTop(120, 200) puts the toolbar's own `top` at 200,
    // 80px past its 120px resting spot - the WebView needs that same 80px
    // on top of the toolbar's own height, or its first line (the caret,
    // on an empty document) renders underneath the toolbar.
    expect(
      computeWebViewMarginTop({
        headerHeight: 120,
        topToolbarHeight: 64,
        panOffset: 200,
      }),
    ).toBe(64 + 80)
  })

  it('handles a zero header height (degenerate, but should never throw or go negative)', () => {
    expect(
      computeWebViewMarginTop({
        headerHeight: 0,
        topToolbarHeight: 64,
        panOffset: 0,
      }),
    ).toBe(64)
    expect(
      computeWebViewMarginTop({
        headerHeight: 0,
        topToolbarHeight: 64,
        panOffset: 80,
      }),
    ).toBe(64 + 80)
  })
})

describe('computeBottomToolbarLift', () => {
  it('is zero with no keyboard open (visual viewport fills the full layout viewport)', () => {
    const lift = computeBottomToolbarLift({
      windowInnerHeight: 800,
      panOffset: 0,
      visualViewportHeight: 800,
      gboardStripBuffer: 26,
    })
    expect(lift).toBe(0)
  })

  it('never goes negative when the visual viewport is somehow taller than the layout viewport', () => {
    const lift = computeBottomToolbarLift({
      windowInnerHeight: 800,
      panOffset: 0,
      visualViewportHeight: 850,
      gboardStripBuffer: 26,
    })
    expect(lift).toBe(0)
  })

  it('lifts by the raw gap plus the buffer once the keyboard actually opens', () => {
    const lift = computeBottomToolbarLift({
      windowInnerHeight: 800,
      panOffset: 0,
      visualViewportHeight: 500,
      gboardStripBuffer: 26,
    })
    // rawGap = 800 - (0 + 500) = 300
    expect(lift).toBe(300 + 26)
  })

  it('accounts for panOffset in the same formula as the keyboard height, not just the height alone', () => {
    const lift = computeBottomToolbarLift({
      windowInnerHeight: 800,
      panOffset: 50,
      visualViewportHeight: 500,
      gboardStripBuffer: 26,
    })
    // rawGap = 800 - (50 + 500) = 250
    expect(lift).toBe(250 + 26)
  })
})
