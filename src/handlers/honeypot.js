import { createMonochromeEmbed } from '../utils/embeds.js';
import { config } from '../config.js';

export async function handleHoneypot(message) {
  if (message.author.bot) return;
  if (message.channelId !== config.honeypotChannelId) return;

  const user = message.author;
  const member = message.member;
  const content = message.content || '(adjunto o embed sin texto)';

  // 1. Borrar de inmediato el mensaje detonante
  await message.delete().catch(() => { });

  if (!member) return;

  // 2. Aislar (timeout) al usuario por 7 días (1 semana)
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  let isolated = false;
  if (member.moderatable) {
    try {
      await member.timeout(oneWeekMs, '[Honeypot Trigger] Posible cuenta comprometida / spam');
      isolated = true;
    } catch (e) {
      console.error('Failed to timeout member:', e);
    }
  }

  // 3. Purgar mensajes de spam recientes enviados por este usuario en otros canales de texto
  let deletedCount = 0;
  try {
    const textChannels = message.guild.channels.cache.filter(c => c.isTextBased() && c.id !== config.honeypotChannelId);
    for (const [, ch] of textChannels) {
      try {
        const fetched = await ch.messages.fetch({ limit: 30 });
        const userMsgs = fetched.filter(m => m.author.id === user.id);
        if (userMsgs.size > 0) {
          await ch.bulkDelete(userMsgs, true).catch(() => { });
          deletedCount += userMsgs.size;
        }
      } catch (err) {
        // Ignorar fallas de permisos individuales en canales cerrados
      }
    }
  } catch (err) {
    console.error('Error purging user spam messages:', err);
  }

  // 4. Log al canal de moderación con embed blanco y negro
  const logEmbed = createMonochromeEmbed({
    title: '`🍯` Trampa Honeypot Activada',
    description: `El bot aisló **7 Días** a ${user} por el motivo: **Cuenta comprometida / Detección trampa honeypot**.\nSe limpiaron automáticamente los mensajes de spam recientes.`,
    fields: [
      { name: '`👤` Usuario Involucrado', value: `${user.tag} (\`${user.id}\`)`, inline: true },
      { name: '`⚡` Estado Timeout', value: isolated ? '`Aislado (7 días)`' : '`Error de Jerarquía`', inline: true },
      { name: '`🧹` Mensajes de Spam Purgados', value: `\`${deletedCount} mensajes\``, inline: true },
      { name: '`📝` Contenido en Honeypot', value: `\`\`\`\n${content.slice(0, 500)}\n\`\`\``, inline: false }
    ],
    footerText: 'Hassbulla Bot • Sistema de Autodefensa'
  });

  const modChannel = message.guild.channels.cache.get(config.modLogsChannelId);
  if (modChannel) {
    await modChannel.send({ embeds: [logEmbed] }).catch(console.error);
  }
}
