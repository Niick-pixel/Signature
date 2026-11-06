/**
 * An allowlist pass over the journal's HTML.
 *
 * Defence in depth rather than the only defence: the editor forces paste to
 * plain text and adds images through the app's own screenshot store, so in
 * normal use the only markup here is what the toolbar produced. This exists
 * because "in normal use" is not a security property, and the body is rendered
 * back with innerHTML.
 *
 * Deliberately a tokeniser rather than a regex soup — there is no DOM on the
 * server, and the failure mode of a clever regex on HTML is silence.
 */

/** Tags that may appear. Anything else is dropped, its text kept. */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'div', 'span', 'hr',
  'strong', 'b', 'em', 'i', 'u', 's', 'mark',
  'h1', 'h2', 'h3',
  'ul', 'ol', 'li',
  'blockquote', 'code', 'pre',
  'a', 'img',
]);

/** Tags whose CONTENT is dropped too, not just the tag. */
const VOID_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template']);

/** Per-tag attribute allowlist. */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title']),
  img: new Set(['src', 'alt']),
};
const GLOBAL_ATTRS = new Set(['style']);

/**
 * Style properties the toolbar can produce. Anything else goes.
 *
 * `position`, `background-image` and friends are absent on purpose: a fixed
 * element or a remote url() inside a journal page is not formatting.
 */
const ALLOWED_STYLE = new Set([
  'font-size', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line',
  'color', 'background-color', 'text-align',
]);

function safeUrl(value: string, kind: 'href' | 'src'): string | null {
  const url = value.trim();
  if (/^https?:\/\//i.test(url)) return kind === 'href' ? url : null;
  // The app's own screenshot store, and nothing else, for images — with an optional thumbnail
  // width (?w=720). An encoded path (%2F) is decoded first, then held to the same characters
  // and kept inside the store (no "..").
  if (kind === 'src') {
    const m = /^\/api\/screenshots\/([^?#]+)(\?w=\d{2,4})?$/.exec(url);
    if (!m) return null;
    let p: string;
    try { p = decodeURIComponent(m[1]); } catch { return null; }
    if (!/^[\w./-]+$/.test(p) || p.split('/').some((seg) => seg === '..' || seg === '')) return null;
    return `/api/screenshots/${p}${m[2] ?? ''}`;
  }
  if (kind === 'href' && url.startsWith('/')) return url;
  return null;
}

function cleanStyle(value: string): string | null {
  const kept = value
    .split(';')
    .map((decl) => decl.trim())
    .filter(Boolean)
    .filter((decl) => {
      const [prop, ...rest] = decl.split(':');
      const v = rest.join(':').trim().toLowerCase();
      if (!prop || !v) return false;
      if (!ALLOWED_STYLE.has(prop.trim().toLowerCase())) return false;
      // No url(), no expression(), no escapes into another property.
      return !/url\s*\(|expression\s*\(|[{}<>]/.test(v);
    });
  return kept.length ? kept.join('; ') : null;
}

function cleanAttrs(tag: string, raw: string): string {
  const out: string[] = [];
  // name="value" | name='value' | name=value | name
  const re = /([a-zA-Z_:][-\w:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    // Every event handler, in one rule.
    if (name.startsWith('on')) continue;
    const permitted = ALLOWED_ATTRS[tag]?.has(name) || GLOBAL_ATTRS.has(name);
    if (!permitted) continue;

    if (name === 'href' || name === 'src') {
      const url = safeUrl(value, name);
      if (!url) continue;
      out.push(`${name}="${url.replace(/"/g, '&quot;')}"`);
      continue;
    }
    if (name === 'style') {
      const style = cleanStyle(value);
      if (!style) continue;
      out.push(`style="${style.replace(/"/g, '&quot;')}"`);
      continue;
    }
    out.push(`${name}="${value.replace(/"/g, '&quot;')}"`);
  }
  return out.length ? ' ' + out.join(' ') : '';
}

export function sanitiseHtml(input: string): string {
  let out = '';
  let i = 0;
  // Tags whose content is being discarded, innermost last.
  const dropping: string[] = [];

  while (i < input.length) {
    const lt = input.indexOf('<', i);
    if (lt === -1) {
      if (dropping.length === 0) out += input.slice(i);
      break;
    }
    if (dropping.length === 0) out += input.slice(i, lt);

    const gt = input.indexOf('>', lt);
    if (gt === -1) break;                       // an unterminated tag: drop it
    const inner = input.slice(lt + 1, gt);
    i = gt + 1;

    // Comments and declarations go entirely.
    if (inner.startsWith('!')) continue;

    const closing = inner.startsWith('/');
    const body = closing ? inner.slice(1) : inner;
    const selfClosing = body.endsWith('/');
    const nameMatch = /^([a-zA-Z][-\w]*)/.exec(selfClosing ? body.slice(0, -1) : body);
    if (!nameMatch) continue;
    const tag = nameMatch[1].toLowerCase();

    if (VOID_CONTENT.has(tag)) {
      if (closing) {
        const at = dropping.lastIndexOf(tag);
        if (at !== -1) dropping.splice(at, 1);
      } else if (!selfClosing) {
        dropping.push(tag);
      }
      continue;
    }
    if (dropping.length > 0) continue;
    if (!ALLOWED_TAGS.has(tag)) continue;       // tag dropped, its text kept

    if (closing) out += `</${tag}>`;
    else {
      const attrs = cleanAttrs(tag, (selfClosing ? body.slice(0, -1) : body).slice(tag.length));
      out += tag === 'br' || tag === 'hr' || tag === 'img'
        ? `<${tag}${attrs} />`
        : `<${tag}${attrs}>`;
    }
  }
  return out;
}

/** The body as readable text, for search and for a snippet. */
export function toPlainText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h1|h2|h3|blockquote|pre)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * A journal page as Markdown, for the Claude export: headings, lists, bold,
 * italics and quotes kept, so a page reads the way it was written instead of
 * as one run of text. Images become a marker — the export is text.
 */
export function toMarkdown(html: string): string {
  let s = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<img[^>]*>/gi, '[image]');
  s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n## $1\n\n');
  s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n### $1\n\n');
  s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n#### $1\n\n');
  s = s.replace(/<(strong|b)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, '**$3**');
  s = s.replace(/<(em|i)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, '*$3*');
  s = s.replace(/<(u|s|strike|del)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, '$3');
  s = s.replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, text: string) => (href && href !== text ? `${text} (${href})` : text));
  s = s.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, inner: string) =>
    `\n\n${inner.replace(/<[^>]*>/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => `> ${l}`).join('\n')}\n\n`);
  // Numbered lists count; bullets are bullets.
  s = s.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_m, inner: string) => {
    let n = 0;
    return `\n${inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_x, li: string) => `${(n += 1)}. ${li.trim()}\n`)}\n`;
  });
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, li: string) => `- ${li.trim()}\n`);
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|ul|ol|pre)>/gi, '\n\n');
  s = s.replace(/<[^>]*>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
