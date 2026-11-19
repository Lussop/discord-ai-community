import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createMonochromeEmbed } from '../utils/embeds.js';
import { config } from '../config.js';

export const data = new SlashCommandBuilder()
  .setName('banear')
  .setDescription('Banear a un usuario del servidor')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption(opt =>
    opt.setName('usuario')
      .setDescription('Usuario a banear')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('motivo')
      .setDescription('Motivo de la expulsión definitiva')
      .setRequired(false)
  )
  .addIntegerOption(opt =>
    opt.setName('borrar_mensajes')
      .setDescription('Días de mensajes a borrar (0 a 7)')
      .setRequired(false)
      .setMinValue(0)
      .setMaxValue(7)
  );

export async function execute(interaction) {
  const member = interaction.member;
  const hasStaffRole = member.roles.cache.has(config.staffRoleId);
  const hasBanPerm = member.permissions.has(PermissionFlagsBits.BanMembers);

  if (!hasStaffRole && !hasBanPerm) {
    return interaction.reply({
      content: '`🚫` No tienes permisos para usar este comando de moderación.',
      ephemeral: true
    });
  }

  const targetUser = interaction.options.getUser('usuario');
  const reason = interaction.options.getString('motivo') || 'Infracción de normas';
  const deleteDays = interaction.options.getInteger('borrar_mensajes') || 0;
  const deleteMessageSeconds = deleteDays * 24 * 60 * 60;

  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (targetMember && !targetMember.bannable) {
    return interaction.reply({
      content: '`❌` No puedo banear a este usuario por jerarquía de roles.',
      ephemeral: true
    });
  }

  await interaction.guild.bans.create(targetUser.id, {
    reason: `[Moderador: ${interaction.user.tag}] ${reason}`,
    deleteMessageSeconds
  });

  const publicNotification = `${interaction.user} baneó permanentemente a ${targetUser} por el motivo: **${reason}**`;

  const logEmbed = createMonochromeEmbed({
    title: '`🔨` Sanción • Baneo',
    description: publicNotification,
    fields: [
      { name: '`👤` Usuario', value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
      { name: '`👮` Moderador', value: `${interaction.user.tag} (\`${interaction.user.id}\`)`, inline: true },
      { name: '`🗑️` Mensajes eliminados', value: `\`${deleteDays} días\``, inline: true }
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
