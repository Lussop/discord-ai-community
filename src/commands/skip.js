import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { musicQueues, playNextTrack } from '../handlers/music.js';

export const data = new SlashCommandBuilder()
  .setName('skip')
  .setDescription('Saltar la canción actual y reproducir la siguiente');

export async function execute(interaction) {
  const memberVoiceChannel = interaction.member.voice.channel;
  if (!memberVoiceChannel) {
    return interaction.reply({
      content: '`🚫` Debes estar en un canal de voz para saltar la canción.',
      flags: MessageFlags.Ephemeral
    });
  }

  const serverQueue = musicQueues.get(interaction.guildId);
  if (!serverQueue || !serverQueue.currentTrack) {
    return interaction.reply({
      content: '`⚠️` No se está reproduciendo ninguna canción en este momento.',
      flags: MessageFlags.Ephemeral
    });
  }

  const skippedTitle = serverQueue.currentTrack.title;
  serverQueue.player.stop(); // Esto dispara automáticamente AudioPlayerStatus.Idle -> playNextTrack

  return interaction.reply({
    content: `\`⏭️\` Canción saltada: **${skippedTitle}**`
  });
}
