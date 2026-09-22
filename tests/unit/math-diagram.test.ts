import { describe, expect, it } from 'vitest';
import { buildDiagram, diagramStepCount, trigCircle } from '../../src/shared/math/diagram';
import { normalizeDiagram } from '../../src/shared/math/diagram-normalize';
import { dashArray, lineStyleOf, opacityOf, resolveColor, weightOf, zigzag } from '../../src/shared/math/linestyle';
import { labelText } from '../../src/shared/math/mathtext';
import { describeBlock, normalizeBlock, patchBlock } from '../../src/shared/math/normalize';
import { boardHtml, boardMarkdown, sketchSvg, strokeGeometry } from '../../src/shared/math/render';
import type { DiagramBlock, MathBoard } from '../../src/shared/types/math';

const groupsOf = (svg: string) => [...svg.matchAll(/<g class="dg-el" data-step="(\d+)"/g)].map((match) => Number(match[1]));

describe('line styles', () => {
  it('reads the ways people name line styles', () => {
    expect(lineStyleOf('dashed')).toBe('dashed');
    expect(lineStyleOf('dotted line')).toBe('dotted');
    expect(lineStyleOf('dot dot')).toBe('dotted');
    expect(lineStyleOf('dash-dot')).toBe('dashdot');
    expect(lineStyleOf('sketched')).toBe('zigzag');
    expect(lineStyleOf('scribble')).toBe('zigzag');
    expect(lineStyleOf('wavy')).toBe('wavy');
    expect(lineStyleOf('normal')).toBe('solid');
    expect(lineStyleOf('sparkly')).toBeUndefined();
  });

  it('turns weights, transparency and colours into safe values', () => {
    expect(weightOf('bold')).toBeGreaterThan(weightOf('normal'));
    expect(weightOf('thick')).toBeGreaterThan(weightOf('bold'));
    expect(weightOf(99)).toBe(12);
    expect(opacityOf(0.5)).toBe(0.5);
    expect(opacityOf('40%')).toBe(0.4);
    expect(opacityOf(60)).toBe(0.6);
    expect(opacityOf(0)).toBe(0.1);
    expect(resolveColor('Red')).toBe('#d64545');
    expect(resolveColor('#3F7FD0')).toBe('#3f7fd0');
    expect(resolveColor('black')).toBe('currentColor');
    // Anything that could break out of an SVG attribute falls back to the text colour.
    expect(resolveColor('red" onload="alert(1)')).toBe('currentColor');
    expect(resolveColor('url(javascript:x)')).toBe('currentColor');
  });

  it('draws dashes that scale with the pen and a zigzag that walks the line', () => {
    expect(dashArray('solid', 2)).toBeUndefined();
    expect(dashArray('dashed', 2)).toMatch(/^\d/);
    expect(dashArray('dotted', 4)).toMatch(/^0\.01 /);
    const points = zigzag(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      2,
    );
    expect(points.length).toBeGreaterThan(10);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[points.length - 1]).toEqual({ x: 100, y: 0 });
    // Alternating sides of the line.
    expect(Math.sign(points[1].y)).toBe(-Math.sign(points[2].y));
  });

  it('writes Greek letters from their names in labels', () => {
    expect(labelText('tan alpha')).toBe('tan α');
    expect(labelText('\\theta')).toBe('θ');
    expect(labelText('alphabet')).toBe('alphabet');
    expect(labelText('x^2')).toBe('x²');
  });
});

describe('step-by-step diagrams', () => {
  it('places points from expressions and names, and tags each element with its step', () => {
    const built = buildDiagram({
      elements: [
        { kind: 'axes', step: 1 },
        { kind: 'unit-circle', step: 1 },
        { kind: 'point', name: 'P', at: ['cos 60', 'sin 60'], step: 2 },
        { kind: 'segment', from: 'O', to: 'P', color: 'blue', weight: 'bold', step: 2 },
        { kind: 'line', x: 1, color: 'purple', label: 'x = 1', step: 3 },
        { kind: 'segment', from: [1, 0], to: [1, 'tan 60'], line: 'zigzag', color: 'orange', step: 3 },
        { kind: 'angle', at: 'O', start: 0, end: 60, label: 'alpha', step: 2 },
      ],
      steps: [{ text: 'Circle' }, { text: 'Angle' }, { text: 'Tangent' }],
    });
    expect(built.notes).toEqual([]);
    expect(built.stepCount).toBe(3);
    expect(built.points.P).toEqual({ x: 0.5, y: 0.866 });
    expect(groupsOf(built.svg)).toEqual([1, 1, 2, 2, 3, 3, 2]);
    expect(built.svg).toContain('stroke="#3f7fd0"');
    expect(built.svg).toContain('>α</text>');
    expect(built.svg).toContain('>x = 1</text>');
    // Solid and zigzag lines can be traced by the draw-in animation.
    expect(built.svg).toContain('pathLength="1"');
  });

  it('keeps circles round and draws dashed and dotted lines with a dash pattern', () => {
    const built = buildDiagram({
      elements: [
        { kind: 'circle', at: [0, 0], radius: 2, line: 'dashed' },
        { kind: 'segment', from: [0, 0], to: [2, 0], line: 'dotted', opacity: 0.4 },
      ],
    });
    expect(built.svg).toContain('stroke-dasharray');
    expect(built.svg).toContain('<g opacity="0.4">');
    // Same scale on both axes: a circle's box is square (give or take the padding).
    expect(Math.abs(built.width - built.height)).toBeLessThan(2);
  });

  it('extends lines and rays to the edge of the drawing', () => {
    const built = buildDiagram({ elements: [{ kind: 'point', at: [0, 0] }, { kind: 'point', at: [4, 4] }, { kind: 'line', from: [0, 0], through: [1, 1] }, { kind: 'ray', from: [0, 0], through: [1, -1] }], xMin: -5, xMax: 5, yMin: -5, yMax: 5 });
    expect(built.notes).toEqual([]);
    expect(built.svg.match(/class="dg-s"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('says what it could not draw instead of failing', () => {
    const built = buildDiagram({ elements: [{ kind: 'segment', from: 'Q', to: [1, 1] }, { kind: 'circle', at: [0, 0] }, { kind: 'function', expr: 'x^2 + k' }, { kind: 'point', at: [0, 0] }] });
    expect(built.notes).toHaveLength(3);
    expect(built.notes[0]).toContain('"Q"');
    expect(built.notes[2]).toContain('k');
    expect(groupsOf(built.svg)).toHaveLength(1);
  });

  it('draws angles counter-clockwise, clockwise when negative, and the smaller angle between two arms', () => {
    const reflex = buildDiagram({ elements: [{ kind: 'angle', at: [0, 0], start: 0, end: 300, label: 'α' }] });
    const between = buildDiagram({ elements: [{ kind: 'point', at: [0, 0] }, { kind: 'angle', at: [0, 0], from: [1, 0], to: [0, -1], label: 'β' }] });
    const right = buildDiagram({ elements: [{ kind: 'angle', at: [0, 0], from: [1, 0], to: [0, 1] }] });
    expect(reflex.notes).toEqual([]);
    expect(between.notes).toEqual([]);
    // The right angle gets the square mark, not an arc.
    expect(right.svg).not.toContain('>90');
    expect(right.svg.match(/<path/g)?.length).toBe(1);
  });
});

describe('the trigonometric circle', () => {
  it('puts T on x = 1 with the exact tangent and its sign, in every quadrant', () => {
    const cases: Array<[number, string, string]> = [
      [30, '√3/3', 'positive'],
      [135, '−1', 'negative'],
      [210, '√3/3', 'positive'],
      [300, '−√3', 'negative'],
    ];
    for (const [angle, value, sign] of cases) {
      const circle = trigCircle({ angle, show: ['tan'] });
      expect(circle.facts[0]).toBe(`tan ${angle}° = ${value} (${sign})`);
      const built = buildDiagram(circle.spec);
      expect(built.notes).toEqual([]);
      expect(built.points.T.x).toBe(1);
      expect(built.points.T.y).toBeCloseTo(Math.tan((angle * Math.PI) / 180), 3);
      // Quadrants II and III extend OP backwards through O, like in the notebook.
      const extend = circle.spec.steps!.find((step) => step.text.includes('Extend') || step.text.includes('extend'))!;
      expect(extend.text.includes('backwards')).toBe(angle > 90 && angle < 270);
    }
  });

  it('constructs cot on y = 1 and sin/cos as coordinates, and says when tan is undefined', () => {
    const cot = trigCircle({ angle: 135, show: ['sin', 'cos', 'cot'] });
    expect(cot.facts).toEqual(['sin 135° = √2/2 (positive)', 'cos 135° = −√2/2 (negative)', 'cot 135° = −1 (negative)']);
    expect(buildDiagram(cot.spec).points.K).toEqual({ x: -1, y: 1 });
    const undefinedTan = trigCircle({ angle: 90, show: ['tan'] });
    expect(undefinedTan.facts[0]).toBe('tan 90° is undefined');
    expect(trigCircle({ angle: '3pi/4', show: ['tan'] }).degrees).toBe(135);
    expect(() => trigCircle({ angle: 'banana' })).toThrow(/angle/);
  });
});

describe('diagrams from loose model input', () => {
  it('reads steps that each say something and draw something', () => {
    const { diagram, notes } = normalizeDiagram({
      steps: [
        { say: 'Draw the unit circle', draw: [{ type: 'axes' }, { type: 'unit circle' }] },
        { explain: 'Mark the angle', math: 'α = 40°', draw: [{ shape: 'vector', from: [0, 0], to: ['cos 40', 'sin 40'], colour: 'Blue', thickness: 'bold' }, { kind: 'angle arc', end: 40, label: 'alpha' }] },
        { text: 'Highlight it', draw: [{ kind: 'highlight', from: [1, 0], to: [1, 'tan 40'] }, { kind: 'dotted line', from: [0, 0], to: [1, 1], alpha: '50%' }] },
      ],
    });
    expect(notes).toEqual([]);
    expect(diagram!.steps!.map((step) => step.text)).toEqual(['Draw the unit circle', 'Mark the angle', 'Highlight it']);
    expect(diagram!.steps![1].math).toBe('α = 40°');
    expect(diagram!.elements.map((element) => [element.kind, element.step])).toEqual([
      ['axes', 1],
      ['unit-circle', 1],
      ['arrow', 2],
      ['angle', 2],
      ['segment', 3],
      ['segment', 3],
    ]);
    expect(diagram!.elements[2]).toMatchObject({ color: 'Blue', weight: 'bold' });
    expect(diagram!.elements[4]).toMatchObject({ line: 'zigzag', color: 'orange', weight: 'bold' });
    expect(diagram!.elements[5]).toMatchObject({ line: 'dotted', opacity: 0.5 });
    expect(buildDiagram(diagram!).notes).toEqual([]);
  });

  it('builds the preset, keeping the model\'s own wording for the steps', () => {
    const { block, notes } = normalizeBlock({ type: 'diagram', preset: 'trig circle', angle: 210, show: 'tan', steps: ['Birim çemberi çiz.'] }, new Set());
    expect(block?.type).toBe('diagram');
    const diagram = (block as DiagramBlock).diagram;
    expect(diagram.steps![0].text).toBe('Birim çemberi çiz.');
    expect(diagram.steps!.length).toBe(diagramStepCount(diagram));
    expect(notes).toContain('tan 210° = √3/3 (positive)');
  });

  it('guesses a diagram from its fields, keeps a figure a figure, and round-trips through the editor', () => {
    const ids = new Set<string>();
    expect(normalizeBlock({ elements: [{ kind: 'point', at: [1, 1] }] }, ids).block?.type).toBe('diagram');
    expect(normalizeBlock({ type: 'diagram', figure: { kind: 'square', sides: [2] } }, ids).block?.type).toBe('figure');
    expect(normalizeBlock({ type: 'diagram' }, ids).error).toMatch(/something to draw/);
    const first = normalizeBlock({ type: 'diagram', preset: 'trig-circle', angle: 300, show: ['cos', 'tan'] }, ids).block as DiagramBlock;
    const again = normalizeBlock(structuredClone(first), new Set()).block as DiagramBlock;
    expect(again.diagram).toEqual(first.diagram);
  });

  it('keeps drawing on an existing diagram with addSteps', () => {
    const block = normalizeBlock({ type: 'diagram', steps: [{ text: 'Axes', draw: [{ kind: 'axes' }] }] }, new Set()).block as DiagramBlock;
    const { block: next, changed } = patchBlock(block, { addSteps: [{ text: 'A point', draw: [{ kind: 'point', name: 'A', at: [2, 1] }] }, { text: 'A line', draw: [{ kind: 'line', y: 1, line: 'dashed' }] }] });
    expect(changed).toEqual(['steps']);
    const diagram = (next as DiagramBlock).diagram;
    expect(diagram.steps!.map((step) => step.text)).toEqual(['Axes', 'A point', 'A line']);
    expect(diagram.elements.map((element) => element.step)).toEqual([1, 2, 3]);
    expect(describeBlock(next, 0)).toContain('3 steps');
  });
});

describe('diagram and whiteboard export', () => {
  const board = (blocks: MathBoard['blocks']): MathBoard => ({ id: 'b', conversationId: 'c', title: 'Board', topic: '', paper: 'grid', angleMode: 'deg', blocks, version: 1, createdAt: 0, updatedAt: 0 });

  it('prints the finished drawing with its steps, and lists them in Markdown', () => {
    const block = normalizeBlock({ type: 'diagram', title: 'tan 135°', preset: 'trig-circle', angle: 135, show: ['tan'] }, new Set()).block!;
    const html = boardHtml(board([block]));
    expect(html).toContain('m-diagram');
    expect(html).toContain('class="diagram-steps"');
    expect(html).toContain('Draw the tangent axis');
    const markdown = boardMarkdown(board([block]));
    expect(markdown).toContain('## tan 135°');
    expect(markdown).toMatch(/5\. The piece of the tangent axis/);
  });

  it('draws whiteboard strokes with dashes, zigzags, transparency and text', () => {
    const zig = strokeGeometry({ tool: 'line', color: '#d64545', width: 3, points: [0, 0, 100, 0], line: 'zigzag' });
    expect(zig.d.split('L').length).toBeGreaterThan(10);
    const svg = sketchSvg(
      [
        { tool: 'line', color: '#d64545', width: 3, points: [0, 0, 100, 0], line: 'dashed', opacity: 0.5 },
        { tool: 'text', color: 'currentColor', width: 2.5, points: [10, 20], text: 'alpha = 30°' },
        { tool: 'text', color: '#3f7fd0', width: 2.5, points: [10, 40], text: '<script>' },
      ],
      900,
      300,
    );
    expect(svg).toContain('stroke-dasharray');
    expect(svg).toContain('opacity="0.5"');
    expect(svg).toContain('>α = 30°</text>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).not.toContain('<script>');
  });

  it('keeps the new stroke fields when a board comes back from the editor', () => {
    const { block } = normalizeBlock(
      {
        type: 'sketch',
        strokes: [
          { tool: 'pen', color: '#d64545', width: 12, points: [0, 0, 10, 10], opacity: 0.35 },
          { tool: 'arrow', color: '#3f7fd0', width: 2, points: [0, 0, 10, 10], line: 'dotted' },
          { tool: 'text', color: '#141413', width: 2, points: [5, 5], text: 'θ' },
          { tool: 'text', color: '#141413', width: 2, points: [5, 5], text: '' },
        ],
      },
      new Set(),
    );
    if (block?.type !== 'sketch') throw new Error('expected a sketch');
    expect(block.strokes).toEqual([
      { tool: 'pen', color: '#d64545', width: 12, points: [0, 0, 10, 10], opacity: 0.35 },
      { tool: 'arrow', color: '#3f7fd0', width: 2, points: [0, 0, 10, 10], line: 'dotted' },
      { tool: 'text', color: '#141413', width: 2, points: [5, 5], text: 'θ' },
    ]);
  });
});
