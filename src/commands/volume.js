import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { musicQueues, assertMusicControl } from '../handlers/music.js';

export const data = new SlashCommandBuilder()
  .setName('volume')
  .setDescription('Ajustar el volumen de reproducción de la música (0 a 100%)')
  .addIntegerOption(opt =>
    opt.setName('nivel')
      .setDescription('Nivel de volumen (0 a 100)')
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(100)
  );

export async function execute(interaction) {
  const controlError = assertMusicControl(interaction);
  if (controlError) {
    return interaction.reply({ content: controlError, flags: MessageFlags.Ephemeral });
  }

  const serverQueue = musicQueues.get(interaction.guildId);
  if (!serverQueue) {
    return interaction.reply({
      content: '`⚠️` No hay ninguna reproducción activa.',
      flags: MessageFlags.Ephemeral
    });
  }

  const newVol = interaction.options.getInteger('nivel');
  serverQueue.volume = newVol;

  if (serverQueue.player.state?.resource?.volume) {
    serverQueue.player.state.resource.volume.setVolume(newVol / 100);
  }

  return interaction.reply({
    content: `\`🔊\` Volumen ajustado al: **${newVol}%**`
  });
}
