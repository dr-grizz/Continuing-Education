// Each staff address remounts the workspace, so a link that moves within the
// staff pages calls `arrive(target)` in its onClick, and the view it opens calls
// `focusOnArrival(heading, target)` once that heading exists. The note lives at
// module scope so it survives the remount; development mode runs effects twice,
// so it is cleared only when focus actually moves.
let pending: string | undefined;

export function arrive(target: string) {
  pending = target;
}

export function focusOnArrival(heading: HTMLElement | null, target: string) {
  if (pending !== target || !heading) return;
  pending = undefined;
  heading.focus();
}
