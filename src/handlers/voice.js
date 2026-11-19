import {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
  Routes
} from 'discord.js';
import { config } from '../config.js';
import { createMonochromeEmbed, buildVoicePanelContainer } from '../utils/embeds.js';

// Cache de canales activos: channelId -> { ownerId, admins: Set, allowedUsers: Set, isPublic, pttRequired, videoAllowed, statusText: string, panelMessage: Message|null }
export const activeVoiceChannels = new Map();

// Presets guardados por usuario: userId -> { name, isPublic, videoAllowed, pttRequired, userLimit, bitrate }
export const userVoicePresets = new Map();

export async function handleVoiceStateUpdate(oldState, newState) {
  const member = newState.member;
  if (!member || member.user.bot) return;

  const voiceLogsChannel = newState.guild.channels.cache.get(config.voiceLogsChannelId);

  // 1. Logs de actividad de voz
  if (!oldState.channelId && newState.channelId) {
    if (voiceLogsChannel) {
      const embed = createMonochromeEmbed({
        title: '`🔊` Conexión a Voz',
        description: `${member.user} se conectó al canal de voz **${newState.channel.name}**`,
        fields: [
          { name: '`👤` Usuario', value: `${member.user.tag} (\`${member.user.id}\`)`, inline: true },
          { name: '`📍` Canal', value: `\`${newState.channel.name}\``, inline: true }
        ],
        footerText: 'Hassbulla Bot • Logs de Voz'
      });
      await voiceLogsChannel.send({ embeds: [embed] }).catch(() => {});
    }
  } else if (oldState.channelId && !newState.channelId) {
    if (voiceLogsChannel) {
      const embed = createMonochromeEmbed({
        title: '`🔈` Desconexión de Voz',
        description: `${member.user} se desconectó del canal **${oldState.channel.name}**`,
        fields: [
          { name: '`👤` Usuario', value: `${member.user.tag} (\`${member.user.id}\`)`, inline: true },
          { name: '`📍` Canal', value: `\`${oldState.channel.name}\``, inline: true }
        ],
        footerText: 'Hassbulla Bot • Logs de Voz'
      });
      await voiceLogsChannel.send({ embeds: [embed] }).catch(() => {});
    }
  } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
    if (voiceLogsChannel) {
      const embed = createMonochromeEmbed({
        title: '`🔄` Movimiento de Voz',
        description: `${member.user} cambió de canal: **${oldState.channel.name}** ➔ **${newState.channel.name}**`,
        fields: [
          { name: '`👤` Usuario', value: `${member.user.tag} (\`${member.user.id}\`)`, inline: true }
        ],
        footerText: 'Hassbulla Bot • Logs de Voz'
      });
      await voiceLogsChannel.send({ embeds: [embed] }).catch(() => {});
    }
  }

  // 2. Creación de canal dinámico al unirse a la sala creadora
  if (newState.channelId === config.voiceCreatorChannelId) {
    await createCustomVoiceChannel(member, newState.guild);
  }

  // 3. Limpieza de canales temporales al vaciarse + borrado del mensaje del MD para evitar spam
  if (oldState.channelId && activeVoiceChannels.has(oldState.channelId)) {
    const channel = oldState.guild.channels.cache.get(oldState.channelId);
    if (channel && channel.members.size === 0) {
      const vData = activeVoiceChannels.get(oldState.channelId);
      if (vData && vData.panelMessage) {
        // Borrar el mensaje del panel de control (en DM o canal)
        await vData.panelMessage.delete().catch(() => {});
      }
      activeVoiceChannels.delete(oldState.channelId);
      await channel.delete('Canal de voz temporal vacío').catch(() => {});
    }
  }
}

async function createCustomVoiceChannel(member, guild) {
  try {
    const channelName = `${member.displayName || member.user.username} Voice`;

    // Permisos otorgados en el canal al usuario: MuteMembers, DeafenMembers, MoveMembers (expulsar/mover), ManageChannels
    const newChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: config.tempVoiceCategoryId,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.Connect]
        },
        {
          id: config.verifiedRoleId,
          deny: [PermissionFlagsBits.Connect]
        },
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak,
            PermissionFlagsBits.Stream,
            PermissionFlagsBits.UseVAD,
            PermissionFlagsBits.MuteMembers,
            PermissionFlagsBits.DeafenMembers,
            PermissionFlagsBits.MoveMembers,
            PermissionFlagsBits.ManageChannels
          ]
        }
      ]
    });

    await member.voice.setChannel(newChannel);

    const voiceData = {
      ownerId: member.id,
      admins: new Set(),
      allowedUsers: new Set(),
      isPublic: false,
      pttRequired: false,
      videoAllowed: true,
      statusText: '',
      panelMessage: null
    };

    activeVoiceChannels.set(newChannel.id, voiceData);

    // Todos los usuarios que crean su sala reciben el panel interactivo Components V2
    const hasSavedPreset = userVoicePresets.has(member.id);
    const container = buildVoicePanelContainer(newChannel, voiceData, hasSavedPreset);

    try {
      const dmMsg = await member.send({
        flags: MessageFlags.IsComponentsV2,
        components: [container]
      });
      voiceData.panelMessage = dmMsg;
    } catch {
      const chMsg = await newChannel.send({
        content: `${member}`,
        flags: MessageFlags.IsComponentsV2,
        components: [container]
      }).catch(() => null);
      if (chMsg) voiceData.panelMessage = chMsg;
    }
  } catch (error) {
    console.error('Error creando canal de voz dinámico:', error);
  }
}

// Sincroniza y actualiza visualmente el contenedor V2 en vivo sin colisión de replies
async function syncLiveContainer(channel, voiceData, interaction) {
  const hasSavedPreset = userVoicePresets.has(voiceData.ownerId);
  const updatedContainer = buildVoicePanelContainer(channel, voiceData, hasSavedPreset);

  const isDirectPanelButton = interaction && interaction.isButton() && interaction.message && voiceData.panelMessage && interaction.message.id === voiceData.panelMessage.id;

  if (isDirectPanelButton && !interaction.replied && !interaction.deferred) {
    // Si viene de un botón directo en el mensaje del panel, actualizamos directamente el mensaje del botón
    await interaction.update({
      flags: MessageFlags.IsComponentsV2,
      components: [updatedContainer]
    }).catch(console.error);
  } else {
    // Si viene de un modal submit, select menu o ya fue respondido, editamos el mensaje del panel original
    if (voiceData.panelMessage) {
      await voiceData.panelMessage.edit({
        flags: MessageFlags.IsComponentsV2,
        components: [updatedContainer]
      }).catch(() => {});
    }
  }
}

export async function handleVoiceInteraction(interaction) {
  if (!interaction.isButton() && !interaction.isModalSubmit() && !interaction.isUserSelectMenu() && !interaction.isStringSelectMenu()) return;

  const [prefix, action, channelId] = interaction.customId.split(':');
  if (prefix !== 'vc') return;

  const channel = interaction.client.channels.cache.get(channelId);
  if (!channel) {
    if (!interaction.replied && !interaction.deferred) {
      return interaction.reply({
        content: '`⚠️` El canal de voz ya no existe o fue cerrado.',
        ephemeral: true
      });
    }
    return;
  }

  const voiceData = activeVoiceChannels.get(channelId);
  if (!voiceData) {
    if (!interaction.replied && !interaction.deferred) {
      return interaction.reply({
        content: '`⚠️` No se encontró el registro de este canal temporal.',
        ephemeral: true
      });
    }
    return;
  }

  const isOwner = voiceData.ownerId === interaction.user.id;
  const isAdmin = voiceData.admins.has(interaction.user.id);

  if (!isOwner && !isAdmin) {
    if (!interaction.replied && !interaction.deferred) {
      return interaction.reply({
        content: '`🚫` Solo el creador o administradores de esta sala pueden modificar los parámetros.',
        ephemeral: true
      });
    }
    return;
  }

  // 1. Privacidad General (Público vs Privado para usuarios Verificados)
  if (action === 'privacy') {
    voiceData.isPublic = !voiceData.isPublic;
    const targetRoleId = config.verifiedRoleId || channel.guild.roles.everyone.id;
    await channel.permissionOverwrites.edit(targetRoleId, {
      Connect: voiceData.isPublic ? true : false,
      ViewChannel: true
    });
    await syncLiveContainer(channel, voiceData, interaction);
    return;
  }

  // 2. Video / Stream
  if (action === 'video') {
    voiceData.videoAllowed = !voiceData.videoAllowed;
    const targetRoleId = config.verifiedRoleId || channel.guild.roles.everyone.id;
    await channel.permissionOverwrites.edit(targetRoleId, {
      Stream: voiceData.videoAllowed ? true : false
    });
    await syncLiveContainer(channel, voiceData, interaction);
    return;
  }

  // 3. Pulsar para hablar
  if (action === 'ptt') {
    voiceData.pttRequired = !voiceData.pttRequired;
    const targetRoleId = config.verifiedRoleId || channel.guild.roles.everyone.id;
    await channel.permissionOverwrites.edit(targetRoleId, {
      UseVAD: voiceData.pttRequired ? false : null
    });
    await syncLiveContainer(channel, voiceData, interaction);
    return;
  }

  // 4. Modal para Límite
  if (action === 'limit') {
    const modal = new ModalBuilder()
      .setCustomId(`vc:limit_submit:${channelId}`)
      .setTitle('Límite de usuarios');

    const input = new TextInputBuilder()
      .setCustomId('limit_val')
      .setLabel('Límite de miembros (0 = ilimitado, 1-99)')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(2)
      .setRequired(true)
      .setValue(channel.userLimit ? channel.userLimit.toString() : '0');

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  if (action === 'limit_submit') {
    const rawVal = interaction.fields.getTextInputValue('limit_val');
    const limit = parseInt(rawVal, 10);
    if (isNaN(limit) || limit < 0 || limit > 99) {
      return interaction.reply({ content: '`❌` Número inválido. Debe ser entre 0 y 99.', ephemeral: true });
    }

    await channel.setUserLimit(limit);
    await syncLiveContainer(channel, voiceData, interaction);
    return interaction.reply({
      content: `\`👥\` Límite actualizado a: **${limit === 0 ? 'Ilimitado' : limit}**`,
      ephemeral: true
    });
  }

  // 5. Modal para Renombrar
  if (action === 'rename') {
    const modal = new ModalBuilder()
      .setCustomId(`vc:rename_submit:${channelId}`)
      .setTitle('Renombrar Canal');

    const input = new TextInputBuilder()
      .setCustomId('name_val')
      .setLabel('Nuevo nombre del canal')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(30)
      .setRequired(true)
      .setValue(channel.name);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  if (action === 'rename_submit') {
    const newName = interaction.fields.getTextInputValue('name_val');
    await channel.setName(newName);
    await syncLiveContainer(channel, voiceData, interaction);
    return interaction.reply({
      content: `\`✏️\` Canal renombrado a: **${newName}**`,
      ephemeral: true
    });
  }

  // 6. Modal para Establecer Estado del Canal de Voz
  if (action === 'status') {
    const modal = new ModalBuilder()
      .setCustomId(`vc:status_submit:${channelId}`)
      .setTitle('Estado del Canal de Voz');

    const input = new TextInputBuilder()
      .setCustomId('status_val')
      .setLabel('Escribe el estado del canal (máx 50 car.)')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(50)
      .setRequired(false)
      .setPlaceholder('Ej: Jugando Ranked en Discord')
      .setValue(voiceData.statusText || '');

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  if (action === 'status_submit') {
    const newStatus = interaction.fields.getTextInputValue('status_val') || '';
    voiceData.statusText = newStatus;

    try {
      await interaction.client.rest.put(Routes.channelVoiceStatus(channel.id), {
        body: { status: newStatus }
      });
    } catch (e) {
      console.warn('No se pudo establecer el voice status en la API:', e.message);
    }

    await syncLiveContainer(channel, voiceData, interaction);
    return interaction.reply({
      content: newStatus
        ? `\`💬\` Estado de voz fijado en: **${newStatus}**`
        : '`💬\` Se ha borrado el estado de la sala.',
      ephemeral: true
    });
  }

  // 7. Bitrate Gaming (Selector de Calidad de Audio)
  if (action === 'bitrate') {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`vc:bitrate_submit:${channelId}`)
      .setPlaceholder('Selecciona la calidad de audio (Bitrate)')
      .addOptions([
        { label: '64 kbps (Estándar)', description: 'Bajo consumo de ancho de banda', value: '64000' },
        { label: '96 kbps (Gaming Competitivo)', description: 'Audio nítido para partidas', value: '96000' },
        { label: '128 kbps (Ultra Calidad)', description: 'Máxima claridad de voz', value: '128000' }
      ]);

    return interaction.reply({
      content: '`⚡` Ajusta la tasa de bits (bitrate) para mejorar la claridad de audio:',
      components: [new ActionRowBuilder().addComponents(selectMenu)],
      ephemeral: true
    });
  }

  if (action === 'bitrate_submit') {
    const newBitrate = parseInt(interaction.values[0], 10);
    try {
      await channel.setBitrate(newBitrate);
    } catch (err) {
      console.warn('Fallo al actualizar bitrate:', err.message);
    }
    await syncLiveContainer(channel, voiceData, interaction);
    return interaction.reply({
      content: `\`⚡\` Calidad de audio actualizada a: **${newBitrate / 1000} kbps**`,
      ephemeral: true
    });
  }

  // 8. Guardar Configuración (Preset)
  if (action === 'save_preset') {
    userVoicePresets.set(interaction.user.id, {
      name: channel.name,
      isPublic: voiceData.isPublic,
      videoAllowed: voiceData.videoAllowed,
      pttRequired: voiceData.pttRequired,
      userLimit: channel.userLimit,
      bitrate: channel.bitrate,
      statusText: voiceData.statusText
    });

    await syncLiveContainer(channel, voiceData, interaction);
    return interaction.reply({
      content: '`💾` ¡Configuración de sala guardada con éxito! Podrás cargarla en cualquier momento.',
      ephemeral: true
    });
  }

  // 9. Cargar Configuración (Preset)
  if (action === 'load_preset') {
    const preset = userVoicePresets.get(interaction.user.id);
    if (!preset) {
      return interaction.reply({
        content: '`⚠️` No tienes ninguna configuración guardada todavía.',
        ephemeral: true
      });
    }

    voiceData.isPublic = preset.isPublic;
    voiceData.videoAllowed = preset.videoAllowed;
    voiceData.pttRequired = preset.pttRequired;
    voiceData.statusText = preset.statusText;

    // Aplicar a canal
    await channel.setName(preset.name).catch(() => {});
    await channel.setUserLimit(preset.userLimit).catch(() => {});
    if (preset.bitrate) await channel.setBitrate(preset.bitrate).catch(() => {});
    const targetRoleId = config.verifiedRoleId || channel.guild.roles.everyone.id;
    await channel.permissionOverwrites.edit(targetRoleId, {
      Connect: preset.isPublic ? true : false,
      Stream: preset.videoAllowed ? true : false,
      UseVAD: preset.pttRequired ? false : null
    }).catch(() => {});

    if (preset.statusText) {
      try {
        await interaction.client.rest.put(Routes.channelVoiceStatus(channel.id), {
          body: { status: preset.statusText }
        });
      } catch {}
    }

    await syncLiveContainer(channel, voiceData, interaction);
    return interaction.reply({
      content: '`📂` ¡Configuración favorita cargada y aplicada a la sala!',
      ephemeral: true
    });
  }

  // 10. Invitar amigos específicos
  if (action === 'invite') {
    const userSelect = new UserSelectMenuBuilder()
      .setCustomId(`vc:invite_submit:${channelId}`)
      .setPlaceholder('Selecciona amigos para darles acceso a la sala')
      .setMinValues(1)
      .setMaxValues(5);

    return interaction.reply({
      content: '`🤝` Selecciona los miembros que podrán unirse:',
      components: [new ActionRowBuilder().addComponents(userSelect)],
      ephemeral: true
    });
  }

  if (action === 'invite_submit') {
    for (const [userId] of interaction.users) {
      voiceData.allowedUsers.add(userId);
      await channel.permissionOverwrites.edit(userId, {
        Connect: true,
        Speak: true,
        ViewChannel: true
      });
    }

    await syncLiveContainer(channel, voiceData, interaction);
    return interaction.reply({
      content: `\`✅\` Se otorgó acceso a: ${interaction.users.map(u => `${u}`).join(', ')}`,
      ephemeral: true
    });
  }

  // 11. Asignar Administrador de Voz
  if (action === 'admin') {
    if (!isOwner) {
      return interaction.reply({
        content: '`🚫` Solo el dueño original de la sala puede otorgar o revocar administradores.',
        ephemeral: true
      });
    }

    const userSelect = new UserSelectMenuBuilder()
      .setCustomId(`vc:admin_submit:${channelId}`)
      .setPlaceholder('Selecciona al usuario para hacer Co-Administrador')
      .setMinValues(1)
      .setMaxValues(1);

    return interaction.reply({
      content: '`👑` Selecciona a un usuario para darle permisos de administrador de esta sala:',
      components: [new ActionRowBuilder().addComponents(userSelect)],
      ephemeral: true
    });
  }

  if (action === 'admin_submit') {
    const targetUser = interaction.users.first();
    if (!targetUser) return;

    if (voiceData.admins.has(targetUser.id)) {
      voiceData.admins.delete(targetUser.id);
      await channel.permissionOverwrites.edit(targetUser.id, {
        MuteMembers: false,
        DeafenMembers: false,
        MoveMembers: false
      });
      await syncLiveContainer(channel, voiceData, interaction);
      return interaction.reply({
        content: `\`👑\` Se removió el rol de administrador de sala a ${targetUser}.`,
        ephemeral: true
      });
    } else {
      voiceData.admins.add(targetUser.id);
      voiceData.allowedUsers.add(targetUser.id);
      await channel.permissionOverwrites.edit(targetUser.id, {
        Connect: true,
        Speak: true,
        ViewChannel: true,
        MuteMembers: true,
        DeafenMembers: true,
        MoveMembers: true
      });
      await syncLiveContainer(channel, voiceData, interaction);
      return interaction.reply({
        content: `\`👑\` ¡${targetUser} ahora es Co-Administrador de tu sala (con permisos de mute, ensordecer y mover)!`,
        ephemeral: true
      });
    }
  }
}
