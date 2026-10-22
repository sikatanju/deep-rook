// Pins the eval-graph contract: settled series points become an SVG polyline
// in a 1000x100 viewBox (y inverted: y = 100 - win), and the pointer maps back
// onto a position index. jsdom has no layout and applies no cascade, so every
// geometric claim lives in an attribute — the same trick as the board's Arrow —
// while the pointer math is pinned directly through the exported
// pointerToIndex. The component does not exist yet: this file is the red.

import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { CLASSIFICATIONS, type Classification } from '@/lib/analysis/classify';

import { EvalGraph, pointerToIndex } from './eval-graph';

test('pointerToIndex maps, clamps, and guards degenerate geometry', () => {
  // Half the width is half the positions: 250 of 500 across 101 points.
  expect(pointerToIndex(250, 500, 101)).toBe(50);
  // A pointer outside the graph clamps to the first and last position.
  expect(pointerToIndex(-5, 500, 101)).toBe(0);
  expect(pointerToIndex(999, 500, 101)).toBe(100);
  // No width to measure against (jsdom's zero rects), or a single point.
  expect(pointerToIndex(500, 0, 34)).toBe(0);
  expect(pointerToIndex(250, 500, 1)).toBe(0);
});

test('pointerToIndex exactly inverts the draw mapping', () => {
  // The graph draws x(i) = (i / (count - 1)) * 1000, so every drawn x must
  // scrub back to its own index, or the cursor lands off the pointer.
  for (let i = 0; i < 34; i++) {
    expect(pointerToIndex((i / 33) * 1000, 1000, 34)).toBe(i);
  }
});

test('one polyline per settled run, y inverted into the viewBox', () => {
  const { container } = render(
    <EvalGraph series={[50, null, 60, 70]} index={0} onScrub={vi.fn()} />,
  );
  const segs = container.querySelectorAll('polyline[data-seg]');
  // The null breaks the series: [50] and [60, 70] are two runs, never bridged.
  expect(segs).toHaveLength(2);
  expect(segs[0]).toHaveAttribute('data-seg', '0');
  // Run 0 is the lone start point: x(0) = 0, y = 100 - 50 = 50.
  expect(segs[0]!.getAttribute('points')).toMatch(/^0(\.0+)?,50\b/);
  // Run 1 holds indices 2 and 3: x(2) = 2/3 * 1000 keeps its decimals, x(3)
  // is exactly 1000; y = 100 - win turns 60 -> 40 and 70 -> 30.
  const points = segs[1]!.getAttribute('points') ?? '';
  expect(points).toMatch(/666\.\d+,40/);
  expect(points).toMatch(/1000(\.0+)?,30/);
  // Runs never bridge a gap: run 1 carries none of run 0's points.
  expect(points).not.toMatch(/,50\b/);
});

test('the cursor follows the index prop', () => {
  const onScrub = vi.fn();
  const series = [50, null, 60, 70];
  const cursor = () =>
    document.querySelector<SVGLineElement>('line[data-cursor]');
  const { rerender } = render(
    <EvalGraph series={series} index={3} onScrub={onScrub} />,
  );
  // Index 3 is the far right of a 4-point series, and x1 and x2 agree.
  expect(cursor()!.getAttribute('x1')).toMatch(/^1000(\.0+)?$/);
  expect(cursor()!.getAttribute('x2')).toMatch(/^1000(\.0+)?$/);

  rerender(<EvalGraph series={series} index={0} onScrub={onScrub} />);
  expect(cursor()!.getAttribute('x1')).toMatch(/^0(\.0+)?$/);
});

test('marks sit on the curve in the grade color', () => {
  const marks: readonly { index: number; grade: Classification }[] = [
    { index: 2, grade: 'blunder' },
  ];
  const { container } = render(
    <EvalGraph
      series={[50, null, 60, 70]}
      index={0}
      marks={marks}
      onScrub={vi.fn()}
    />,
  );
  const mark = container.querySelector<SVGCircleElement>(
    'circle[data-mark="2"]',
  );
  expect(mark).not.toBeNull();
  // The blunder dot wears the classification's color…
  expect(mark).toHaveAttribute('fill', CLASSIFICATIONS.blunder.color);
  // …and sits on the curve: x(2) keeps its decimals, y = 100 - 60 = 40.
  expect(mark!.getAttribute('cx')).toMatch(/^666\.\d+/);
  expect(mark!.getAttribute('cy')).toMatch(/^40(\.0+)?$/);
});

test('role=img whose name reports position and settled progress', () => {
  render(
    <EvalGraph
      series={[50, null, null, null, 70]}
      index={3}
      onScrub={vi.fn()}
    />,
  );
  const graph = screen.getByRole('img', { name: /^Evaluation graph/ });
  // Index 3 of 5 positions, 2 of 5 settled (settled = non-null entries).
  const name = graph.getAttribute('aria-label') ?? '';
  expect(name).toMatch(/position 4 of 5/);
  expect(name).toMatch(/2\/5 analyzed/);
  // The geometry every coordinate assertion above assumes.
  expect(graph).toHaveAttribute('viewBox', '0 0 1000 100');
  expect(graph).toHaveAttribute('preserveAspectRatio', 'none');
  expect(graph.getAttribute('class') ?? '').toMatch(/touch-none/);
});

/** jsdom either lacks pointer capture or throws on ids with no active
 *  pointer; the drag must survive both, so hand the svg no-op captures. */
function stubPointerCapture(svg: Element) {
  svg.setPointerCapture = vi.fn();
  svg.releasePointerCapture = vi.fn();
}

/** A flat, 1000px-wide rect: pointer x maps straight onto the viewBox x. */
function mockRect() {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    right: 1000,
    bottom: 100,
    left: 0,
    width: 1000,
    height: 100,
    toJSON: () => ({}),
  } as DOMRect);
}

test('pointerdown scrubs via pointerToIndex despite the zero-width jsdom rect', () => {
  const onScrub = vi.fn();
  const series = Array.from({ length: 101 }, () => 50);
  render(<EvalGraph series={series} index={0} onScrub={onScrub} />);
  const svg = screen.getByRole('img', { name: /^Evaluation graph/ });
  stubPointerCapture(svg);
  // jsdom rects are all zero, so the measured width degrades to index 0.
  fireEvent.pointerDown(svg, { clientX: 500, pointerId: 1 });
  expect(onScrub).toHaveBeenCalledWith(0);
});

test('dragging scrubs across the measured rect', () => {
  const rect = mockRect();
  const onScrub = vi.fn();
  const series = Array.from({ length: 101 }, () => 50);
  try {
    render(<EvalGraph series={series} index={0} onScrub={onScrub} />);
    const svg = screen.getByRole('img', { name: /^Evaluation graph/ });
    stubPointerCapture(svg);
    // Half of a 101-point series: clientX 500 of width 1000 is index 50.
    fireEvent.pointerDown(svg, { clientX: 500, pointerId: 1 });
    expect(onScrub).toHaveBeenLastCalledWith(50);
    // The drag follows the pointer to the far right: index 100.
    fireEvent.pointerMove(svg, { clientX: 1000, pointerId: 1 });
    expect(onScrub).toHaveBeenLastCalledWith(100);
  } finally {
    rect.mockRestore();
  }
});

test('moves scrub only while a drag is live', () => {
  const rect = mockRect();
  const onScrub = vi.fn();
  const series = Array.from({ length: 101 }, () => 50);
  try {
    render(<EvalGraph series={series} index={0} onScrub={onScrub} />);
    const svg = screen.getByRole('img', { name: /^Evaluation graph/ });
    stubPointerCapture(svg);
    // Hovering over the graph before any pointerdown scrubs nothing.
    fireEvent.pointerMove(svg, { clientX: 500, pointerId: 1 });
    expect(onScrub).not.toHaveBeenCalled();
    // Down starts the drag: moves scrub…
    fireEvent.pointerDown(svg, { clientX: 0, pointerId: 1 });
    expect(onScrub).toHaveBeenLastCalledWith(0);
    fireEvent.pointerMove(svg, { clientX: 500, pointerId: 1 });
    expect(onScrub).toHaveBeenLastCalledWith(50);
    // …up ends it, so the next move is a hover again.
    fireEvent.pointerUp(svg, { pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 1000, pointerId: 1 });
    expect(onScrub).toHaveBeenCalledTimes(2);
    // pointerCancel ends a live drag the same way.
    fireEvent.pointerDown(svg, { clientX: 0, pointerId: 1 });
    fireEvent.pointerCancel(svg, { pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 1000, pointerId: 1 });
    expect(onScrub).toHaveBeenCalledTimes(3);
  } finally {
    rect.mockRestore();
  }
});
