/**
 * Apple's rubber-band curve: displacement grows slower the further you pull, approaching
 * `dimension`. c = 0.55 matches UIScrollView.
 */
export function rubberBand(offset: number, dimension: number, c = 0.55) {
  if (dimension <= 0) return 0;

  return (1 - 1 / ((Math.abs(offset) * c) / dimension + 1)) * dimension * Math.sign(offset);
}
