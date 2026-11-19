import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { musicQueues, assertMusicControl } from '../handlers/music.js';

export const data = new SlashCommandBuilder()
  .setName('resume')
  .setDescription('Reanudar la música pausada');

export async function execute(interaction) {
  const controlError = assertMusicControl(interaction);
  if (controlError) {
    return interaction.reply({ content: controlError, flags: MessageFlags.Ephemeral });
  }

  const serverQueue = musicQueues.get(interaction.guildId);
  if (!serverQueue || !serverQueue.currentTrack) {
    return interaction.reply({
      content: '`⚠️` No hay música en cola actualmente.',
      flags: MessageFlags.Ephemeral
    });
  }

  if (!serverQueue.paused) {
    return interaction.reply({
      content: '`⚠️` La música ya se está reproduciendo.',
      flags: MessageFlags.Ephemeral
    });
  }

  serverQueue.player.unpause();
  serverQueue.paused = false;

  return interaction.reply({
    content: '`▶️` Música reanudada.'
  });
}
