import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { buildCleanDmContainer } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('limpiar')
  .setDescription('Envía el panel interactivo para limpiar mensajes privados del bot (Solo Dueño/Admin)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  // Solo el dueño del servidor puede ejecutar este comando
  if (interaction.user.id !== interaction.guild.ownerId) {
    return interaction.reply({
      content: '`🚫` Solo el dueño del servidor puede desplegar este comando.',
      flags: MessageFlags.Ephemeral
    });
  }

  const container = buildCleanDmContainer();

  return interaction.reply({
    flags: MessageFlags.IsComponentsV2,
    components: [container]
  });
}

export async function handleCleanDmButton(interaction) {
  if (interaction.customId !== 'util:clean_dm') return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const dmChannel = interaction.user.dmChannel || await interaction.user.createDM();
    const fetchedMessages = await dmChannel.messages.fetch({ limit: 100 });
    const botMessages = fetchedMessages.filter(m => m.author.id === interaction.client.user.id);

    let deletedCount = 0;
    for (const [, msg] of botMessages) {
      await msg.delete().catch(() => {});
      deletedCount++;
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Ir al chat')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/channels/@me/${dmChannel.id}`)
        .setEmoji('💬')
    );

    return interaction.editReply({
      content: `\`✅\` Se eliminaron exitosamente **${deletedCount}** mensajes del bot en tus mensajes directos.`,
      components: [row]
    });
  } catch (error) {
    console.error('Error al limpiar DM:', error);
    return interaction.editReply({
      content: '`❌` No se pudieron limpiar los mensajes directos (comprueba si tienes tus DMs habilitados).'
    });
  }
}
