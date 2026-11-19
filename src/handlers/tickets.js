import {
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { createMonochromeEmbed, buildTicketInsideContainer, COLORS } from '../utils/embeds.js';
import { generateTranscriptHtml } from '../utils/transcript.js';
import { askHasbullaAI } from './ai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TICKETS_FILE = path.join(__dirname, '../../active_tickets.json');

// Cache de tickets activos en memoria con persistencia en disco
export const activeTickets = new Map();

function loadTicketsFromDisk() {
  try {
    if (fs.existsSync(TICKETS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(TICKETS_FILE, 'utf-8'));
      for (const [id, data] of Object.entries(raw)) {
        activeTickets.set(id, data);
      }
    }
  } catch (e) {
    console.warn('[Tickets] Error cargando tickets persistidos:', e.message);
  }
}

export function saveTicketsToDisk() {
  try {
    const obj = Object.fromEntries(activeTickets.entries());
    const tempFile = `${TICKETS_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(obj, null, 2), 'utf-8');
    fs.renameSync(tempFile, TICKETS_FILE);
  } catch (e) {
    console.warn('[Tickets] Error guardando tickets en disco:', e.message);
  }
}

loadTicketsFromDisk();

export async function handleTicketInteraction(interaction) {
  // 1. Manejo de Menú Desplegable: Seleccionar categoría -> abrir modal para pedir motivo
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket:select_category') {
    const selectedCategory = interaction.values[0];

    const typeConfig = {
      soporte: { emoji: '🔨', label: 'Soporte' },
      alianza: { emoji: '🤝', label: 'Alianza' },
      otros: { emoji: '🔩', label: 'Otros' }
    }[selectedCategory] || { emoji: '🎫', label: 'Ticket' };

    const modal = new ModalBuilder()
      .setCustomId(`ticket:modal_open:${selectedCategory}`)
      .setTitle(`Abrir Ticket de ${typeConfig.label}`);

    const reasonInput = new TextInputBuilder()
      .setCustomId('ticket_reason')
      .setLabel('¿Cuál es el motivo de tu ticket?')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Describe brevemente el motivo o duda...')
      .setRequired(true)
      .setMaxLength(500);

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    return interaction.showModal(modal);
  }

  // 2. Manejo de Modal Submit: Crear hilo privado y enviar contenedor V2
  if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket:modal_open:')) {
    const ticketType = interaction.customId.replace('ticket:modal_open:', '');
    const reason = interaction.fields.getTextInputValue('ticket_reason') || 'No especificado';
    const user = interaction.user;
    const guild = interaction.guild;
    const channel = interaction.channel;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Evitar tickets duplicados
    for (const [tId, tData] of activeTickets.entries()) {
      if (tData.creatorId === user.id) {
        const existingThread = guild.channels.cache.get(tId);
        if (existingThread && !existingThread.archived) {
          return interaction.editReply({
            content: `\`⚠️\` Ya tienes un ticket abierto actualmente en <#${existingThread.id}>.`
          });
        }
      }
    }

    const typeConfig = {
      soporte: { emoji: '🔨', label: 'Soporte', prefix: 'soporte' },
      alianza: { emoji: '🤝', label: 'Alianza', prefix: 'alianza' },
      otros: { emoji: '🔩', label: 'Otros', prefix: 'otros' }
    }[ticketType] || { emoji: '🎫', label: 'Ticket', prefix: 'ticket' };

    try {
      // Crear hilo privado (anti-vencord)
      const thread = await channel.threads.create({
        name: `${typeConfig.prefix}-${user.username}`,
        type: ChannelType.PrivateThread,
        autoArchiveDuration: 1440,
        reason: `Ticket de ${typeConfig.label} abierto por ${user.tag}`
      });

      // Añadir usuario al hilo
      await thread.members.add(user.id);

      // Añadir Staffs al hilo
      try {
        const staffRole = guild.roles.cache.get(config.staffRoleId);
        if (staffRole) {
          for (const [staffMemberId] of staffRole.members) {
            await thread.members.add(staffMemberId).catch(() => {});
          }
        }
      } catch (err) {
        console.warn('Error añadiendo staffs al ticket:', err.message);
      }

      // Añadir al dueño si no estuviera
      if (guild.ownerId && guild.ownerId !== user.id) {
        await thread.members.add(guild.ownerId).catch(() => {});
      }

      activeTickets.set(thread.id, {
        creatorId: user.id,
        type: typeConfig.label,
        reason: reason,
        createdAt: Date.now(),
        staffAlerted: false
      });
      saveTicketsToDisk();

      // Mención en texto estándar al usuario (Staff no se pinguea de inicio para que la IA atienda primero)
      await thread.send({
        content: `${user}`
      });

      // Tarjeta con Components V2 dentro del ticket
      const insideContainer = buildTicketInsideContainer(user, typeConfig, thread.id, reason);
      await thread.send({
        flags: MessageFlags.IsComponentsV2,
        components: [insideContainer]
      });

      // Responder de inmediato con la IA al motivo inicial del usuario
      setTimeout(async () => {
        try {
          await thread.sendTyping();
          const initialAnswer = await askHasbullaAI(
            reason,
            user,
            thread.id,
            true,
            typeConfig.label
          );
          if (initialAnswer) {
            await thread.send({
              content: initialAnswer,
              allowedMentions: { parse: [], repliedUser: false }
            });
          }
        } catch (e) {
          console.error('[Ticket Initial AI Answer Error]:', e);
        }
      }, 1000);

      return interaction.editReply({
        content: `\`✅\` Tu ticket de **${typeConfig.label}** ha sido creado exitosamente en <#${thread.id}>.`
      });
    } catch (err) {
      console.error('Error al crear ticket privado:', err);
      return interaction.editReply({
        content: '`❌` Ocurrió un error al intentar crear el hilo privado para tu ticket.'
      });
    }
  }

  // 3. Manejo de Modal Submit: Cierre con nota
  if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket:modal_close_note:')) {
    const threadId = interaction.customId.replace('ticket:modal_close_note:', '');
    const closeNote = interaction.fields.getTextInputValue('close_note_input') || 'Sin nota de cierre';

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return executeCloseTicket(interaction, threadId, closeNote);
  }

  if (!interaction.isButton()) return;

  const [prefix, action, extra] = interaction.customId.split(':');
  if (prefix !== 'ticket') return;

  // 4. Botón: Marcar como Solucionado por el creador del ticket o Staff
  if (action === 'resolve_by_user') {
    const threadId = extra;
    const ticketData = activeTickets.get(threadId);
    const isCreator = ticketData ? interaction.user.id === ticketData.creatorId : false;
    const isStaff = interaction.member.roles.cache.has(config.staffRoleId);
    const isOwner = interaction.user.id === interaction.guild.ownerId;

    if (!isCreator && !isStaff && !isOwner) {
      return interaction.reply({
        content: '`🚫` Solo el creador del ticket o el equipo de Staff pueden marcar este ticket como solucionado.',
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply();
    const resolutionNote = isCreator
      ? `Ticket resuelto satisfactoriamente por el usuario (${interaction.user.tag}) con asistencia de Hassbulla AI.`
      : `Ticket marcado como resuelto por el staff ${interaction.user.tag}.`;

    return executeCloseTicket(interaction, threadId, resolutionNote);
  }

  // 5. Botón: Llamar al Staff si la IA no pudo resolver
  if (action === 'request_staff') {
    const threadId = extra;
    const ticketData = activeTickets.get(threadId);
    const isCreator = ticketData ? interaction.user.id === ticketData.creatorId : false;
    const isStaff = interaction.member.roles.cache.has(config.staffRoleId);

    if (!isCreator && !isStaff) {
      return interaction.reply({
        content: '`🚫` Solo el solicitante del ticket puede llamar al equipo de Staff.',
        flags: MessageFlags.Ephemeral
      });
    }

    if (ticketData && ticketData.staffAlerted) {
      return interaction.reply({
        content: '`ℹ️` El equipo de Staff ya fue notificado y se sumará a la brevedad.',
        flags: MessageFlags.Ephemeral
      });
    }

    if (ticketData) {
      ticketData.staffAlerted = true;
    }

    await interaction.reply({
      content: `\`🚨\` <@&${config.staffRoleId}>, ${interaction.user} solicita asistencia del equipo de Staff en este ticket.`
    });
    return;
  }

  // 6. Solicitar cierre del ticket por Staff o usuario
  if (action === 'request_close') {
    const threadId = extra;
    const ticketData = activeTickets.get(threadId);
    const isCreator = ticketData ? interaction.user.id === ticketData.creatorId : false;
    const isStaff = interaction.member.roles.cache.has(config.staffRoleId);
    const isOwner = interaction.user.id === interaction.guild.ownerId;

    if (!isCreator && !isStaff && !isOwner) {
      return interaction.reply({
        content: '`🚫` Solo el participante o el equipo de Staff pueden cerrar este ticket.',
        flags: MessageFlags.Ephemeral
      });
    }

    const header = new TextDisplayBuilder().setContent(
      `# \`🔒\` Opciones de Cierre de Ticket\n` +
      `Selecciona cómo deseas archivar esta sesión:\n\n` +
      `• **Cerrar con nota:** Permite añadir una resolución o comentario final que se incluirá en el registro y en el mensaje al usuario.\n` +
      `• **Cerrar sin nota:** Cierra y archiva el ticket de inmediato generando el transcript en HTML.`
    );

    const separator = new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);

    const buttonsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket:close_with_note:${threadId}`)
        .setLabel('Cerrar con nota')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📝'),
      new ButtonBuilder()
        .setCustomId(`ticket:close_without_note:${threadId}`)
        .setLabel('Cerrar sin nota')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('⚡'),
      new ButtonBuilder()
        .setCustomId(`ticket:cancel_close:${threadId}`)
        .setLabel('Cancelar')
        .setStyle(ButtonStyle.Secondary)
    );

    const closeChoiceContainer = new ContainerBuilder()
      .setAccentColor(COLORS.CONTAINER_ACCENT)
      .addTextDisplayComponents(header)
      .addSeparatorComponents(separator)
      .addActionRowComponents(buttonsRow);

    return interaction.reply({
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      components: [closeChoiceContainer]
    });
  }

  // 5. Cancelar cierre
  if (action === 'cancel_close') {
    const cancelContainer = new ContainerBuilder()
      .setAccentColor(COLORS.CONTAINER_ACCENT)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('`✅` Cierre de ticket cancelado.')
      );

    return interaction.update({
      flags: MessageFlags.IsComponentsV2,
      components: [cancelContainer]
    });
  }

  // 6. Botón: Cerrar con nota -> Desplegar Modal emergente
  if (action === 'close_with_note') {
    const threadId = extra;

    const modal = new ModalBuilder()
      .setCustomId(`ticket:modal_close_note:${threadId}`)
      .setTitle('Nota Final de Cierre');

    const noteInput = new TextInputBuilder()
      .setCustomId('close_note_input')
      .setLabel('Resolución o comentarios del ticket')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Ej: Caso resuelto satisfactoriamente. Se brindó asistencia con el rol.')
      .setRequired(true)
      .setMaxLength(500);

    modal.addComponents(new ActionRowBuilder().addComponents(noteInput));
    return interaction.showModal(modal);
  }

  // 7. Botón: Cerrar sin nota -> Proceder inmediatamente
  if (action === 'close_without_note') {
    const threadId = extra;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return executeCloseTicket(interaction, threadId, null);
  }
}

// Lógica unificada para procesar el cierre del ticket y generar el transcript
async function executeCloseTicket(interaction, threadId, closeNote = null) {
  const thread = interaction.guild.channels.cache.get(threadId);

  if (!thread || !thread.isThread()) {
    return interaction.editReply({
      content: '`❌` No se encontró el hilo del ticket o ya fue cerrado.'
    });
  }

  await interaction.editReply({
    content: '`⏳` Generando transcript HTML y cerrando ticket...'
  });

  const ticketData = activeTickets.get(thread.id) || {
    creatorId: thread.ownerId,
    type: 'General',
    reason: 'No especificado',
    createdAt: thread.createdTimestamp
  };

  const creatorUser = await interaction.client.users.fetch(ticketData.creatorId).catch(() => null);
  const creatorTag = creatorUser ? creatorUser.tag : ticketData.creatorId;

  // Recolectar todos los mensajes del hilo
  let allMessages = [];
  try {
    let lastId;
    while (true) {
      const options = { limit: 100 };
      if (lastId) options.before = lastId;
      const msgs = await thread.messages.fetch(options);
      if (msgs.size === 0) break;
      allMessages.push(...msgs.values());
      lastId = msgs.last().id;
      if (msgs.size < 100) break;
    }
    allMessages.reverse();
  } catch (e) {
    console.warn('Error fetching thread messages for transcript:', e);
  }

  // Generar archivo HTML con resolución de nombres reales y nota de cierre
  const htmlContent = await generateTranscriptHtml({
    threadName: thread.name,
    ticketType: ticketData.type,
    creator: creatorTag,
    closedBy: interaction.user.tag,
    closeNote: closeNote,
    messages: allMessages,
    guild: interaction.guild
  });

  const fileName = `transcript-${thread.name}.html`;
  const attachment = new AttachmentBuilder(Buffer.from(htmlContent, 'utf-8'), { name: fileName });

  const logFields = [
    { name: '`📋` Categoría', value: `\`${ticketData.type}\``, inline: true },
    { name: '`👤` Creador', value: `${creatorUser || ticketData.creatorId}`, inline: true },
    { name: '`👮` Cerrado por', value: `${interaction.user}`, inline: true },
    { name: '`💬` Mensajes', value: `\`${allMessages.length}\``, inline: true }
  ];

  if (closeNote) {
    logFields.push({ name: '`📝` Nota de Cierre', value: `\`\`\`\n${closeNote}\n\`\`\``, inline: false });
  }

  const logEmbed = createMonochromeEmbed({
    title: '`📁` Ticket Cerrado • Transcript',
    description: `El ticket **${thread.name}** fue cerrado por ${interaction.user}.\n` +
      `**Motivo inicial:** ${ticketData.reason || 'No especificado'}\n\n` +
      `Adjunto encontrarás el registro completo de la conversación en formato HTML.`,
    fields: logFields,
    footerText: 'Hassbulla Bot • Sistema de Tickets'
  });

  // 1. Enviar al canal de logs de tickets: 1563982436017246208
  const logsChannel = interaction.guild.channels.cache.get(config.ticketsLogsChannelId);
  if (logsChannel) {
    await logsChannel.send({
      embeds: [logEmbed],
      files: [attachment]
    }).catch(console.error);
  }

  // 2. Enviar por MD al creador del ticket con la nota si existe
  if (creatorUser) {
    try {
      const dmFields = [
        { name: '`📋` Tipo', value: `\`${ticketData.type}\``, inline: true },
        { name: '`👮` Atendido por', value: `${interaction.user.tag}`, inline: true }
      ];

      if (closeNote) {
        dmFields.push({ name: '`📝` Nota del Staff', value: `\`\`\`\n${closeNote}\n\`\`\``, inline: false });
      }

      const dmEmbed = createMonochromeEmbed({
        title: '`🎫` Tu Ticket ha sido cerrado',
        description: `Tu ticket **${thread.name}** ha finalizado.\n` +
          `**Motivo:** ${ticketData.reason || 'No especificado'}\n\n` +
          `Adjunto te enviamos una copia estética de la conversación completa para tu constancia.`,
        fields: dmFields,
        footerText: 'Hassbulla Bot • Gracias por tu contacto'
      });

      await creatorUser.send({
        embeds: [dmEmbed],
        files: [new AttachmentBuilder(Buffer.from(htmlContent, 'utf-8'), { name: fileName })]
      });
    } catch (e) {
      console.warn('No se pudo enviar transcript al MD del usuario:', e.message);
    }
  }

  activeTickets.delete(thread.id);
  saveTicketsToDisk();

  // Avisar en el hilo y eliminarlo por completo tras 5 segundos para mantener el servidor limpio
  await thread.send('`🔒` **Ticket cerrado.** Este hilo se eliminará en 5 segundos...').catch(() => {});
  setTimeout(async () => {
    await thread.delete('Ticket finalizado y transcript guardado').catch(() => {});
  }, 5000);
}
