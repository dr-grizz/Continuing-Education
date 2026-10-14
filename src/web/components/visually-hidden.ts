// Hides content visually while keeping it for screen readers. Sizes are
// strings: in MUI `sx`, a number from 0 to 1 means a percentage, so `width: 1`
// would be 100% wide and widen the page (found by the reflow checks).
export const visuallyHidden = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;
