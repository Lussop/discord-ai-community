import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { musicQueues, assertMusicControl } from '../handlers/music.js';
import { buildMusicController } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('pause')
  .setDescription('Pausar la reproducción de música');

export async function execute(interaction) {
  const controlError = assertMusicControl(interaction);
  if (controlError) {
    return interaction.reply({ content: controlError, flags: MessageFlags.Ephemeral });
  }

  const serverQueue = musicQueues.get(interaction.guildId);
  if (!serverQueue || !serverQueue.currentTrack) {
    return interaction.reply({
      content: '`⚠️` No hay música reproduciéndose actualmente.',
      flags: MessageFlags.Ephemeral
    });
  }

  if (serverQueue.paused) {
    return interaction.reply({
      content: '`⚠️` La música ya se encuentra pausada. Usa `/resume` para continuar.',
      flags: MessageFlags.Ephemeral
    });
  }

  serverQueue.player.pause();
  serverQueue.paused = true;

  return interaction.reply({
    content: '`⏸️` Música pausada correctamente.'
  });
}
