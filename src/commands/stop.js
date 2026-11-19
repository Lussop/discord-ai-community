import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { musicQueues, playNextTrack } from '../handlers/music.js';
import { createMonochromeEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Detener la música, vaciar la cola y desconectar al bot');

export async function execute(interaction) {
  const memberVoiceChannel = interaction.member.voice.channel;
  if (!memberVoiceChannel) {
    return interaction.reply({
      content: '`🚫` Debes estar en un canal de voz para detener la música.',
      flags: MessageFlags.Ephemeral
    });
  }

  const serverQueue = musicQueues.get(interaction.guildId);
  if (!serverQueue) {
    return interaction.reply({
      content: '`⚠️` No hay ninguna reproducción activa en este servidor.',
      flags: MessageFlags.Ephemeral
    });
  }

  serverQueue.queue = [];
  serverQueue.player.stop();
  serverQueue.connection.destroy();
  musicQueues.delete(interaction.guildId);

  const embed = createMonochromeEmbed({
    title: '`⏹️` Reproducción Detenida',
    description: `La música ha sido detenida por ${interaction.user} y la cola fue vaciada.`,
    footerText: 'Hassbulla Music'
  });

  return interaction.reply({ embeds: [embed] });
}
