import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { config } from '../config.js';
import { createMonochromeEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('publicarvideo')
  .setDescription('Publicar un nuevo video de la comunidad (Solo Streamers)')
  .addStringOption(opt =>
    opt.setName('link')
      .setDescription('Enlace a tu video o clip (YouTube, TikTok, etc.)')
      .setRequired(true)
  );

export async function execute(interaction) {
  // Comprobar canal exacto: 1563979852325847090
  if (interaction.channelId !== config.videosChannelId) {
    return interaction.reply({
      content: `\`🚫\` Este comando solo puede utilizarse en el canal <#${config.videosChannelId}>.`,
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

  const videoLink = interaction.options.getString('link').trim();

  if (!videoLink.startsWith('http://') && !videoLink.startsWith('https://')) {
    return interaction.reply({
      content: '`❌` Por favor ingresa un enlace válido que comience con http:// o https://',
      flags: MessageFlags.Ephemeral
    });
  }

  const videoEmbed = createMonochromeEmbed({
    title: '`🎬` ¡NUEVO VIDEO PUBLICADO!',
    description: `### **${interaction.user.username.toUpperCase()} SUBIÓ UN NUEVO VIDEO**\n` +
      `¡Vayan a verlo, dejar su like, suscribirse y apoyar el contenido de la comunidad!\n\n` +
      `🔗 **Enlace:** ${videoLink}`,
    fields: [
      { name: '`👤` Creador', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
      { name: '`📍` Canal', value: `<#${interaction.channelId}>`, inline: true }
    ],
    footerText: 'Hassbulla Gaming • Contenido de Creadores'
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Ver Video')
      .setStyle(ButtonStyle.Link)
      .setURL(videoLink)
      .setEmoji('▶️')
  );

  return interaction.reply({
    content: '@everyone',
    embeds: [videoEmbed],
    components: [row]
  });
}
