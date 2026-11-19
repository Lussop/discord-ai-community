import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createMonochromeEmbed } from '../utils/embeds.js';
import { config } from '../config.js';

export const data = new SlashCommandBuilder()
  .setName('sacar-aislamiento')
  .setDescription('Quitar el aislamiento (timeout) a un usuario')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addStringOption(opt =>
    opt.setName('usuario')
      .setDescription('Selecciona o busca un usuario actualmente aislado')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption(opt =>
    opt.setName('motivo')
      .setDescription('Motivo para remover el aislamiento')
      .setRequired(false)
  );

export async function autocomplete(interaction) {
  const focusedValue = interaction.options.getFocused().toLowerCase();
  
  try {
    const members = await interaction.guild.members.fetch({ limit: 100 });
    const isolatedMembers = members.filter(m => m.isCommunicationDisabled());

    const filtered = isolatedMembers.filter(m => {
      const tag = m.user.tag.toLowerCase();
      const id = m.user.id;
      return tag.includes(focusedValue) || id.includes(focusedValue);
    });

    const choices = filtered.first(25).map(m => ({
      name: `${m.user.tag} (${m.user.id})`,
      value: m.user.id
    }));

    await interaction.respond(choices);
  } catch (err) {
    console.error('Error in sacar-aislamiento autocomplete:', err);
    await interaction.respond([]);
  }
}

export async function execute(interaction) {
  const member = interaction.member;
  const hasStaffRole = member.roles.cache.has(config.staffRoleId);
  const hasModPerm = member.permissions.has(PermissionFlagsBits.ModerateMembers);

  if (!hasStaffRole && !hasModPerm) {
    return interaction.reply({
      content: '`🚫` No tienes permisos para usar este comando de moderación.',
      ephemeral: true
    });
  }

  const targetUserId = interaction.options.getString('usuario');
  const reason = interaction.options.getString('motivo') || 'Aislamiento removido por moderación';

  let targetMember = interaction.guild.members.cache.get(targetUserId);
  if (!targetMember) {
    targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
  }

  if (!targetMember) {
    return interaction.reply({
      content: '`❌` No se encontró el usuario en el servidor.',
      ephemeral: true
    });
  }

  if (!targetMember.isCommunicationDisabled()) {
    return interaction.reply({
      content: '`⚠️` Este usuario no se encuentra aislado.',
      ephemeral: true
    });
  }

  await targetMember.timeout(null, `[Moderador: ${interaction.user.tag}] ${reason}`);

  const publicNotification = `${interaction.user} retiró el aislamiento a ${targetMember.user} por el motivo: **${reason}**`;

  const logEmbed = createMonochromeEmbed({
    title: '`🛡️` Sanción • Aislamiento Removido',
    description: publicNotification,
    fields: [
      { name: '`👤` Usuario', value: `${targetMember.user.tag} (\`${targetMember.user.id}\`)`, inline: true },
      { name: '`👮` Moderador', value: `${interaction.user.tag} (\`${interaction.user.id}\`)`, inline: true }
    ],
    footerText: 'Hassbulla Bot • Logs de Moderación'
  });

  const modChannel = interaction.guild.channels.cache.get(config.modLogsChannelId);
  if (modChannel) {
    await modChannel.send({ embeds: [logEmbed] }).catch(console.error);
  }

  return interaction.reply({
    content: publicNotification,
    embeds: [logEmbed],
    ephemeral: false
  });
}
