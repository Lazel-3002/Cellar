/**
 * Maths written as plain text (`a^2 + sqrt(3) = 12/13`) turned into the stacked fractions, radical
 * signs and superscripts a notebook uses. The same renderer runs in the editor and in exports, so a
 * board looks the same on screen, in a PDF and in a PNG.
 *
 * It accepts what models write: ASCII (`sqrt`, `^2`, `<=`), a common subset of LaTeX (`\frac{a}{b}`,
 * `\sqrt{3}`, `\cdot`) and Unicode (`√3`, `a²`, `≤`). Output is built from escaped text only.
 */

const SYMBOLS: Array<[RegExp, string]> = [
  [/\\left|\\right|\\!|\\,|\\;|\\quad|\\qquad/g, ''],
  [/\\(?:dfrac|tfrac)/g, '\\frac'],
  [/\\(?:cdot|ast)\b/g, '·'],
  [/\\times\b/g, '×'],
  [/\\div\b/g, '÷'],
  [/\\pm\b/g, '±'],
  [/\\mp\b/g, '∓'],
  [/\\(?:le|leq)\b/g, '≤'],
  [/\\(?:ge|geq)\b/g, '≥'],
  [/\\(?:ne|neq)\b/g, '≠'],
  [/\\approx\b/g, '≈'],
  [/\\(?:equiv|cong)\b/g, '≅'],
  [/\\sim\b/g, '∼'],
  [/\\infty\b/g, '∞'],
  [/\\(?:Rightarrow|implies)\b/g, '⇒'],
  [/\\(?:rightarrow|to)\b/g, '→'],
  [/\\(?:leftarrow|gets)\b/g, '←'],
  [/\\(?:Leftrightarrow|iff)\b/g, '⇔'],
  [/\\(?:degree|circ)\b/g, '°'],
  [/\\(?:angle|measuredangle)\b/g, '∠'],
  [/\\(?:triangle|bigtriangleup)\b/g, '△'],
  [/\\(?:perp|bot)\b/g, '⊥'],
  [/\\parallel\b/g, '∥'],
  [/\\alpha\b/g, 'α'],
  [/\\beta\b/g, 'β'],
  [/\\gamma\b/g, 'γ'],
  [/\\delta\b/g, 'δ'],
  [/\\Delta\b/g, 'Δ'],
  [/\\theta\b/g, 'θ'],
  [/\\lambda\b/g, 'λ'],
  [/\\mu\b/g, 'μ'],
  [/\\pi\b/g, 'π'],
  [/\\sigma\b/g, 'σ'],
  [/\\(?:varphi|phi)\b/g, 'φ'],
  [/\\omega\b/g, 'ω'],
  [/\\Omega\b/g, 'Ω'],
  [/\\(?:operatorname|mathrm|mathbf|mathit|text)\s*\{([^}]*)\}/g, '$1'],
  [/\\(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|log|ln|exp|min|max|gcd|lim|deg)\b/g, '$1'],
  [/\$+/g, ''],
  [/<=>/g, '⇔'],
  [/<=/g, '≤'],
  [/>=/g, '≥'],
  [/!=/g, '≠'],
  [/~=/g, '≅'],
  [/=>/g, '⇒'],
  [/->/g, '→'],
  [/\+-(?=\s|\d|$)/g, '±'],
  [/\*/g, '·'],
  [/(?<=\d)x(?=\s*\d)/g, '×'],
];

const WORD_SYMBOLS: Record<string, string> = {
  pi: 'π',
  theta: 'θ',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  Delta: 'Δ',
  lambda: 'λ',
  mu: 'μ',
  omega: 'ω',
  phi: 'φ',
  infinity: '∞',
  Infinity: '∞',
  deg: '°',
  degree: '°',
  angle: '∠',
  perp: '⊥',
};

const SUPERSCRIPT_DIGITS: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', n: 'ⁿ' };

export function escapeHtml(text: string): string {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** LaTeX commands and ASCII operators folded into their Unicode symbols, keeping structure intact. */
function prepare(input: string): string {
  let text = String(input ?? '');
  for (const [pattern, replacement] of SYMBOLS) text = text.replace(pattern, replacement);
  return text.replace(/√\s*/g, '√');
}

interface Atom {
  html: string;
  /** Atoms an operator can attach to (a number, name, group, root or fraction). */
  operand: boolean;
}

const wrap = (html: string, operand = true): Atom => ({ html, operand });

class Renderer {
  private pos = 0;

  constructor(private readonly text: string) {}

  private get rest(): string {
    return this.text.slice(this.pos);
  }

  /** Reads a balanced (...) or {...} group and returns its inside. */
  private group(): string | null {
    const open = this.text[this.pos];
    if (open !== '(' && open !== '{' && open !== '[') return null;
    const close = open === '(' ? ')' : open === '{' ? '}' : ']';
    let depth = 0;
    for (let i = this.pos; i < this.text.length; i++) {
      const c = this.text[i];
      if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) {
          const inner = this.text.slice(this.pos + 1, i);
          this.pos = i + 1;
          return inner;
        }
      }
    }
    return null;
  }

  /** One operand: a group, a root, a number, a name, or a single character. */
  private operand(): Atom | null {
    const rest = this.rest;
    if (!rest) return null;
    if (rest[0] === '(' || rest[0] === '{' || rest[0] === '[') {
      const keepParens = rest[0] === '(';
      const inner = this.group();
      if (inner === null) {
        this.pos++;
        return wrap(escapeHtml(rest[0]), false);
      }
      const rendered = renderMath(inner);
      return wrap(keepParens ? `<span class="m-paren">(</span>${rendered}<span class="m-paren">)</span>` : rendered);
    }
    const root = /^(?:\\sqrt|sqrt|√)/.exec(rest);
    if (root) {
      this.pos += root[0].length;
      const radicand = this.operand();
      const inner = radicand ? this.stripParens(radicand.html) : '';
      return wrap(`<span class="m-sqrt"><span class="m-radical">√</span><span class="m-radicand">${inner}</span></span>`);
    }
    const number = /^\d+(?:[.,]\d+)?/.exec(rest);
    if (number) {
      this.pos += number[0].length;
      return wrap(escapeHtml(number[0]));
    }
    const name = /^[\p{L}]+/u.exec(rest);
    if (name) {
      this.pos += name[0].length;
      const word = name[0];
      if (WORD_SYMBOLS[word]) return wrap(WORD_SYMBOLS[word]);
      if (word.length === 1) return wrap(`<span class="m-var">${escapeHtml(word)}</span>`);
      if (/^(sin|cos|tan|cot|sec|csc|log|ln|lim|max|min|gcd|exp|arcsin|arccos|arctan)$/i.test(word)) return wrap(`<span class="m-fn">${escapeHtml(word)}</span>`);
      return wrap(escapeHtml(word));
    }
    const char = rest[0];
    this.pos++;
    return wrap(escapeHtml(char), false);
  }

  private stripParens(html: string): string {
    const match = /^<span class="m-paren">\(<\/span>([\s\S]*)<span class="m-paren">\)<\/span>$/.exec(html);
    return match ? match[1] : html;
  }

  render(): string {
    const atoms: Atom[] = [];
    while (this.pos < this.text.length) {
      const rest = this.rest;
      const space = /^\s+/.exec(rest);
      if (space) {
        this.pos += space[0].length;
        atoms.push(wrap(' ', false));
        continue;
      }
      // \frac{a}{b}
      if (rest.startsWith('\\frac')) {
        this.pos += 5;
        const numerator = this.operand();
        const denominator = this.operand();
        atoms.push(this.fraction(numerator ? this.stripParens(numerator.html) : '', denominator ? this.stripParens(denominator.html) : ''));
        continue;
      }
      if (rest[0] === '^' || rest[0] === '_') {
        const kind = rest[0];
        this.pos++;
        const target = this.operand();
        const inner = target ? this.stripParens(target.html) : '';
        const last = atoms.length - 1;
        const tag = kind === '^' ? 'sup' : 'sub';
        if (last >= 0) atoms[last] = wrap(`${atoms[last].html}<${tag}>${inner}</${tag}>`);
        else atoms.push(wrap(`<${tag}>${inner}</${tag}>`));
        continue;
      }
      if (rest[0] === '/') {
        const previous = atoms.length - 1;
        // Only build a stacked fraction between two operands.
        if (previous >= 0 && atoms[previous].operand) {
          this.pos++;
          const denominator = this.operand();
          if (denominator) {
            const withPower = this.attachPower(denominator);
            atoms[previous] = this.fraction(this.stripParens(atoms[previous].html), this.stripParens(withPower));
            continue;
          }
          atoms.push(wrap('/', false));
          continue;
        }
        this.pos++;
        atoms.push(wrap('/', false));
        continue;
      }
      const atom = this.operand();
      if (!atom) break;
      atoms.push(atom);
    }
    return atoms.map((atom) => atom.html).join('');
  }

  /** `3/5^2` keeps the power on the denominator. */
  private attachPower(atom: Atom): string {
    let html = atom.html;
    while (this.rest[0] === '^' || this.rest[0] === '_') {
      const kind = this.rest[0];
      this.pos++;
      const target = this.operand();
      const tag = kind === '^' ? 'sup' : 'sub';
      html = `${html}<${tag}>${target ? this.stripParens(target.html) : ''}</${tag}>`;
    }
    return html;
  }

  private fraction(numerator: string, denominator: string): Atom {
    return wrap(`<span class="m-frac"><span class="m-num">${numerator}</span><span class="m-den">${denominator}</span></span>`);
  }
}

/** Maths text as HTML. The result contains only Cellar's own markup and escaped text. */
export function renderMath(input: string): string {
  const text = prepare(input);
  if (!text.trim()) return '';
  return new Renderer(text).render();
}

/** Maths text as one line of Unicode, for exports, titles and tool results. */
export function mathToPlain(input: string): string {
  const text = prepare(input);
  return text
    .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2')
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
    .replace(/\\sqrt/g, '√')
    .replace(/sqrt\s*\(([^()]*)\)/g, '√($1)')
    .replace(/sqrt\s*/g, '√')
    .replace(/\^\{([^{}]*)\}/g, (_all, inner: string) => superscript(inner))
    .replace(/\^\(([^()]*)\)/g, (_all, inner: string) => superscript(inner))
    .replace(/\^(-?[0-9n]+)/g, (_all, inner: string) => superscript(inner))
    .replace(/\{|\}/g, '')
    .trim();
}

function superscript(text: string): string {
  const mapped = [...text].map((c) => SUPERSCRIPT_DIGITS[c]);
  return mapped.every(Boolean) ? mapped.join('') : `^${text}`;
}

/** True when a line is mostly maths rather than prose, so it can be typeset. */
export function looksLikeMath(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/[a-zA-Z]{4,}\s+[a-zA-Z]{4,}/.test(trimmed)) return false;
  return /[=+\-×÷·^√/]|\\frac|\\sqrt|\d/.test(trimmed);
}

const GREEK_WORDS = /\b(alpha|beta|gamma|delta|Delta|theta|lambda|mu|omega|phi|pi)\b/g;

/**
 * A short label for a drawing (SVG text cannot hold the typeset HTML): one line of Unicode, with
 * Greek letters written out as words turned into symbols, so "alpha" and "\alpha" both give α.
 */
export function labelText(input: string): string {
  return mathToPlain(input).replace(GREEK_WORDS, (word) => WORD_SYMBOLS[word] ?? word);
}
