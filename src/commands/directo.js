import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { config } from '../config.js';
import { createMonochromeEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('directo')
  .setDescription('Anunciar una transmisión en vivo (Solo Streamers)')
  .addStringOption(opt =>
    opt.setName('link')
      .setDescription('Enlace a tu directo (Twitch, Kick, YouTube, etc.)')
      .setRequired(true)
  );

export async function execute(interaction) {
  // Comprobar canal exacto: 1563731111534661744
  if (interaction.channelId !== config.directosChannelId) {
    return interaction.reply({
      content: `\`🚫\` Este comando solo puede utilizarse en el canal <#${config.directosChannelId}>.`,
      flags: MessageFlags.Ephemeral
    });
  }

  // Comprobar rol Streamers (1563979407792668713) o dueño
  const hasStreamerRole = interaction.member.roles.cache.has(config.streamerRoleId);
  const isOwner = interaction.user.id === interaction.guild.ownerId;

  if (!hasStreamerRole && !isOwner) {
    return interaction.reply({
      content: '`🚫` Solo los miembros con el rol de **Streamers** pueden utilizar este comando.',
      flags: MessageFlags.Ephemeral
    });
  }

  const streamLink = interaction.options.getString('link').trim();

  // Validar formato básico de URL
  if (!streamLink.startsWith('http://') && !streamLink.startsWith('https://')) {
    return interaction.reply({
      content: '`❌` Por favor ingresa un enlace válido que comience con http:// o https://',
      flags: MessageFlags.Ephemeral
    });
  }

  const streamEmbed = createMonochromeEmbed({
    title: '`🔴` ¡DIRECTO INICIADO!',
    description: `### **${interaction.user.username.toUpperCase()} ESTÁ EN VIVO**\n` +
      `¡Pásense a apoyar la transmisión, dejar su follow y compartir un buen rato con la comunidad!\n\n` +
      `🔗 **Enlace:** ${streamLink}`,
    fields: [
      { name: '`🎮` Streamer', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
      { name: '`📍` Canal', value: `<#${interaction.channelId}>`, inline: true }
    ],
    footerText: 'Hassbulla Gaming • Notificaciones de Stream'
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Ver Directo')
      .setStyle(ButtonStyle.Link)
      .setURL(streamLink)
      .setEmoji('📺')
  );

  // @everyone fuera del embed, y embed + botón
  return interaction.reply({
    content: '@everyone',
    embeds: [streamEmbed],
    components: [row]
  });
}
