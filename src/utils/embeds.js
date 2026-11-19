import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder
} from 'discord.js';

export const COLORS = {
  WHITE: 0xFFFFFF,
  BLACK: 0x000000,
  DARK_GRAY: 0x2B2D31,
  LIGHT_GRAY: 0xE0E0E0,
  CONTAINER_ACCENT: 0xFFFFFF
};

export const createMonochromeEmbed = ({ title, description, fields = [], footerText = 'Hassbulla Bot • Gaming Security' }) => {
  const embed = new EmbedBuilder()
    .setColor(COLORS.WHITE)
    .setTimestamp();

  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (fields.length) embed.addFields(fields);
  if (footerText) embed.setFooter({ text: footerText });

  return embed;
};

// Panel de Voz Dinámico (Components V2)
export const buildVoicePanelContainer = (channel, voiceData, hasSavedPreset = false) => {
  const adminList = voiceData.admins.size > 0
    ? Array.from(voiceData.admins).map(id => `<@${id}>`).join(', ')
    : '`Ninguno`';

  const invitedList = voiceData.allowedUsers.size > 0
    ? Array.from(voiceData.allowedUsers).map(id => `<@${id}>`).join(', ')
    : '`Ninguno`';

  const userLimit = channel.userLimit === 0 ? '`Ilimitado`' : `\`${channel.userLimit} miembros\``;
  const currentStatus = voiceData.statusText ? `\`${voiceData.statusText}\`` : '`Sin estado`';
  const bitrateKbps = channel.bitrate ? `${channel.bitrate / 1000} kbps` : '64 kbps';

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`vc:privacy:${channel.id}`)
      .setLabel('Acceso')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔒'),
    new ButtonBuilder()
      .setCustomId(`vc:invite:${channel.id}`)
      .setLabel('Invitar')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🤝'),
    new ButtonBuilder()
      .setCustomId(`vc:video:${channel.id}`)
      .setLabel('Cámara')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📹'),
    new ButtonBuilder()
      .setCustomId(`vc:ptt:${channel.id}`)
      .setLabel('PTT')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🎙️')
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`vc:status:${channel.id}`)
      .setLabel('Estado')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('💬'),
    new ButtonBuilder()
      .setCustomId(`vc:bitrate:${channel.id}`)
      .setLabel('Bitrate')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⚡'),
    new ButtonBuilder()
      .setCustomId(`vc:admin:${channel.id}`)
      .setLabel('Dar Admin')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('👑'),
    new ButtonBuilder()
      .setCustomId(`vc:limit:${channel.id}`)
      .setLabel('Límite')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('👥'),
    new ButtonBuilder()
      .setCustomId(`vc:rename:${channel.id}`)
      .setLabel('Renombrar')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('✏️')
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`vc:save_preset:${channel.id}`)
      .setLabel('Guardar Configuración')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('💾'),
    new ButtonBuilder()
      .setCustomId(`vc:load_preset:${channel.id}`)
      .setLabel('Cargar Configuración')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📂')
      .setDisabled(!hasSavedPreset)
  );

  const headerText = new TextDisplayBuilder().setContent(
    `# \`🎮\` Hassbulla Voice • Panel de Control\n` +
    `Canal activo: **${channel.name}**\n` +
    `Creador: <@${voiceData.ownerId}>\n\n` +
    `**Permisos Nativos en Discord:**\n` +
    `Tienes permisos directos de canal para **Mutear miembros**, **Ensordecer miembros** y **Mover/Desconectar** desde el menú contextual de Discord.\n\n` +
    `**Estado en Vivo de la Sala:**\n` +
    `• Acceso: ${voiceData.isPublic ? '`🔓 Público`' : '`🔒 Privado`'}\n` +
    `• Cámara / Video: ${voiceData.videoAllowed ? '`📹 Habilitado`' : '`🚫 Bloqueado`'}\n` +
    `• Pulsar para hablar: ${voiceData.pttRequired ? '`🎙️ Obligatorio`' : '`🔊 Voz Libre`'}\n` +
    `• Estado de sala: ${currentStatus}\n` +
    `• Calidad Bitrate: \`${bitrateKbps}\`\n` +
    `• Límite: ${userLimit}\n` +
    `• Co-Administradores: ${adminList}\n` +
    `• Amigos autorizados: ${invitedList}`
  );

  const separator = new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);

  const footerText = new TextDisplayBuilder().setContent(
    `*Ajusta la configuración de tu sala interactuando con los controles:*\n` +
    `\`ID Sala: ${channel.id}\` • Panel de Control de Voz`
  );

  return new ContainerBuilder()
    .setAccentColor(COLORS.CONTAINER_ACCENT)
    .addTextDisplayComponents(headerText)
    .addSeparatorComponents(separator)
    .addActionRowComponents(row1, row2, row3)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(footerText);
};

// Panel de Limpieza de DM (Components V2)
export const buildCleanDmContainer = () => {
  const header = new TextDisplayBuilder().setContent(
    `# \`🧹\` Hassbulla • Limpieza de Mensajes Directos\n` +
    `Mantén tu bandeja de mensajes privados limpia.\n\n` +
    `**¿Cómo funciona?**\n` +
    `Al pulsar el botón inferior, el bot iniciará un barrido automático de tu chat privado eliminando únicamente los mensajes enviados por **Hassbulla Bot**.\n\n` +
    `• \`⚡\` Proceso automático\n` +
    `• \`🗑️\` Sin límites de mensajes purgados`
  );

  const separator1 = new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('util:clean_dm')
      .setLabel('Limpiar Mi Chat Privado')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🧹')
  );

  const separator2 = new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);

  const footer = new TextDisplayBuilder().setContent(
    `*Hassbulla Bot • Sistema de Privacidad y Auto-Mantenimiento*`
  );

  return new ContainerBuilder()
    .setAccentColor(COLORS.CONTAINER_ACCENT)
    .addTextDisplayComponents(header)
    .addSeparatorComponents(separator1)
    .addActionRowComponents(row)
    .addSeparatorComponents(separator2)
    .addTextDisplayComponents(footer);
};

// Panel Principal de Tickets con Menú Desplegable (Components V2)
export const buildTicketsPanelContainer = () => {
  const header = new TextDisplayBuilder().setContent(
    `# \`🎫\` Centro de Soporte\n` +
    `Bienvenido al sistema de atención privada de **Hassbulla**.\n\n` +
    `Para abrir un ticket privado con la administración, selecciona la categoría correspondiente en el menú desplegable inferior e ingresa el motivo de tu consulta:\n\n` +
    `### **Categorías Disponibles:**\n` +
    `• \`🔨\` **Soporte:** Asistencia técnica, dudas de la comunidad y reportes de usuarios.\n` +
    `• \`🤝\` **Alianza:** Propuestas, colaboraciones y/o alianzas.\n` +
    `• \`🔩\` **Otros:** Consultas generales no contempladas en las categorías anteriores.\n\n` +
    `*Los tickets se crean de manera totalmente privada.*`
  );

  const separator1 = new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('ticket:select_category')
    .setPlaceholder('Selecciona la categoría para abrir tu ticket...')
    .addOptions([
      {
        label: 'Soporte',
        description: 'Reportes, dudas o asistencia técnica',
        value: 'soporte',
        emoji: '🔨'
      },
      {
        label: 'Alianza',
        description: 'Propuestas de convenios o colaboraciones',
        value: 'alianza',
        emoji: '🤝'
      },
      {
        label: 'Otros',
        description: 'Consultas generales no clasificadas',
        value: 'otros',
        emoji: '🔩'
      }
    ]);

  const selectRow = new ActionRowBuilder().addComponents(selectMenu);

  const separator2 = new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);

  const footer = new TextDisplayBuilder().setContent(
    `*Hassbulla Community • Sistema Anti-Vencord & Privacidad Absoluta*`
  );

  return new ContainerBuilder()
    .setAccentColor(COLORS.CONTAINER_ACCENT)
    .addTextDisplayComponents(header)
    .addSeparatorComponents(separator1)
    .addActionRowComponents(selectRow)
    .addSeparatorComponents(separator2)
    .addTextDisplayComponents(footer);
};

// Bienvenida dentro del hilo privado del Ticket mostrando el motivo (Components V2)
export const buildTicketInsideContainer = (user, typeConfig, threadId, reason = 'No especificado') => {
  const header = new TextDisplayBuilder().setContent(
    `# ${typeConfig.emoji} Ticket de ${typeConfig.label}\n` +
    `¡Hola ${user}! Tu solicitud ha sido registrada correctamente.\n\n` +
    `**Detalles de la sesión:**\n` +
    `• Solicitante: ${user} (\`${user.id}\`)\n` +
    `• Categoría: \`${typeConfig.label}\`\n` +
    `• Motivo: **${reason}**\n` +
    `• Privacidad: \`🔒 Hilo Privado (Tú, Hassbulla AI y Staff)\`\n\n` +
    `**Hassbulla AI** analizará tu consulta de inmediato y te responderá abajo. Si la solución te sirve, puedes finalizar el ticket directamente con el botón **"Solucionado"** sin necesidad de esperar al equipo de Staff.`
  );

  const separator1 = new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:resolve_by_user:${threadId}`)
      .setLabel('Marcar como Solucionado')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`ticket:request_staff:${threadId}`)
      .setLabel('Llamar al Staff')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🙋'),
    new ButtonBuilder()
      .setCustomId(`ticket:request_close:${threadId}`)
      .setLabel('Cerrar')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔒')
  );

  const separator2 = new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);

  const footer = new TextDisplayBuilder().setContent(
    `*¿Resolviste tu duda? Pulsa "Marcar como Solucionado". Si necesitas atención humana, pulsa "Llamar al Staff".*`
  );

  return new ContainerBuilder()
    .setAccentColor(COLORS.CONTAINER_ACCENT)
    .addTextDisplayComponents(header)
    .addSeparatorComponents(separator1)
    .addActionRowComponents(row)
    .addSeparatorComponents(separator2)
    .addTextDisplayComponents(footer);
};

// Controlador Interactivo de Música (Ultra Estético Monocromático)
// Controlador Interactivo de Música (Ultra Estético Monocromático con Components V2)
export const buildMusicController = (track, serverQueue) => {
  const isPaused = serverQueue.paused;
  const vol = serverQueue.volume;
  const autoplay = Boolean(serverQueue.autoplay);

  // Barra gráfica estética de volumen: [■■■■■□□□□□]
  const totalBlocks = 10;
  const filledBlocks = Math.round((vol / 100) * totalBlocks);
  const volumeBar = '`' + '■'.repeat(filledBlocks) + '□'.repeat(totalBlocks - filledBlocks) + '`';

  // Embed clásico de respaldo por compatibilidad
  const embed = createMonochromeEmbed({
    title: isPaused ? '`⏸️` En Pausa' : '`▶️` Reproduciendo Sonido',
    description: `### [${track.title}](${track.url})\n\n` +
      `\`⏱️\` **Duración:** \`${track.duration || 'En Vivo'}\`\n` +
      `\`👤\` **Solicitado por:** ${track.requestedBy}\n` +
      `\`🔊\` **Volumen:** ${volumeBar} \`${vol}%\`\n` +
      `\`🔄\` **Autoplay:** ${autoplay ? '`🟢 Activado`' : '`⚪ Desactivado`'}\n` +
      `\`📋\` **En Espera:** \`${serverQueue.queue.length} canciones\``,
    footerText: 'Hassbulla Music • Reproductor de Alta Fidelidad'
  });

  if (track.thumbnail) {
    embed.setThumbnail(track.thumbnail);
  }

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music:toggle_pause')
      .setLabel(isPaused ? 'Reanudar' : 'Pausar')
      .setStyle(isPaused ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji(isPaused ? '▶️' : '⏸️'),
    new ButtonBuilder()
      .setCustomId('music:skip')
      .setLabel('Saltar')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⏭️'),
    new ButtonBuilder()
      .setCustomId('music:autoplay')
      .setLabel('Autoplay')
      .setStyle(autoplay ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setEmoji('🔄'),
    new ButtonBuilder()
      .setCustomId('music:stop')
      .setLabel('Detener')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('⏹️'),
    new ButtonBuilder()
      .setCustomId('music:show_queue')
      .setLabel('Cola')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📋')
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music:vol_down')
      .setLabel('-10%')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔉'),
    new ButtonBuilder()
      .setCustomId('music:vol_up')
      .setLabel('+10%')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔊')
  );

  // Components V2 Container integrado (Ultra Estético Monocromático)
  const container = new ContainerBuilder().setAccentColor(COLORS.CONTAINER_ACCENT);

  const titleText = new TextDisplayBuilder().setContent(
    `# ${isPaused ? '`⏸️` En Pausa' : '`▶️` Hassbulla Music'}`
  );

  const sectionText = new TextDisplayBuilder().setContent(
    `### [${track.title}](${track.url})\n\n` +
    `• \`⏱️\` **Duración:** \`${track.duration || 'En Vivo'}\`\n` +
    `• \`👤\` **Solicitado por:** ${track.requestedBy}\n` +
    `• \`🔊\` **Volumen:** ${volumeBar} \`${vol}%\`\n` +
    `• \`🔄\` **Modo Autoplay:** ${autoplay ? '`🟢 Activado (Música Infinita)`' : '`⚪ Desactivado`'}\n` +
    `• \`📋\` **En Cola:** \`${serverQueue.queue.length} temas restantes\``
  );

  container.addTextDisplayComponents(titleText);
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  if (track.thumbnail) {
    const section = new SectionBuilder()
      .addTextDisplayComponents(sectionText)
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(track.thumbnail));
    container.addSectionComponents(section);
  } else {
    container.addTextDisplayComponents(sectionText);
  }

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addActionRowComponents(row1, row2);
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`*Hassbulla Music • Reproductor de Alta Fidelidad Monocromático*`)
  );

  return { embed, components: [row1, row2], container };
};
