import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { forgetUser } from '../utils/aiMemory.js';

export const data = new SlashCommandBuilder()
  .setName('olvidame')
  .setDescription('Elimina todos tus datos, notas y recuerdos registrados por la IA de Hassbulla');

export async function execute(interaction) {
  const deleted = forgetUser(interaction.user.id);
  if (deleted) {
    return interaction.reply({
      content: '`🗑️` **Memoria borrada:** Hasbulla ha olvidado todas tus notas, interacciones y datos personales.',
      flags: MessageFlags.Ephemeral
    });
  } else {
    return interaction.reply({
      content: '`ℹ️` No había ninguna información ni memoria registrada sobre ti.',
      flags: MessageFlags.Ephemeral
    });
  }
}
