function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return escapeHtml(trimmed);
  }
  return '';
}

// Convertidor offline: descarga imagen y la transforma a Data URI base64
async function fetchAsBase64(url) {
  if (!url || !url.startsWith('https://')) return url || '';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return url;
    const contentType = res.headers.get('content-type') || 'image/png';
    const buffer = await res.arrayBuffer();
    const b64 = Buffer.from(buffer).toString('base64');
    return `data:${contentType};base64,${b64}`;
  } catch {
    return url; // Fallback al link original si falla la descarga
  }
}

// Formateador robusto de Markdown Discord que protege bloques de código
function formatDiscordMarkdown(text, guild, msg) {
  if (!text) return '';

  // 1. Extraer y proteger codeblocks y inline code con placeholders
  const codeBlocks = [];
  let protectedText = text.replace(/```([a-z0-9_-]*)\n?([\s\S]*?)```/gi, (match, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code class="language-${escapeHtml(lang || 'text')}">${escapeHtml(code)}</code></pre>`);
    return `%%CODEBLOCK_${idx}%%`;
  });

  const inlineCodes = [];
  protectedText = protectedText.replace(/`([^`\n]+)`/g, (match, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code class="inline-code">${escapeHtml(code)}</code>`);
    return `%%INLINECODE_${idx}%%`;
  });

  // 2. Escapar HTML del contenido restante
  let str = escapeHtml(protectedText);

  // 3. Menciones de usuarios: comprobar msg.mentions primero, luego caché
  str = str.replace(/&lt;@!?(\d+)&gt;/g, (match, userId) => {
    let name = 'Usuario';
    const resolvedUser = msg?.mentions?.users?.get(userId);
    if (resolvedUser) {
      name = resolvedUser.displayName || resolvedUser.username;
    } else {
      const member = guild?.members?.cache?.get(userId);
      const user = member?.user || guild?.client?.users?.cache?.get(userId);
      name = member?.displayName || user?.username || `Usuario(${userId.substring(0, 4)})`;
    }
    return `<span class="mention user-mention">@${escapeHtml(name)}</span>`;
  });

  // Menciones de roles: comprobar msg.mentions.roles primero
  str = str.replace(/&lt;@&amp;(\d+)&gt;/g, (match, roleId) => {
    let roleName = 'Rol';
    const resolvedRole = msg?.mentions?.roles?.get(roleId);
    if (resolvedRole) {
      roleName = resolvedRole.name;
    } else {
      const role = guild?.roles?.cache?.get(roleId);
      roleName = role ? role.name : 'Rol';
    }
    return `<span class="mention role-mention">@${escapeHtml(roleName)}</span>`;
  });

  // Menciones de canales
  str = str.replace(/&lt;#(\d+)&gt;/g, (match, channelId) => {
    const channel = guild?.channels?.cache?.get(channelId);
    const channelName = channel ? channel.name : 'canal';
    return `<span class="mention channel-mention">#${escapeHtml(channelName)}</span>`;
  });

  // Custom emojis: <:nombre:id> o <a:nombre:id>
  str = str.replace(/&lt;a?:([a-zA-Z0-9_]+):(\d+)&gt;/g, (match, name, id) => {
    const emojiUrl = `https://cdn.discordapp.com/emojis/${id}.webp?size=48&quality=lossless`;
    return `<img src="${emojiUrl}" class="custom-emoji" alt=":${name}:" title=":${name}:" loading="lazy" />`;
  });

  // Timestamps de discord: <t:1729891234:R> o <t:1729891234>
  str = str.replace(/&lt;t:(\d+)(?::([tTdDfFR]))?&gt;/g, (match, ts) => {
    const d = new Date(parseInt(ts, 10) * 1000);
    return `<span class="discord-timestamp" title="${escapeHtml(d.toLocaleString())}">${escapeHtml(d.toLocaleTimeString())}</span>`;
  });

  // Spoilers: ||texto||
  str = str.replace(/\|\|(.*?)\|\|/g, '<span class="spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>');

  // Subrayado: __texto__
  str = str.replace(/__([^_]+)__/g, '<u>$1</u>');

  // Negrita: **texto**
  str = str.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Cursiva segura (evita romper 2 * 3 * 4 al exigir no espacio en bordes)
  str = str.replace(/(?<!\w)\*(\S(?:[\s\S]*?\S)?)\*(?!\w)/g, '<em>$1</em>');
  str = str.replace(/(?<!\w)_(\S(?:[\s\S]*?\S)?)_(?!\w)/g, '<em>$1</em>');

  // Tachado: ~~texto~~
  str = str.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // Citas: > texto
  str = str.replace(/^&gt; (.*$)/gim, '<div class="discord-quote">$1</div>');

  // Encabezados
  str = str.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  str = str.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  str = str.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Links markdown [texto](url)
  str = str.replace(/\[([^\]]+)\]\((https?:\/\/[^\s'")]+)\)/g, (m, label, link) => {
    return `<a href="${sanitizeUrl(link)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  // Saltos de línea a <br>
  str = str.replace(/\n/g, '<br>');

  // 4. Reinsertar los bloques de código protegidos
  str = str.replace(/%%CODEBLOCK_(\d+)%%/g, (_, idx) => codeBlocks[Number(idx)] || '');
  str = str.replace(/%%INLINECODE_(\d+)%%/g, (_, idx) => inlineCodes[Number(idx)] || '');

  return str;
}

// Extrae componentes V2 recursivamente
function extractComponentsV2(components, guild, msg) {
  if (!components || !components.length) return '';
  const rendered = [];

  for (const comp of components) {
    const type = comp.type || comp.data?.type;

    // TextDisplay (Type 10)
    if (type === 10 || comp.type === 'TextDisplay') {
      const content = comp.content || comp.data?.content;
      if (content) {
        rendered.push(`<div class="v2-text">${formatDiscordMarkdown(content, guild, msg)}</div>`);
      }
    }

    // Botones interactivos (ActionRow)
    if (comp.components && Array.isArray(comp.components)) {
      const buttonHtmls = [];
      for (const sub of comp.components) {
        if (sub.type === 2 || sub.data?.type === 2) {
          const label = escapeHtml(sub.label || sub.data?.label || 'Botón');
          const emoji = sub.emoji?.name || sub.data?.emoji?.name || '';
          buttonHtmls.push(`<span class="v2-btn-badge">${emoji ? emoji + ' ' : ''}${label}</span>`);
        }
      }
      if (buttonHtmls.length > 0) {
        rendered.push(`<div class="v2-buttons-row">${buttonHtmls.join(' ')}</div>`);
      }
    }

    // Contenedores anidados
    if (comp.components && Array.isArray(comp.components)) {
      const inner = extractComponentsV2(comp.components, guild, msg);
      if (inner) rendered.push(inner);
    }
  }

  return rendered.join('');
}

const TRANSCRIPT_CSS = `
  :root {
    --bg: #090a0b;
    --surface: #111215;
    --surface-elevated: #16181c;
    --border: #22242a;
    --border-subtle: #191b20;
    --text: #f4f4f6;
    --text-muted: #848894;
    --text-dim: #5c606c;
    --accent: #ffffff;
    --code-bg: #0c0d10;
    --shadow: 0 20px 40px rgba(0, 0, 0, 0.7);
    --font-main: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    --font-mono: Consolas, Monaco, "Courier New", monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background-color: var(--bg);
    color: var(--text);
    font-family: var(--font-main);
    padding: 30px 16px;
    line-height: 1.5;
    display: flex;
    justify-content: center;
    -webkit-font-smoothing: antialiased;
  }
  .wrapper {
    width: 100%;
    max-width: 980px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: var(--shadow);
    overflow: hidden;
  }
  .hero-header {
    padding: 30px 32px 24px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0) 100%);
    border-bottom: 1px solid var(--border);
  }
  .top-badge-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 14px;
  }
  .category-pill {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 4px 10px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--accent);
    border: 1px solid rgba(255, 255, 255, 0.15);
  }
  .ticket-title {
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #ffffff;
    margin-bottom: 16px;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    background: var(--surface-elevated);
    padding: 14px 18px;
    border-radius: 10px;
    border: 1px solid var(--border-subtle);
  }
  .meta-item { display: flex; flex-direction: column; gap: 3px; }
  .meta-label { font-size: 11px; text-transform: uppercase; color: var(--text-dim); font-weight: 700; }
  .meta-value { font-size: 13px; font-weight: 600; color: var(--text); }
  .staff-note-box {
    margin-top: 16px;
    padding: 14px 18px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px dashed var(--border);
    border-radius: 8px;
  }
  .staff-note-header { font-size: 12px; font-weight: 700; color: #fff; margin-bottom: 6px; }
  .staff-note-content { font-size: 13px; color: var(--text-muted); font-style: italic; }
  .chat-container { padding: 24px 32px; display: flex; flex-direction: column; gap: 14px; }
  .date-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 16px 0 8px;
  }
  .date-divider::before, .date-divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }
  .date-label { font-size: 11px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.06em; }
  .message-card {
    display: flex;
    gap: 14px;
    padding: 10px 14px;
    border-radius: 8px;
    background: transparent;
    transition: background 0.15s ease;
  }
  .message-card:hover { background: rgba(255, 255, 255, 0.015); }
  .avatar {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: #1e2025;
    flex-shrink: 0;
    object-fit: cover;
  }
  .message-body { flex: 1; min-width: 0; }
  .msg-meta { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
  .author-name { font-size: 14px; font-weight: 700; color: #ffffff; }
  .bot-badge {
    background: #ffffff;
    color: #000000;
    font-size: 9px;
    font-weight: 800;
    padding: 1px 5px;
    border-radius: 4px;
  }
  .msg-time { font-size: 11px; color: var(--text-dim); }
  .msg-text { font-size: 14px; color: #e2e4ea; word-break: break-word; }
  pre {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px 14px;
    margin: 8px 0;
    overflow-x: auto;
    font-family: var(--font-mono);
    font-size: 13px;
    color: #f1f1f1;
  }
  code.inline-code {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 2px 6px;
    font-family: var(--font-mono);
    font-size: 12px;
    color: #ffffff;
  }
  .mention { padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 13px; }
  .user-mention { background: rgba(88, 101, 242, 0.2); color: #cdd2fb; }
  .role-mention { background: rgba(255, 255, 255, 0.12); color: #ffffff; }
  .channel-mention { background: rgba(255, 255, 255, 0.08); color: #bbb; }
  .custom-emoji { width: 22px; height: 22px; vertical-align: middle; margin: -2px 2px 0; }
  .discord-quote { border-left: 3px solid #444; padding-left: 10px; margin: 4px 0; color: #aaa; }
  .spoiler { background: #2b2d31; color: transparent; border-radius: 3px; padding: 1px 4px; cursor: pointer; user-select: none; }
  .spoiler.revealed { background: rgba(255,255,255,0.08); color: inherit; }
  .discord-embed {
    margin-top: 10px;
    background: var(--surface-elevated);
    border-left: 4px solid var(--accent);
    border-radius: 4px;
    padding: 12px 16px;
    max-width: 580px;
  }
  .embed-title { font-weight: 700; font-size: 14px; color: #fff; margin-bottom: 6px; }
  .embed-desc { font-size: 13px; color: var(--text-muted); }
  .embed-media { max-width: 100%; border-radius: 6px; margin-top: 10px; border: 1px solid var(--border); }
  .embed-thumb { float: right; max-width: 80px; max-height: 80px; border-radius: 6px; margin-left: 12px; }
  .v2-card {
    margin-top: 8px;
    padding: 12px 16px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .v2-btn-badge {
    display: inline-block;
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    margin-right: 6px;
    margin-top: 8px;
    border: 1px solid var(--border);
  }
  .attachments { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
  .attachment-img { max-width: 440px; max-height: 320px; border-radius: 6px; border: 1px solid var(--border); }
  .attachment-file a { color: var(--accent); text-decoration: none; font-size: 13px; }
  .attachment-file a:hover { text-decoration: underline; }
`;

export async function generateTranscriptHtml({ threadName, ticketType, creator, closedBy, closeNote, messages, guild }) {
  const dateFormatted = new Date().toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'full',
    timeStyle: 'medium'
  });

  // Pre-descargar avatares y adjuntos en Base64 para que nunca expiren
  const avatarCache = new Map();
  for (const msg of messages) {
    if (!avatarCache.has(msg.author.id)) {
      const avatarUrl = msg.author.displayAvatarURL({ extension: 'png', size: 128 });
      const b64 = await fetchAsBase64(avatarUrl);
      avatarCache.set(msg.author.id, b64);
    }
  }

  let lastDateHeader = '';
  const renderedMessages = [];

  for (const msg of messages) {
    const msgDate = new Date(msg.createdTimestamp);
    const dateKey = msgDate.toLocaleDateString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      dateStyle: 'medium'
    });

    // Separador por día
    if (dateKey !== lastDateHeader) {
      lastDateHeader = dateKey;
      renderedMessages.push(`
        <div class="date-divider">
          <span class="date-label">${escapeHtml(dateKey)}</span>
        </div>
      `);
    }

    const avatar = avatarCache.get(msg.author.id) || msg.author.displayAvatarURL({ extension: 'png', size: 128 });
    const isBot = msg.author.bot ? '<span class="bot-badge">BOT</span>' : '';
    const time = msgDate.toLocaleTimeString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Embeds
    let embedsHtml = '';
    if (msg.embeds && msg.embeds.length > 0) {
      embedsHtml = msg.embeds.map(embed => {
        const title = embed.title ? `<div class="embed-title">${formatDiscordMarkdown(embed.title, guild, msg)}</div>` : '';
        const desc = embed.description ? `<div class="embed-desc">${formatDiscordMarkdown(embed.description, guild, msg)}</div>` : '';
        const embedColor = embed.hexColor ? embed.hexColor : '#ffffff';

        const embedImg = embed.image?.url
          ? `<a href="${sanitizeUrl(embed.image.url)}" target="_blank" rel="noopener"><img src="${sanitizeUrl(embed.image.url)}" class="embed-media" alt="media" loading="lazy" /></a>`
          : '';

        const embedThumb = embed.thumbnail?.url
          ? `<img src="${sanitizeUrl(embed.thumbnail.url)}" class="embed-thumb" alt="thumbnail" loading="lazy" />`
          : '';

        const footer = embed.footer?.text ? `<div class="msg-time" style="margin-top: 8px;">${escapeHtml(embed.footer.text)}</div>` : '';

        return `
          <div class="discord-embed" style="border-left-color: ${embedColor}">
            ${embedThumb}
            <div class="embed-inner">
              ${title}
              ${desc}
              ${embedImg}
              ${footer}
            </div>
          </div>
        `;
      }).join('');
    }

    // Components V2
    let v2ContentHtml = '';
    if (msg.flags?.has(32768) || msg.components?.length > 0) {
      const v2Text = extractComponentsV2(msg.components, guild, msg);
      if (v2Text) {
        v2ContentHtml = `<div class="v2-card">${v2Text}</div>`;
      }
    }

    // Adjuntos (imágenes descargadas o convertidas a base64)
    let attachmentsHtml = '';
    if (msg.attachments && msg.attachments.size > 0) {
      const attList = [];
      for (const att of msg.attachments.values()) {
        const safeAttUrl = sanitizeUrl(att.url);
        if (att.contentType?.startsWith('image/')) {
          const b64Img = await fetchAsBase64(att.url);
          attList.push(`<a href="${safeAttUrl}" target="_blank" rel="noopener"><img src="${b64Img}" class="attachment-img" alt="adjunto" loading="lazy" /></a>`);
        } else {
          attList.push(`<div class="attachment-file"><a href="${safeAttUrl}" target="_blank" rel="noopener">📎 <span>${escapeHtml(att.name)}</span></a></div>`);
        }
      }
      attachmentsHtml = `<div class="attachments">${attList.join('')}</div>`;
    }

    const bodyContent = msg.content ? formatDiscordMarkdown(msg.content, guild, msg) : '';
    if (!bodyContent && !embedsHtml && !v2ContentHtml && !attachmentsHtml) continue;

    renderedMessages.push(`
      <div class="message-card">
        <img class="avatar" src="${avatar}" alt="${escapeHtml(msg.author.username)}" />
        <div class="message-body">
          <div class="msg-meta">
            <span class="author-name">${escapeHtml(msg.author.username)}</span>
            ${isBot}
            <span class="msg-time">${time}</span>
          </div>
          ${bodyContent ? `<div class="msg-text">${bodyContent}</div>` : ''}
          ${v2ContentHtml}
          ${embedsHtml}
          ${attachmentsHtml}
        </div>
      </div>
    `);
  }

  const staffNoteHtml = closeNote ? `
    <div class="staff-note-box">
      <div class="staff-note-header">📝 Nota Oficial de Cierre</div>
      <div class="staff-note-content">${escapeHtml(closeNote)}</div>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Transcripción • ${escapeHtml(threadName)}</title>
  <style>${TRANSCRIPT_CSS}</style>
</head>
<body>
  <div class="wrapper">
    <div class="hero-header">
      <div class="top-badge-row">
        <span class="category-pill">${escapeHtml(ticketType)}</span>
      </div>
      <h1 class="ticket-title">${escapeHtml(threadName)}</h1>
      <div class="meta-grid">
        <div class="meta-item">
          <span class="meta-label">Solicitante</span>
          <span class="meta-value">${escapeHtml(creator)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Cerrado por</span>
          <span class="meta-value">${escapeHtml(closedBy)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Fecha y Hora</span>
          <span class="meta-value">${escapeHtml(dateFormatted)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Mensajes Registrados</span>
          <span class="meta-value">${messages.length}</span>
        </div>
      </div>
      ${staffNoteHtml}
    </div>
    <div class="chat-container">
      ${renderedMessages.join('')}
    </div>
  </div>
</body>
</html>`;
}
