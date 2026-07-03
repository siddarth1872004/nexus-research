// ============================================================
// NexusResearch -- Markdown Worker
// Off-thread markdown-to-HTML conversion
// ============================================================

/**
 * Web Worker for markdown parsing.
 * Receives: { id, markdown }
 * Posts:    { id, html }
 */

// Inline the markdown parser since workers can't import ES modules easily

function markdownToHtml(md) {
  if (!md) return '';
  let text = md.replace(/\r\n?/g, '\n');

  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="lang-${lang || 'text'}">${escapeCode(code.trimEnd())}</code></pre>`;
  });

  text = text.replace(/`([^`\n]+?)`/g, '<code>$1</code>');

  const lines = text.split('\n');
  const out = [];
  let inList = false;
  let listTag = '';
  let inTable = false;
  let tableRows = [];

  function flushList() {
    if (inList) { out.push(`</${listTag}>`); inList = false; }
  }

  function flushTable() {
    if (inTable && tableRows.length > 0) {
      let html = '<table>';
      tableRows.forEach((row, i) => {
        const cells = row.split('|').filter(c => c.trim() !== '');
        const tag = i === 0 ? 'th' : 'td';
        if (i === 1 && /^[\s\-:|]+$/.test(row)) return;
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('<pre>') || line.startsWith('</pre>')) {
      flushList(); flushTable(); out.push(line); continue;
    }

    if (line.includes('|') && line.trim().startsWith('|')) {
      flushList(); inTable = true; tableRows.push(line); continue;
    } else { flushTable(); }

    const hm = line.match(/^(#{1,6})\s+(.+)$/);
    if (hm) { flushList(); out.push(`<h${hm[1].length}>${inline(hm[2])}</h${hm[1].length}>`); continue; }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { flushList(); out.push('<hr>'); continue; }

    const ulm = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (ulm) {
      if (!inList || listTag !== 'ul') { flushList(); out.push('<ul>'); inList = true; listTag = 'ul'; }
      out.push(`<li>${inline(ulm[2])}</li>`); continue;
    }

    const olm = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (olm) {
      if (!inList || listTag !== 'ol') { flushList(); out.push('<ol>'); inList = true; listTag = 'ol'; }
      out.push(`<li>${inline(olm[2])}</li>`); continue;
    }

    flushList();
    if (line.trim() === '') continue;

    if (line.startsWith('> ')) {
      out.push(`<blockquote><p>${inline(line.slice(2))}</p></blockquote>`);
      continue;
    }

    out.push(`<p>${inline(line)}</p>`);
  }

  flushList();
  flushTable();
  return out.join('\n');
}

function inline(text) {
  if (!text) return '';
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/_(.+?)_/g, '<em>$1</em>');
  text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return text;
}

function escapeCode(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Cache
const cache = new Map();

self.onmessage = function(e) {
  const { id, markdown } = e.data;
  let html = cache.get(markdown);
  if (!html) {
    html = markdownToHtml(markdown);
    cache.set(markdown, html);
    // Limit cache size
    if (cache.size > 100) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
  }
  self.postMessage({ id, html });
};
