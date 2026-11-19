import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createMonochromeEmbed } from '../utils/embeds.js';
import { config } from '../config.js';

const parseDurationToMs = (str) => {
  if (!str) return 7 * 24 * 60 * 60 * 1000;
  const match = str.match(/^(\d+)([mhd])$/i);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit === 'm') return num * 60 * 1000;
  if (unit === 'h') return num * 60 * 60 * 1000;
  if (unit === 'd') return num * 24 * 60 * 60 * 1000;
  return 7 * 24 * 60 * 60 * 1000;
};

const formatDurationLabel = (str) => {
  if (!str) return '7 días';
  const match = str.match(/^(\d+)([mhd])$/i);
  if (!match) return str;
  const num = match[1];
  const unit = match[2].toLowerCase();
  if (unit === 'm') return `${num} minutos`;
  if (unit === 'h') return `${num} horas`;
  if (unit === 'd') return `${num} días`;
  return str;
};

export const data = new SlashCommandBuilder()
  .setName('aislar')
  .setDescription('Aislar (timeout) a un usuario')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption(opt =>
    opt.setName('usuario')
      .setDescription('Usuario a aislar')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('duracion')
      .setDescription('Duración del aislamiento (ej. 7d, 1d, 12h, 60m). Por defecto: 7d')
      .setRequired(false)
      .addChoices(
        { name: '1 hora', value: '1h' },
        { name: '1 día', value: '1d' },
        { name: '3 días', value: '3d' },
        { name: '7 días', value: '7d' },
        { name: '14 días', value: '14d' },
        { name: '28 días', value: '28d' }
      )
  )
  .addStringOption(opt =>
    opt.setName('motivo')
      .setDescription('Motivo de la sanción')
      .setRequired(false)
  );

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

  const targetUser = interaction.options.getUser('usuario');
  const duracionStr = interaction.options.getString('duracion') || '7d';
  const reason = interaction.options.getString('motivo') || 'No especificado';
  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

  if (!targetMember) {
    return interaction.reply({
      content: '`❌` No se encontró al usuario en este servidor.',
      ephemeral: true
    });
  }

  if (!targetMember.moderatable) {
    return interaction.reply({
      content: '`❌` No tengo permisos jerárquicos para aislar a este usuario.',
      ephemeral: true
    });
  }

  const durationMs = parseDurationToMs(duracionStr);
  const readableDuration = formatDurationLabel(duracionStr);
  await targetMember.timeout(durationMs, `[Moderador: ${interaction.user.tag}] ${reason}`);

  const publicNotification = `${interaction.user} aisló **${readableDuration}** a ${targetUser} por el motivo: **${reason}**`;

  const logEmbed = createMonochromeEmbed({
    title: '`🛡️` Sanción • Aislamiento',
    description: publicNotification,
    fields: [
      { name: '`👤` Usuario', value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
      { name: '`👮` Moderador', value: `${interaction.user.tag} (\`${interaction.user.id}\`)`, inline: true },
      { name: '`⏱️` Duración', value: `\`${readableDuration}\``, inline: true }
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
