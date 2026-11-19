import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { musicQueues, assertMusicControl } from '../handlers/music.js';
import { createMonochromeEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('queue')
  .setDescription('Muestra la lista de canciones en cola');

export async function execute(interaction) {
  const serverQueue = musicQueues.get(interaction.guildId);

  if (!serverQueue || (!serverQueue.currentTrack && serverQueue.queue.length === 0)) {
    return interaction.reply({
      content: '`📭` La cola de reproducción está vacía.',
      flags: MessageFlags.Ephemeral
    });
  }

  const current = serverQueue.currentTrack
    ? `**Reproduciendo:** [${serverQueue.currentTrack.title}](${serverQueue.currentTrack.url}) (\`${serverQueue.currentTrack.duration || 'Desconocida'}\`)\n\n`
    : '';

  const queueList = serverQueue.queue.slice(0, 10).map((t, i) =>
    `**${i + 1}.** [${t.title}](${t.url}) - \`${t.duration || 'Desconocida'}\``
  ).join('\n');

  const extraCount = serverQueue.queue.length > 10
    ? `\n\n*... y ${serverQueue.queue.length - 10} canciones más.*`
    : '';

  const embed = createMonochromeEmbed({
    title: '`📀` Cola de Reproducción',
    description: `${current}### **Próximas en Cola:**\n${queueList || '*No hay canciones pendientes*'}${extraCount}`,
    fields: [
      { name: '`🔊` Volumen', value: `\`${serverQueue.volume}%\``, inline: true },
      { name: '`📋` Total en lista', value: `\`${serverQueue.queue.length} temas\``, inline: true }
    ],
    footerText: 'Hassbulla Music'
  });

  return interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral
  });
}
