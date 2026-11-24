import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: false });

export function md(text: string): string {
  return marked.parse(text, { async: false }) as string;
}

export function Markdown({ text, inline = false }: { text: string; inline?: boolean }) {
  const html = inline ? (marked.parseInline(text, { async: false }) as string) : md(text);
  return inline ? <span dangerouslySetInnerHTML={{ __html: html }} /> : <div class="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
