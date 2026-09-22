import { describe, expect, it } from 'vitest';
import { findText, fold, isBlankLine, placeAnswer, placeMark, placeNote, textWidth } from '../../src/shared/study/anchor';
import { AI_INK, describeAnnotation, nextAnnotationId, normalizeAnnotations, pageForModel } from '../../src/shared/study/annotations';
import { groupLines, linesText, type TextRun } from '../../src/shared/study/lines';
import { fitPages, formatPageList, parsePageList, scopeLabel, scopePages, sectionStart } from '../../src/shared/study/pages';
import type { BookPageInfo, PageLine, StudyAnnotation } from '../../src/shared/types/study';

const A4: BookPageInfo = { width: 595, height: 842, chars: 500 };

/** Lines laid out like a worksheet: 14 pt apart, starting at y. */
function sheet(texts: Array<string | [string, number]>, x = 60, top = 80): PageLine[] {
  return texts.map((entry, index) => {
    const [text, indent] = typeof entry === 'string' ? [entry, 0] : entry;
    return { text, x: x + indent, y: top + index * 16, w: text.length * 5.5, h: 11 };
  });
}

describe('page lists', () => {
  it('reads the ways people write pages', () => {
    expect(parsePageList('45-48, 60', 100)).toEqual([45, 46, 47, 48, 60]);
    expect(parsePageList('12–14', 100)).toEqual([12, 13, 14]);
    expect(parsePageList('p. 10 to 12', 100)).toEqual([10, 11, 12]);
    expect(parsePageList('sayfa 3 5 7', 100)).toEqual([3, 5, 7]);
    expect(parsePageList('9-7', 100)).toEqual([7, 8, 9]);
    expect(parsePageList('98-140', 100)).toEqual([98, 99, 100]);
    expect(parsePageList('0, 101, abc', 100)).toEqual([]);
    expect(parsePageList(4, 10)).toEqual([4]);
  });

  it('writes page lists back compactly', () => {
    expect(formatPageList([60, 45, 46, 47, 48, 46])).toBe('45–48, 60');
    expect(formatPageList([3])).toBe('3');
  });

  it('works out the pages a context covers', () => {
    expect(scopePages({ page: 12, scope: 'page' }, 200)).toEqual([12]);
    expect(scopePages({ page: 12, scope: 'upto', from: 9 }, 200)).toEqual([9, 10, 11, 12]);
    expect(scopePages({ page: 12, scope: 'pages', pages: '30-31' }, 200)).toEqual([30, 31]);
    expect(scopePages({ page: 12, scope: 'pages', pages: '' }, 200)).toEqual([12]);
    expect(scopePages({ page: 3, scope: 'book' }, 4)).toEqual([1, 2, 3, 4]);
    expect(scopeLabel({ page: 12, scope: 'upto', from: 9 }, 200)).toBe('Pages 9–12');
    expect(scopeLabel({ page: 2, scope: 'book' }, 10)).toBe('Whole book');
  });

  it('finds the chapter a page is in', () => {
    const outline = [
      { title: 'Cells', page: 5, depth: 0 },
      { title: 'Energy', page: 21, depth: 0 },
      { title: 'Photosynthesis', page: 24, depth: 1 },
    ];
    expect(sectionStart(outline, 22)).toBe(21);
    expect(sectionStart(outline, 30)).toBe(24);
    expect(sectionStart(outline, 3)).toBe(1);
  });

  it('keeps the page on screen and its neighbours when a range is too long', () => {
    const { included, omitted } = fitPages([1, 2, 3, 4, 5, 6, 7, 8], 6, () => 100, 350);
    expect(included).toEqual([5, 6, 7]);
    expect(omitted).toEqual([1, 2, 3, 4, 8]);
    // The current page always goes in, even when it alone is over budget.
    expect(fitPages([1, 2], 2, () => 1000, 10).included).toEqual([2]);
  });
});

describe('page text as lines', () => {
  it('joins runs on one baseline and keeps two columns apart', () => {
    const runs: TextRun[] = [
      { text: 'Photo', x: 50, y: 100, w: 30, h: 10 },
      { text: 'synthesis', x: 80, y: 100, w: 50, h: 10 },
      { text: 'uses', x: 134, y: 100, w: 22, h: 10 },
      // The right column on the same baseline, far away.
      { text: 'Mitosis', x: 320, y: 100, w: 40, h: 10 },
      { text: 'light.', x: 50, y: 114, w: 30, h: 10, eol: true },
      { text: '', x: 0, y: 0, w: 0, h: 0, eol: true },
      { text: 'Next', x: 50, y: 128, w: 25, h: 10 },
    ];
    const lines = groupLines(runs);
    expect(lines.map((line) => line.text)).toEqual(['Photosynthesis uses', 'Mitosis', 'light.', 'Next']);
    expect(lines[0].x).toBe(50);
    expect(lines[0].w).toBeCloseTo(106, 0);
    expect(linesText(lines)).toContain('Photosynthesis uses\nMitosis');
  });
});

describe('finding text on a page', () => {
  const lines = sheet(['Chapter 3 Exercises', '1. What is the unit of force?', '................................', '2. Işık hangi hızla yayılır?', '3. Photosynthesis happens in the ______ of the cell.', 'Explain why leaves are green.']);

  it('folds case, accents and the Turkish i', () => {
    expect(fold('IŞIK Hızı!')).toBe('isik hizi');
    expect(fold('İstanbul')).toBe('istanbul');
  });

  it('finds a question by its number', () => {
    expect(findText(lines, '2')?.line).toBe(3);
    expect(findText(lines, 'Question 1')?.line).toBe(1);
    expect(findText(lines, 'Soru 3')?.line).toBe(4);
  });

  it('finds a phrase without caring about case or Turkish letters', () => {
    const match = findText(lines, 'isik hangi hizla');
    expect(match?.line).toBe(3);
    expect(match?.text).toBe('Işık hangi hızla');
    expect(match!.rects[0].x).toBeGreaterThan(lines[3].x);
  });

  it('finds a paraphrased question from its first words or shared words', () => {
    expect(findText(lines, 'Explain why leaves are green in colour')?.line).toBe(5);
    expect(findText(lines, 'leaves green why')?.line).toBe(5);
    expect(findText(lines, 'something else entirely')).toBeNull();
  });

  it('spots printed answer lines', () => {
    expect(isBlankLine('................................')).toBe(true);
    expect(isBlankLine('_______________')).toBe(true);
    expect(isBlankLine('1. What?')).toBe(false);
    expect(isBlankLine('- - -')).toBe(false);
  });
});

describe('placing an answer', () => {
  it('writes a fill-in-the-blank answer on the blank, shrinking it to fit', () => {
    const lines = sheet(['3. Photosynthesis happens in the __________ of the cell.', '', '4. Next question'].filter(Boolean));
    lines[1].y = 140;
    const match = findText(lines, 'happens in the')!;
    const spot = placeAnswer(lines, A4, match, 'chloroplast', [])!;
    expect(spot.where).toContain('blank');
    const line = lines[0];
    const blankStart = line.x + (line.w * line.text.indexOf('_')) / line.text.length;
    const blankWidth = (line.w * 10) / line.text.length;
    expect(spot.x).toBeCloseTo(blankStart, 0);
    // Small enough not to run into "of the cell".
    expect(textWidth('chloroplast', spot.size)).toBeLessThanOrEqual(blankWidth + 4.5);
    // A whole sentence does not fit a blank: it goes under the question instead.
    const long = placeAnswer(lines, A4, findText(lines, '3')!, 'It happens in the chloroplasts, which hold chlorophyll', [])!;
    expect(long.where).toContain('space under');
  });

  it('writes on the dotted answer line under the question', () => {
    const lines = sheet(['1. What is the unit of force?', '................................', '2. Next question']);
    const spot = placeAnswer(lines, A4, findText(lines, '1')!, 'The newton (N)', [])!;
    expect(spot.where).toContain('answer line');
    expect(spot.y).toBeGreaterThan(lines[0].y);
    expect(spot.y).toBeLessThan(lines[2].y);
  });

  it('uses the empty space under a question, stepping past an earlier answer', () => {
    const lines: PageLine[] = [
      { text: '1. Explain what a cell membrane does.', x: 60, y: 80, w: 220, h: 11 },
      { text: '2. Name two organelles.', x: 60, y: 200, w: 140, h: 11 },
    ];
    const first = placeAnswer(lines, A4, findText(lines, '1')!, 'It controls what goes in and out of the cell.', [])!;
    expect(first.where).toContain('space under');
    expect(first.y).toBeGreaterThan(91);
    const earlier: StudyAnnotation = { id: 'a1', type: 'text', page: 1, author: 'user', createdAt: 0, x: first.x, y: first.y, width: first.width, size: first.size, text: 'my answer', color: '#000' };
    const second = placeAnswer(lines, A4, findText(lines, '1')!, 'Another line', [earlier])!;
    expect(second.y).toBeGreaterThan(first.y + 10);
    expect(second.y).toBeLessThan(200);
  });

  it('goes to the right of the question when there is no room below, and gives up when there is none at all', () => {
    const tight = sheet(['1. 2 + 2 = ?', '2. 3 + 3 = ?', '3. 4 + 4 = ?']);
    const right = placeAnswer(tight, A4, findText(tight, '1')!, '4', [])!;
    expect(right.where).toContain('next to');
    expect(right.x).toBeGreaterThan(tight[0].x + tight[0].w);
    const full: PageLine[] = [
      { text: 'A very long question line that runs right across the whole page to the margin', x: 20, y: 80, w: 555, h: 11 },
      { text: 'The next paragraph starts immediately below it without any gap', x: 20, y: 92, w: 555, h: 11 },
    ];
    expect(placeAnswer(full, A4, findText(full, 'A very long question line')!, 'An answer that needs space', [])).toBeNull();
  });

  it('puts notes in the margin and marks after the user\'s answer', () => {
    const lines = sheet(['1. What is the unit of force?', '', '2. Next question']).filter((line) => line.text);
    const match = findText(lines, '1')!;
    const note = placeNote(A4, match, []);
    expect(note.x).toBeGreaterThan(560);
    const second = placeNote(A4, match, [{ id: 'a1', type: 'note', page: 1, author: 'ai', createdAt: 0, x: note.x, y: note.y, text: 'hi' }]);
    expect(second.y).toBeGreaterThan(note.y + 17);

    const answer: StudyAnnotation = { id: 'a2', type: 'text', page: 1, author: 'user', createdAt: 0, x: 60, y: 94, width: 90, size: 11, text: 'Newton', color: '#000' };
    const mark = placeMark(lines, A4, match, [answer]);
    expect(mark.answered).toBe(true);
    // Right after the word written, not at the end of the (wider) text box.
    expect(mark.x).toBeGreaterThan(60 + textWidth('Newton', 11));
    expect(mark.x).toBeLessThan(120);
    expect(placeMark(lines, A4, match, []).answered).toBe(false);
  });
});

describe('annotations', () => {
  const pages = [A4, A4];

  it('checks and clamps what the editor saves', () => {
    const saved = normalizeAnnotations(
      [
        { id: 'a1', type: 'text', page: 1, x: -40, y: 9000, text: 'hello', color: 'javascript:alert(1)' },
        { id: 'a1', type: 'highlight', page: 2, rects: [{ x: 10, y: 10, w: 50, h: 12 }], color: 'green' },
        { id: 'a3', type: 'ink', page: 1, strokes: [{ points: [1, 2, 3, 4], color: 'red', width: 2 }] },
        { id: 'a4', type: 'note', page: 7, x: 1, y: 1, text: 'no such page' },
        { id: 'a5', type: 'text', page: 1, x: 1, y: 1, text: '   ' },
        { id: 'a6', type: 'mark', page: 2, x: 5, y: 5, verdict: 'nonsense', author: 'ai' },
      ],
      pages,
    );
    expect(saved.map((a) => a.id)).toEqual(['a1', 'a2', 'a3', 'a6']);
    const text = saved[0] as Extract<StudyAnnotation, { type: 'text' }>;
    expect(text.x).toBe(0);
    expect(text.y).toBe(A4.height - 4);
    expect(text.color).toBe('#1f1f1f');
    expect((saved[1] as Extract<StudyAnnotation, { type: 'highlight' }>).color).toBe('#8bd49a');
    expect((saved[3] as Extract<StudyAnnotation, { type: 'mark' }>).verdict).toBe('correct');
    expect(nextAnnotationId(saved)).toBe('a7');
  });

  it('shows the model what was written under the question it answers', () => {
    const lines = sheet(['1. What is the unit of force?', '................................', '2. What is 2 + 2?']);
    const annotations: StudyAnnotation[] = [
      { id: 'a1', type: 'text', page: 1, author: 'user', createdAt: 0, x: 60, y: 96, width: 120, size: 11, text: 'Newton', color: '#000' },
      { id: 'a2', type: 'mark', page: 1, author: 'ai', createdAt: 0, x: 200, y: 96, verdict: 'correct' },
      { id: 'a3', type: 'text', page: 2, author: 'ai', createdAt: 0, x: 60, y: 96, width: 120, size: 11, text: 'elsewhere', color: AI_INK },
    ];
    const text = pageForModel(1, lines, annotations);
    const order = ['1. What is the unit of force?', '(answer line)', 'the user wrote "Newton"', 'you marked it ✓ correct', '2. What is 2 + 2?'].map((part) => text.indexOf(part));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).not.toContain('elsewhere');
    expect(text).toContain('Questions the user has answered on this page: 1. Not answered yet: 2.');
    expect(pageForModel(3, [], [], { scanned: true })).toContain('scanned');
    expect(describeAnnotation({ id: 'a9', type: 'ink', page: 1, author: 'user', createdAt: 0, strokes: [{ points: [0, 0, 1, 1], color: '#000', width: 1 }] })).toContain('by hand');
  });
});
