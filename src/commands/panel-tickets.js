import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { buildTicketsPanelContainer } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('panel-tickets')
  .setDescription('Desplegar el panel de apertura de tickets privados (Solo Dueño/Admin)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  // Solo el dueño del servidor puede desplegar el panel
  if (interaction.user.id !== interaction.guild.ownerId) {
    return interaction.reply({
      content: '`🚫` Solo el dueño del servidor puede ejecutar este comando.',
      flags: MessageFlags.Ephemeral
    });
  }

  const container = buildTicketsPanelContainer();

  await interaction.reply({
    content: '`✅` Panel de tickets Components V2 desplegado correctamente.',
    flags: MessageFlags.Ephemeral
  });

  return interaction.channel.send({
    flags: MessageFlags.IsComponentsV2,
    components: [container]
  });
}
