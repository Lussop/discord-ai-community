import { Client, GatewayIntentBits, Partials, Collection, REST, Routes, Events, MessageFlags, ActivityType } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import * as aislarCmd from './commands/aislar.js';
import * as sacarAislamientoCmd from './commands/sacar-aislamiento.js';
import * as banearCmd from './commands/banear.js';
import * as unbanearCmd from './commands/unbanear.js';
import * as limpiarCmd from './commands/limpiar.js';
import * as directoCmd from './commands/directo.js';
import * as publicarvideoCmd from './commands/publicarvideo.js';
import * as panelTicketsCmd from './commands/panel-tickets.js';
import * as playCmd from './commands/play.js';
import * as stopCmd from './commands/stop.js';
import * as skipCmd from './commands/skip.js';
import * as pauseCmd from './commands/pause.js';
import * as resumeCmd from './commands/resume.js';
import * as volumeCmd from './commands/volume.js';
import * as queueCmd from './commands/queue.js';
import * as olvidameCmd from './commands/olvidame.js';
import { handleHoneypot } from './handlers/honeypot.js';
import { handleVoiceStateUpdate, handleVoiceInteraction } from './handlers/voice.js';
import { handleTicketInteraction, activeTickets, saveTicketsToDisk } from './handlers/tickets.js';
import { musicQueues, playNextTrack, assertMusicControl } from './handlers/music.js';
import { askHasbullaAI } from './handlers/ai.js';
import { buildMusicController } from './utils/embeds.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

client.commands = new Collection();
const commandModules = [
  aislarCmd,
  sacarAislamientoCmd,
  banearCmd,
  unbanearCmd,
  limpiarCmd,
  directoCmd,
  publicarvideoCmd,
  panelTicketsCmd,
  playCmd,
  stopCmd,
  skipCmd,
  pauseCmd,
  resumeCmd,
  volumeCmd,
  queueCmd,
  olvidameCmd
];

for (const mod of commandModules) {
  client.commands.set(mod.data.name, mod);
}

// Registro de comandos en la Guild
async function registerSlashCommands() {
  const rest = new REST({ version: '10' }).setToken(config.token);
  const commandData = commandModules.map(m => m.data.toJSON());

  try {
    console.log('[Slash Commands] Registrando comandos de barra...');
    if (config.guildId) {
      await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: commandData }
      );
      console.log(`[Slash Commands] Registrados con éxito en la guild: ${config.guildId}`);
    } else {
      await rest.put(
        Routes.applicationCommands(config.clientId),
        { body: commandData }
      );
      console.log('[Slash Commands] Registrados globalmente.');
    }
  } catch (error) {
    console.error('[Slash Commands] Error al registrar comandos:', error);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

client.once(Events.ClientReady, async () => {
  console.log(`[Hassbulla Bot] Conectado exitosamente como ${client.user.tag}`);

  // 1. Establecer presencia dinámica
  client.user.setPresence({
    activities: [
      {
        name: config.serverInvite ? config.serverInvite.replace(/^https?:\/\//, '') : 'Gaming Community',
        type: ActivityType.Watching
      }
    ],
    status: 'online'
  });

  // 2. Establecer Avatar y Banner solo si no fueron aplicados para evitar ratelimits de Discord
  const profileCacheFile = path.join(__dirname, '../.asset_cache.json');
  let assetCache = {};
  try {
    if (fs.existsSync(profileCacheFile)) {
      assetCache = JSON.parse(fs.readFileSync(profileCacheFile, 'utf-8'));
    }
  } catch {}

  const avatarPath = path.join(__dirname, '../assets/hassbulla_animado.gif');
  if (fs.existsSync(avatarPath)) {
    const avatarMtime = fs.statSync(avatarPath).mtimeMs;
    if (assetCache.avatarMtime !== avatarMtime) {
      try {
        await client.user.setAvatar(avatarPath);
        assetCache.avatarMtime = avatarMtime;
        fs.writeFileSync(profileCacheFile, JSON.stringify(assetCache), 'utf-8');
        console.log('[Bot Profile] Avatar animado actualizado con éxito.');
      } catch (err) {
        console.warn('[Bot Profile] Aviso al actualizar avatar (posible cooldown de Discord):', err.message);
      }
    }
  }

  const bannerPath = path.join(__dirname, '../assets/4_banner_directos_animado.gif');
  if (fs.existsSync(bannerPath)) {
    const bannerMtime = fs.statSync(bannerPath).mtimeMs;
    if (assetCache.bannerMtime !== bannerMtime) {
      try {
        await client.user.setBanner(bannerPath);
        assetCache.bannerMtime = bannerMtime;
        fs.writeFileSync(profileCacheFile, JSON.stringify(assetCache), 'utf-8');
        console.log('[Bot Profile] Banner animado actualizado con éxito.');
      } catch (err) {
        console.warn('[Bot Profile] Aviso al actualizar banner (posible cooldown o nitro requerido para banner animado):', err.message);
      }
    }
  }

  await registerSlashCommands();
});

// Evento de interacción (Slash commands, autocompletados, botones y modales)
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (command) {
        await command.execute(interaction);
      }
    } else if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command && typeof command.autocomplete === 'function') {
        await command.autocomplete(interaction);
      }
    } else if (interaction.isButton() && interaction.customId === 'util:clean_dm') {
      await limpiarCmd.handleCleanDmButton(interaction);
    } else if (interaction.customId?.startsWith('ticket:')) {
      await handleTicketInteraction(interaction);
    } else if (interaction.isButton() && interaction.customId?.startsWith('music:')) {
      const controlError = assertMusicControl(interaction);
      if (controlError) {
        return interaction.reply({ content: controlError, flags: MessageFlags.Ephemeral });
      }

      const serverQueue = musicQueues.get(interaction.guildId);
      if (!serverQueue || !serverQueue.currentTrack) {
        return interaction.reply({ content: '`⚠️` No hay reproducción activa en este momento.', flags: MessageFlags.Ephemeral });
      }

      const action = interaction.customId.replace('music:', '');

      if (action === 'toggle_pause') {
        if (serverQueue.paused) {
          serverQueue.player.unpause();
          serverQueue.paused = false;
        } else {
          serverQueue.player.pause();
          serverQueue.paused = true;
        }

        const { container } = buildMusicController(serverQueue.currentTrack, serverQueue);
        return interaction.update({ flags: MessageFlags.IsComponentsV2, components: [container] });
      }

      if (action === 'autoplay') {
        serverQueue.autoplay = !serverQueue.autoplay;
        const { container } = buildMusicController(serverQueue.currentTrack, serverQueue);
        return interaction.update({ flags: MessageFlags.IsComponentsV2, components: [container] });
      }

      if (action === 'skip') {
        const skipped = serverQueue.currentTrack.title;
        serverQueue.player.stop();
        return interaction.reply({ content: `\`⏭️\` Canción saltada: **${skipped}**`, flags: MessageFlags.Ephemeral });
      }

      if (action === 'stop') {
        serverQueue.queue = [];
        serverQueue.player.stop();
        if (serverQueue.panelMessage) {
          await serverQueue.panelMessage.delete().catch(() => {});
          serverQueue.panelMessage = null;
        }
        serverQueue.connection.destroy();
        musicQueues.delete(interaction.guildId);
        return interaction.reply({ content: '`⏹️` Reproducción detenida y cola vaciada.', flags: MessageFlags.Ephemeral });
      }

      if (action === 'vol_down') {
        serverQueue.volume = Math.max(0, serverQueue.volume - 10);
        if (serverQueue.player.state?.resource?.volume) {
          serverQueue.player.state.resource.volume.setVolume(serverQueue.volume / 100);
        }
        const { container } = buildMusicController(serverQueue.currentTrack, serverQueue);
        return interaction.update({ flags: MessageFlags.IsComponentsV2, components: [container] });
      }

      if (action === 'vol_up') {
        serverQueue.volume = Math.min(100, serverQueue.volume + 10);
        if (serverQueue.player.state?.resource?.volume) {
          serverQueue.player.state.resource.volume.setVolume(serverQueue.volume / 100);
        }
        const { container } = buildMusicController(serverQueue.currentTrack, serverQueue);
        return interaction.update({ flags: MessageFlags.IsComponentsV2, components: [container] });
      }

      if (action === 'show_queue') {
        return queueCmd.execute(interaction);
      }
    } else {
      await handleVoiceInteraction(interaction);
    }
  } catch (err) {
    console.error('[Interaction Error]', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '`❌` Ocurrió un error inesperado al procesar la acción.',
        flags: MessageFlags.Ephemeral
      }).catch(() => {});
    }
  }
});

// Evento de mensajes (Honeypot anti-spam y menciones de IA a Hasbulla)
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // 1. Verificación de canal Honeypot
  await handleHoneypot(message);

  // 2. Chat con IA dentro de tickets activos (Asistencia automática para resolver dudas)
  if (message.channel.isThread() && activeTickets.has(message.channel.id)) {
    const ticketData = activeTickets.get(message.channel.id);
    const isStaff = message.member?.roles.cache.has(config.staffRoleId);

    // Si un staff escribe en el ticket, pausar la IA para no interrumpir la atención humana
    if (isStaff && !message.author.bot) {
      if (!ticketData.aiPaused) {
        ticketData.aiPaused = true;
        saveTicketsToDisk();
      }
      return;
    }

    // Si la IA está pausada (staff interviniendo), solo responder si mencionan explícitamente al bot
    if (ticketData.aiPaused && !message.mentions.has(client.user.id)) {
      return;
    }

    // Asistir al creador del ticket o a cualquier consulta dentro del hilo
    if (message.author.id === ticketData.creatorId || message.mentions.has(client.user.id)) {
      try {
        await message.channel.sendTyping();
        const cleanContent = message.content
          .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
          .trim();

        if (cleanContent) {
          const aiResponse = await askHasbullaAI(
            cleanContent,
            message.author,
            message.channel.id,
            true,
            ticketData.type
          );
          await message.reply({
            content: aiResponse,
            allowedMentions: { parse: [], repliedUser: false }
          });
          return;
        }
      } catch (err) {
        console.error('Error en asistencia de ticket por IA:', err);
      }
    }
  }

  // 3. Chat con IA cuando mencionan al bot (@Hassbulla bot) en canales normales
  if (message.mentions.has(client.user.id) && !message.mentions.everyone) {
    const cleanContent = message.content
      .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
      .trim();

    if (!cleanContent) {
      return message.reply({
        content: '`🥊` *Hasbulla te mira:* ¿Qué pasó crack? Decime algo o te emboco un gancho.',
        allowedMentions: { parse: [], repliedUser: false }
      });
    }

    try {
      await message.channel.sendTyping();
      const aiReply = await askHasbullaAI(cleanContent, message.author, message.channel.id, false);
      await message.reply({
        content: aiReply,
        allowedMentions: { parse: [], repliedUser: false }
      });
    } catch (err) {
      console.error('Error al responder mención de IA:', err);
    }
  }
});

// Evento de estado de voz (creación dinámica y logs)
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  await handleVoiceStateUpdate(oldState, newState);
});

client.login(config.token).catch((err) => {
  console.error('[Login Error] Fallo al autenticar con el token de Discord:', err);
});
