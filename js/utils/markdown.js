// ============================================================
// NexusResearch -- Markdown Parser
// Lightweight markdown-to-HTML converter (main-thread fallback)
// Handles: headings, bold, italic, lists, code, tables,
//          blockquotes, horizontal rules, links
// ============================================================

/**
 * Convert a markdown string to an HTML string.
 * Designed for rendering agent output -- not a full CommonMark parser.
 */
export function markdownToHtml(md) {
  if (!md) return '';

  // Normalize line endings
  let text = md.replace(/\r\n?/g, '\n');

  // Fenced code blocks (``` ... ```)
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="lang-${lang || 'text'}">${escapeCode(code.trimEnd())}</code></pre>`;
  });

  // Inline code
  text = text.replace(/`([^`\n]+?)`/g, '<code>$1</code>');

  const lines = text.split('\n');
  const out = [];
  let inList = false;
  let listTag = '';
  let inTable = false;
  let tableRows = [];
  let inBlockquote = false;
  let bqLines = [];

  function flushList() {
    if (inList) {
      out.push(`</${listTag}>`);
      inList = false;
    }
  }

  function flushTable() {
    if (inTable && tableRows.length > 0) {
      let html = '<table>';
      tableRows.forEach((row, i) => {
        const cells = row.split('|').filter(c => c.trim() !== '');
        const tag = i === 0 ? 'th' : 'td';
        const rowTag = i === 0 ? 'thead' : (i === 1 ? 'tbody' : '');
        if (i === 1 && /^[\s\-:|]+$/.test(row)) return; // skip separator
        let rowHtml = '<tr>' + cells.map(c => `<${tag}>${inline(c.trim())}</${tag}>`).join('') + '</tr>';
        if (i === 0) html += `<thead>${rowHtml}</thead><tbody>`;
        else html += rowHtml;
      });
      html += '</tbody></table>';
      out.push(html);
      tableRows = [];
      inTable = false;
    }
  }

  function flushBlockquote() {
    if (inBlockquote) {
      out.push('<blockquote>' + bqLines.map(l => `<p>${inline(l)}</p>`).join('') + '</blockquote>');
      bqLines = [];
      inBlockquote = false;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Pre-formatted blocks pass through
    if (line.startsWith('<pre>') || line.startsWith('</pre>') || line.startsWith('<code')) {
      flushList(); flushTable(); flushBlockquote();
      out.push(line);
      continue;
    }

    // Table rows
    if (line.includes('|') && line.trim().startsWith('|')) {
      flushList(); flushBlockquote();
      inTable = true;
      tableRows.push(line);
      continue;
    } else {
      flushTable();
    }

    // Blockquote
    if (line.startsWith('> ')) {
      flushList(); flushTable();
      inBlockquote = true;
      bqLines.push(line.slice(2));
      continue;
    } else {
      flushBlockquote();
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      out.push(`<h${level}>${inline(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushList();
      out.push('<hr>');
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (!inList || listTag !== 'ul') { flushList(); out.push('<ul>'); inList = true; listTag = 'ul'; }
      out.push(`<li>${inline(ulMatch[2])}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (olMatch) {
      if (!inList || listTag !== 'ol') { flushList(); out.push('<ol>'); inList = true; listTag = 'ol'; }
      out.push(`<li>${inline(olMatch[2])}</li>`);
      continue;
    }

    flushList();

    // Empty line
    if (line.trim() === '') {
      continue;
    }

    // Paragraph
    out.push(`<p>${inline(line)}</p>`);
  }

  flushList();
  flushTable();
  flushBlockquote();

  return out.join('\n');
}

/**
 * Inline formatting: bold, italic, links, images
 */
function inline(text) {
  if (!text) return '';
  // Bold+italic
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');
  // Italic
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/_(.+?)_/g, '<em>$1</em>');
  // Strikethrough
  text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');
  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return text;
}

/**
 * Escape HTML within code blocks
 */
function escapeCode(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
