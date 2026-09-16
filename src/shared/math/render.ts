/**
 * One renderer for the board: the styles and HTML here are used by the editor (through the shared
 * CSS string and the block helpers) and by PDF, PNG and Markdown export, so what you see on screen
 * is what comes out of the printer.
 */
import { buildFigure } from './figure';
import { escapeHtml, mathToPlain, renderMath } from './mathtext';
import { buildPlot } from './plot';
import type { MathBlock, MathBoard, MathPaper, SketchStroke } from '../types/math';

/** Squared-paper look, the same in the editor and in exports. */
export function paperStyle(paper: MathPaper): { backgroundImage: string; backgroundSize: string } {
  switch (paper) {
    case 'grid':
      return {
        backgroundImage: 'linear-gradient(var(--m-line) 1px, transparent 1px), linear-gradient(90deg, var(--m-line) 1px, transparent 1px)',
        backgroundSize: '22px 22px, 22px 22px',
      };
    case 'dots':
      return { backgroundImage: 'radial-gradient(var(--m-dot) 1.2px, transparent 1.2px)', backgroundSize: '22px 22px' };
    case 'lined':
      return { backgroundImage: 'linear-gradient(var(--m-line) 1px, transparent 1px)', backgroundSize: '100% 26px' };
    default:
      return { backgroundImage: 'none', backgroundSize: 'auto' };
  }
}

/** Typography and block styles. `--m-*` variables are set by the host (app theme or export sheet). */
export const MATH_CSS = `
.m-math { font-family: var(--m-math-font, 'Source Serif 4 Variable', 'Cambria Math', Georgia, serif); line-height: 1.45; white-space: pre-wrap; }
.m-math sup, .m-math sub { font-size: 0.68em; line-height: 0; }
.m-math sup { vertical-align: super; }
.m-math sub { vertical-align: sub; }
.m-var { font-style: italic; }
.m-fn { font-style: normal; padding-right: 0.15em; }
.m-paren { padding: 0 0.02em; }
.m-frac { display: inline-flex; flex-direction: column; align-items: center; vertical-align: -0.48em; margin: 0 0.16em; }
.m-frac > .m-num { padding: 0 0.28em 0.06em; }
.m-frac > .m-den { padding: 0.06em 0.28em 0; border-top: 1px solid currentColor; }
.m-frac .m-frac { font-size: 0.92em; }
.m-sqrt { display: inline-flex; align-items: stretch; margin: 0 0.06em; }
.m-sqrt > .m-radical { font-size: 1.04em; }
.m-sqrt > .m-radicand { border-top: 1px solid currentColor; padding: 0.08em 0.16em 0 0.08em; margin-top: 0.14em; }
.m-figure, .m-plot { display: block; max-width: 100%; height: auto; }
.m-steps { display: flex; flex-direction: column; gap: 0; }
.m-step { display: flex; align-items: baseline; gap: 12px; padding: 2px 0; }
.m-step-math { font-size: 1.06em; }
.m-step-reason { font-size: 0.78em; opacity: 0.72; font-family: var(--m-sans, system-ui, sans-serif); }
.m-arrow { color: var(--m-muted, #888); font-size: 0.9em; line-height: 1; padding-left: 4px; }
.m-result { display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 6px; background: var(--m-accent-soft, rgba(217,119,87,0.14)); font-size: 1.08em; }
.m-table { border-collapse: collapse; font-family: var(--m-math-font, Georgia, serif); }
.m-table th, .m-table td { border: 1px solid var(--m-border, #ddd); padding: 5px 12px; text-align: left; }
.m-table th { font-family: var(--m-sans, system-ui, sans-serif); font-size: 0.8em; font-weight: 600; opacity: 0.8; }
`;

const EXPORT_CSS = `
:root { --m-line: rgba(20,20,19,0.09); --m-dot: rgba(20,20,19,0.20); --m-border: #dedbd0; --m-muted: #73726c; --m-accent-soft: rgba(217,119,87,0.16); --m-sans: 'Segoe UI', system-ui, sans-serif; --m-math-font: 'Cambria Math', Georgia, 'Times New Roman', serif; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #ffffff; color: #141413; font-family: var(--m-sans); font-size: 14px; }
.page { padding: 26mm 20mm; }
.board-title { font-family: Georgia, serif; font-size: 25px; margin: 0 0 4px; }
.board-topic { color: var(--m-muted); font-size: 13px; margin: 0 0 22px; }
.block { margin: 0 0 20px; page-break-inside: avoid; break-inside: avoid; }
.block-title { font-family: var(--m-sans); font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--m-muted); margin: 0 0 6px; }
.block-note { font-size: 12px; color: var(--m-muted); margin-top: 6px; }
.text-body { font-family: Georgia, serif; font-size: 14.5px; line-height: 1.6; white-space: pre-wrap; }
.text-body.tone { border-left: 3px solid var(--m-accent, #d97757); padding-left: 12px; }
.formula { border: 1px solid var(--m-border); border-radius: 8px; padding: 12px 16px; background: #fcfbf7; }
.formula .m-math { font-size: 17px; }
.where { margin: 8px 0 0; padding-left: 18px; font-size: 12.5px; color: var(--m-muted); }
.figure-wrap { display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap; }
.caption { font-size: 12.5px; color: var(--m-muted); margin-top: 4px; }
.quiz { border: 1px solid var(--m-border); border-radius: 10px; padding: 14px 16px; }
.quiz h3 { margin: 0 0 4px; font-size: 15px; }
.quiz-instructions { font-size: 12.5px; color: var(--m-muted); margin: 0 0 12px; }
.question { margin: 0 0 14px; page-break-inside: avoid; break-inside: avoid; }
.question-prompt { font-size: 14px; }
.choices { margin: 6px 0 0; padding-left: 20px; font-size: 13.5px; }
.answer-line { margin-top: 8px; border-bottom: 1px solid var(--m-border); height: 20px; }
.answer { margin-top: 6px; font-size: 13.5px; }
.answer strong { font-family: var(--m-math-font); }
.answer-key { page-break-before: always; break-before: page; }
.sketch { border: 1px solid var(--m-border); border-radius: 10px; overflow: hidden; }
@page { size: A4; margin: 0; }
`;

interface RenderOptions {
  /** false prints a test paper: questions without their answers, and an answer key at the end. */
  answers?: boolean;
  /** Fixed width in px for PNG export (A4 width at 96 dpi by default). */
  width?: number;
}

const mathHtml = (text: string, className = '') => `<span class="m-math ${className}">${renderMath(text)}</span>`;

function textBlockHtml(body: string): string {
  const paragraphs = body.split(/\n{2,}/);
  return paragraphs
    .map((paragraph) => {
      const lines = paragraph.split('\n');
      if (lines.every((line) => /^\s*[-*•]\s+/.test(line)) && lines.length > 1) {
        return `<ul class="choices">${lines.map((line) => `<li>${renderMath(line.replace(/^\s*[-*•]\s+/, ''))}</li>`).join('')}</ul>`;
      }
      return `<p class="text-body">${renderMath(paragraph)}</p>`;
    })
    .join('');
}

/** A stroke as SVG path data, shared by the editor canvas and the exporter. */
export function strokeGeometry(stroke: SketchStroke): { d: string; head?: string } {
  const points = stroke.points;
  const count = Math.floor(points.length / 2);
  if (count < 2) return { d: '' };
  const x = (i: number) => points[i * 2];
  const y = (i: number) => points[i * 2 + 1];
  const first = { x: x(0), y: y(0) };
  const last = { x: x(count - 1), y: y(count - 1) };
  const box = { x: Math.min(first.x, last.x), y: Math.min(first.y, last.y), w: Math.abs(last.x - first.x), h: Math.abs(last.y - first.y) };
  switch (stroke.tool) {
    case 'pen': {
      // Quadratic segments through the midpoints keep freehand lines smooth.
      let d = `M${x(0)} ${y(0)}`;
      for (let i = 1; i < count - 1; i++) {
        const midX = (x(i) + x(i + 1)) / 2;
        const midY = (y(i) + y(i + 1)) / 2;
        d += `Q${x(i)} ${y(i)} ${midX} ${midY}`;
      }
      d += `L${last.x} ${last.y}`;
      return { d };
    }
    case 'line':
      return { d: `M${first.x} ${first.y}L${last.x} ${last.y}` };
    case 'rect':
      return { d: `M${box.x} ${box.y}h${box.w}v${box.h}h${-box.w}Z` };
    case 'ellipse': {
      const rx = box.w / 2;
      const ry = box.h / 2;
      const cx = box.x + rx;
      const cy = box.y + ry;
      return { d: `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0` };
    }
    case 'triangle':
      return { d: `M${box.x + box.w / 2} ${box.y}L${box.x + box.w} ${box.y + box.h}L${box.x} ${box.y + box.h}Z` };
    case 'arrow': {
      const angle = Math.atan2(last.y - first.y, last.x - first.x);
      const size = Math.max(9, stroke.width * 3.4);
      const left = { x: last.x - size * Math.cos(angle - Math.PI / 7), y: last.y - size * Math.sin(angle - Math.PI / 7) };
      const right = { x: last.x - size * Math.cos(angle + Math.PI / 7), y: last.y - size * Math.sin(angle + Math.PI / 7) };
      return { d: `M${first.x} ${first.y}L${last.x} ${last.y}`, head: `M${left.x} ${left.y}L${last.x} ${last.y}L${right.x} ${right.y}` };
    }
  }
}

export function sketchSvg(strokes: SketchStroke[], width: number, height: number): string {
  const paths = strokes
    .map((stroke) => {
      const { d, head } = strokeGeometry(stroke);
      if (!d) return '';
      const color = stroke.color === 'currentColor' ? '#141413' : stroke.color;
      const common = `stroke="${escapeHtml(color)}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
      return `<path d="${d}" ${common}/>${head ? `<path d="${head}" ${common}/>` : ''}`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${paths}</svg>`;
}

function blockHtml(block: MathBlock, options: RenderOptions, answerKey: string[]): string {
  const note = block.note ? `<div class="block-note">${renderMath(block.note)}</div>` : '';
  const title = (text?: string) => (text ? `<div class="block-title">${escapeHtml(text)}</div>` : '');
  switch (block.type) {
    case 'text':
      return `<section class="block">${title(block.heading)}${textBlockHtml(block.body)}${note}</section>`;
    case 'formula': {
      const where = block.where?.length ? `<ul class="where">${block.where.map((item) => `<li>${renderMath(item)}</li>`).join('')}</ul>` : '';
      return `<section class="block">${title(block.title)}<div class="formula">${block.formula
        .split('\n')
        .map((line) => `<div>${mathHtml(line)}</div>`)
        .join('')}${where}</div>${note}</section>`;
    }
    case 'derivation': {
      const steps = block.steps
        .map(
          (step, index) =>
            `<div class="m-step"><span class="m-step-math">${renderMath(step.math)}</span>${step.reason ? `<span class="m-step-reason">${escapeHtml(step.reason)}</span>` : ''}</div>${
              index < block.steps.length - 1 ? '<div class="m-arrow">↓</div>' : ''
            }`,
        )
        .join('');
      const result = block.result ? `<div><span class="m-result m-math">${renderMath(block.result)}</span></div>` : '';
      return `<section class="block">${title(block.title)}<div class="m-steps m-math">${steps}</div>${result}${note}</section>`;
    }
    case 'figure': {
      const built = buildFigure(block.figure);
      return `<section class="block">${title(block.title)}<div class="figure-wrap">${built.svg}</div>${block.caption ? `<div class="caption">${renderMath(block.caption)}</div>` : ''}${note}</section>`;
    }
    case 'plot': {
      const built = buildPlot(block.plot);
      return `<section class="block">${title(block.title)}${built.svg}${block.caption ? `<div class="caption">${renderMath(block.caption)}</div>` : ''}${note}</section>`;
    }
    case 'table': {
      const header = `<tr>${block.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr>`;
      const rows = block.rows
        .map((row) => `<tr>${block.columns.map((_, index) => `<td>${block.math === false ? escapeHtml(row[index] ?? '') : renderMath(row[index] ?? '')}</td>`).join('')}</tr>`)
        .join('');
      return `<section class="block">${title(block.title)}<table class="m-table">${header}${rows}</table>${note}</section>`;
    }
    case 'quiz': {
      const showAnswers = options.answers !== false;
      const questions = block.questions
        .map((question, index) => {
          const figure = question.figure ? buildFigure(question.figure).svg : '';
          const choices = question.choices?.length
            ? `<ol class="choices" type="A">${question.choices.map((choice) => `<li>${renderMath(choice)}</li>`).join('')}</ol>`
            : showAnswers
              ? ''
              : '<div class="answer-line"></div>';
          const answer = showAnswers ? `<div class="answer"><strong>Answer:</strong> ${renderMath(question.answer)}</div>` : '';
          const steps = showAnswers && question.steps?.length ? `<div class="m-steps m-math">${question.steps.map((step) => `<div class="m-step">${renderMath(step)}</div>`).join('')}</div>` : '';
          if (!showAnswers) answerKey.push(`${index + 1}. ${mathToPlain(question.answer)}`);
          return `<div class="question"><div class="question-prompt">${index + 1}. ${renderMath(question.prompt)}</div>${figure}${choices}${answer}${steps}</div>`;
        })
        .join('');
      const points = block.questions.reduce((sum, question) => sum + (question.points ?? 1), 0);
      return `<section class="block quiz"><h3>${escapeHtml(block.title ?? 'Practice test')}</h3><p class="quiz-instructions">${escapeHtml(block.instructions ?? '')}${
        points ? `${block.instructions ? ' · ' : ''}${points} point${points === 1 ? '' : 's'}` : ''
      }</p>${questions}${note}</section>`;
    }
    case 'sketch':
      return `<section class="block"><div class="sketch">${sketchSvg(block.strokes, 900, block.height)}</div>${note}</section>`;
  }
}

/** The whole board as a standalone HTML page, for printing and for PNG capture. */
export function boardHtml(board: MathBoard, options: RenderOptions = {}): string {
  const answerKey: string[] = [];
  const blocks = board.blocks.map((block) => blockHtml(block, options, answerKey)).join('');
  const key = answerKey.length ? `<section class="block answer-key"><h3>Answer key</h3><div class="m-math">${answerKey.map((line) => `<div>${renderMath(line)}</div>`).join('')}</div></section>` : '';
  const paper = paperStyle(board.paper);
  const width = options.width ? `body { width: ${options.width}px; } .page { padding: 34px 40px; }` : '';
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<title>${escapeHtml(board.title)}</title>`,
    `<style>${EXPORT_CSS}${MATH_CSS}\n.page { background-image: ${paper.backgroundImage}; background-size: ${paper.backgroundSize}; }\n${width}</style>`,
    '</head><body><div class="page">',
    `<h1 class="board-title">${escapeHtml(board.title)}</h1>`,
    board.topic ? `<p class="board-topic">${escapeHtml(board.topic)}</p>` : '',
    blocks,
    key,
    '</div></body></html>',
  ].join('');
}

/**
 * How tall the printed page is, worked out from the blocks themselves (figures and graphs report
 * their real size). PNG capture needs a height up front, so this errs on the generous side: extra
 * white at the bottom is better than a board cut in half.
 */
export function estimateBoardHeight(board: MathBoard, width = 794, options: RenderOptions = {}): number {
  const charsPerLine = Math.max(30, Math.round((width - 120) / 8));
  const lines = (text: string) => text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
  let height = 150 + (board.topic ? 30 : 0);
  for (const block of board.blocks) {
    height += 34;
    switch (block.type) {
      case 'text':
        height += lines(block.body) * 24 + (block.heading ? 24 : 0);
        break;
      case 'formula':
        height += 40 + lines(block.formula) * 30 + (block.where?.length ?? 0) * 20;
        break;
      case 'derivation':
        height += 30 + block.steps.length * 46;
        break;
      case 'figure':
        try {
          height += buildFigure(block.figure).height + 20;
        } catch {
          height += 220;
        }
        break;
      case 'plot':
        height += buildPlot(block.plot).height + 20;
        break;
      case 'table':
        height += 40 + block.rows.length * 34;
        break;
      case 'quiz':
        height += 70;
        for (const question of block.questions) {
          height += lines(question.prompt) * 22 + 26;
          if (question.choices?.length) height += question.choices.length * 22;
          else if (options.answers === false) height += 28;
          if (options.answers !== false) height += 24 + (question.steps?.length ?? 0) * 26;
          if (question.figure) {
            try {
              height += buildFigure(question.figure).height + 10;
            } catch {
              height += 200;
            }
          }
        }
        break;
      case 'sketch':
        height += block.height + 20;
        break;
    }
  }
  if (options.answers === false) height += 120 + board.blocks.filter((block) => block.type === 'quiz').reduce((sum, block) => sum + (block as { questions: unknown[] }).questions.length, 0) * 26;
  return Math.min(30_000, Math.round(height * 1.08));
}

/** The board as Markdown, for a study sheet that can be read anywhere. */
export function boardMarkdown(board: MathBoard, options: RenderOptions = {}): string {
  const lines: string[] = [`# ${board.title}`, ''];
  if (board.topic) lines.push(board.topic, '');
  const answerKey: string[] = [];
  for (const block of board.blocks) {
    switch (block.type) {
      case 'text':
        if (block.heading) lines.push(`## ${block.heading}`, '');
        lines.push(mathToPlain(block.body), '');
        break;
      case 'formula':
        if (block.title) lines.push(`## ${block.title}`, '');
        lines.push(...block.formula.split('\n').map((line) => `> ${mathToPlain(line)}`), '');
        if (block.where?.length) lines.push(...block.where.map((item) => `- ${mathToPlain(item)}`), '');
        break;
      case 'derivation':
        lines.push(`## ${block.title ?? 'Step by step'}`, '');
        for (const step of block.steps) lines.push(`${mathToPlain(step.math)}${step.reason ? `    _${step.reason}_` : ''}`, '');
        if (block.result) lines.push(`**${mathToPlain(block.result)}**`, '');
        break;
      case 'figure':
        lines.push(`## ${block.title ?? 'Figure'}`, '', `${block.figure.kind}${block.figure.sides?.length ? ` with sides ${block.figure.sides.join(', ')}` : ''}${block.figure.labels?.length ? `, vertices ${block.figure.labels.join('')}` : ''}`, '');
        if (block.caption) lines.push(mathToPlain(block.caption), '');
        break;
      case 'plot':
        lines.push(`## ${block.title ?? 'Graph'}`, '', ...(block.plot.functions ?? []).map((fn) => `- y = ${mathToPlain(fn.expr)}`), '');
        break;
      case 'table': {
        if (block.title) lines.push(`## ${block.title}`, '');
        lines.push(`| ${block.columns.join(' | ')} |`, `| ${block.columns.map(() => '---').join(' | ')} |`);
        for (const row of block.rows) lines.push(`| ${block.columns.map((_, index) => mathToPlain(row[index] ?? '')).join(' | ')} |`);
        lines.push('');
        break;
      }
      case 'quiz': {
        lines.push(`## ${block.title ?? 'Practice test'}`, '');
        if (block.instructions) lines.push(block.instructions, '');
        block.questions.forEach((question, index) => {
          lines.push(`${index + 1}. ${mathToPlain(question.prompt)}`);
          if (question.choices?.length) lines.push(...question.choices.map((choice, i) => `   ${String.fromCharCode(65 + i)}) ${mathToPlain(choice)}`));
          if (options.answers === false) answerKey.push(`${index + 1}. ${mathToPlain(question.answer)}`);
          else {
            lines.push(`   **Answer:** ${mathToPlain(question.answer)}`);
            if (question.steps?.length) lines.push(...question.steps.map((step) => `   - ${mathToPlain(step)}`));
          }
          lines.push('');
        });
        break;
      }
      case 'sketch':
        lines.push(`_Whiteboard sketch (${block.strokes.length} strokes) — open the board in Cellar to see it._`, '');
        break;
    }
    if (block.note) lines.push(`_${mathToPlain(block.note)}_`, '');
  }
  if (answerKey.length) lines.push('## Answer key', '', ...answerKey, '');
  return lines.join('\n');
}
