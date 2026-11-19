import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createMonochromeEmbed } from '../utils/embeds.js';
import { config } from '../config.js';

export const data = new SlashCommandBuilder()
  .setName('unbanear')
  .setDescription('Desbanear a un usuario del servidor')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addStringOption(opt =>
    opt.setName('usuario')
      .setDescription('Selecciona o busca el usuario en la lista de baneados')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption(opt =>
    opt.setName('motivo')
      .setDescription('Motivo del desbaneo')
      .setRequired(false)
  );

export async function autocomplete(interaction) {
  const focusedValue = interaction.options.getFocused().toLowerCase();

  try {
    const bans = await interaction.guild.bans.fetch({ limit: 100 });
    const filtered = bans.filter(ban => {
      const tag = ban.user.tag.toLowerCase();
      const id = ban.user.id;
      return tag.includes(focusedValue) || id.includes(focusedValue);
    });

    const choices = filtered.first(25).map(ban => ({
      name: `${ban.user.tag} (${ban.user.id})${ban.reason ? ' - ' + ban.reason.slice(0, 30) : ''}`,
      value: ban.user.id
    }));

    await interaction.respond(choices);
  } catch (err) {
    console.error('Error fetching bans in autocomplete:', err);
    await interaction.respond([]);
  }
}

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

  const userId = interaction.options.getString('usuario');
  const reason = interaction.options.getString('motivo') || 'Desbaneo manual por moderación';

  try {
    const banInfo = await interaction.guild.bans.fetch(userId).catch(() => null);
    if (!banInfo) {
      return interaction.reply({
        content: '`❌` Ese ID de usuario no figura en la lista de baneados.',
        ephemeral: true
      });
    }

    await interaction.guild.bans.remove(userId, `[Moderador: ${interaction.user.tag}] ${reason}`);

    const publicNotification = `${interaction.user} desbaneó a <@${userId}> por el motivo: **${reason}**`;

    const logEmbed = createMonochromeEmbed({
      title: '`🔓` Sanción • Desbaneo',
      description: publicNotification,
      fields: [
        { name: '`👤` Usuario', value: `${banInfo.user.tag} (\`${userId}\`)`, inline: true },
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
  } catch (err) {
    console.error('Error unbanning user:', err);
    return interaction.reply({
      content: '`❌` Ocurrió un error al intentar desbanear al usuario.',
      ephemeral: true
    });
  }
}
