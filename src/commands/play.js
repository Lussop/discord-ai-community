import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import play from 'play-dl';
import spotifyUrlInfo from 'spotify-url-info';
import { Ytdl, parseVideoId, parsePlaylistId } from '@distube/ytdl-core';
import { getOrCreateQueue, playNextTrack, MAX_QUEUE_SIZE, assertMusicControl } from '../handlers/music.js';
import { createMonochromeEmbed } from '../utils/embeds.js';

const spotifyScraper = spotifyUrlInfo(fetch);
const ytdl = new Ytdl();

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return 'Desconocida';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function cleanQuery(raw) {
  if (typeof raw !== 'string') return '';
  let text = raw.trim();
  const urlMatch = text.match(/https?:\/\/[^\s'`"<>]+/);
  if (urlMatch) {
    return urlMatch[0].replace(/[.,;:!?)]+$/, '');
  }
  if (text.length > 1 && text.startsWith('`') && text.endsWith('`')) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Reproducir música desde YouTube o Spotify (enlace o nombre)')
  .addStringOption(opt =>
    opt.setName('cancion')
      .setDescription('Nombre de la canción o enlace (YouTube / Spotify / SoundCloud)')
      .setRequired(true)
  );

export async function execute(interaction) {
  const memberVoiceChannel = interaction.member.voice.channel;

  if (!memberVoiceChannel) {
    return interaction.reply({
      content: '`🚫` Debes estar conectado a un canal de voz para reproducir música.',
      flags: MessageFlags.Ephemeral
    });
  }

  const controlError = assertMusicControl(interaction);
  if (controlError) {
    return interaction.reply({ content: controlError, flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply();

  const rawQuery = interaction.options.getString('cancion');
  const query = cleanQuery(rawQuery);

  try {
    let tracksToAdd = [];
    let spType = false;

    // 1. Detección y Extracción de Spotify (sin necesidad de credenciales)
    if (query.includes('spotify.com')) {
      spType = true;
      try {
        const data = await spotifyScraper.getData(query);
        if (data.type === 'track') {
          tracksToAdd.push({
            title: data.name || data.title,
            artist: data.artists?.map(a => a.name).join(', ') || '',
            url: query,
            duration: data.duration ? `${Math.floor(data.duration / 60000)}:${(Math.floor((data.duration % 60000) / 1000)).toString().padStart(2, '0')}` : 'Desconocida',
            thumbnail: data.coverArt?.sources?.[0]?.url || data.thumbnail,
            source: 'spotify',
            requestedBy: interaction.user
          });
        } else if (data.type === 'playlist' || data.type === 'album') {
          const trackList = data.trackList || data.tracks?.items || [];
          for (const item of trackList.slice(0, MAX_QUEUE_SIZE)) {
            const trackName = item.name || item.title;
            if (!trackName) continue;
            tracksToAdd.push({
              title: trackName,
              artist: item.artists?.map(a => a.name).join(', ') || item.subtitle || '',
              url: item.uri ? `https://open.spotify.com/track/${item.id || ''}` : query,
              duration: item.duration ? `${Math.floor(item.duration / 60000)}:${(Math.floor((item.duration % 60000) / 1000)).toString().padStart(2, '0')}` : 'Desconocida',
              thumbnail: data.coverArt?.sources?.[0]?.url,
              source: 'spotify',
              requestedBy: interaction.user
            });
          }
        }
      } catch (spErr) {
        console.warn('Error extrayendo de Spotify:', spErr.message);
        // Fallback: búsqueda directa
        const searchResults = await ytdl.search(query, { limit: 1 }).catch(() => []);
        if (searchResults && searchResults.length > 0) {
          const v = searchResults[0];
          tracksToAdd.push({
            title: v.title,
            url: v.url,
            duration: formatDuration(v.lengthSeconds),
            thumbnail: v.thumbnails?.[0]?.url,
            source: 'youtube',
            requestedBy: interaction.user
          });
        }
      }
    }

    // 2. Detección de SoundCloud
    let soType = false;
    if (!spType && query.includes('soundcloud.com')) {
      soType = await play.so_validate(query);
      if (soType === 'track') {
        const soData = await play.soundcloud(query);
        tracksToAdd.push({
          title: soData.name,
          url: soData.url,
          duration: `${Math.floor(soData.durationInSec / 60)}:${(soData.durationInSec % 60).toString().padStart(2, '0')}`,
          thumbnail: soData.thumbnail,
          source: 'soundcloud',
          requestedBy: interaction.user
        });
      }
    }

    // 3. YouTube o Búsqueda Directa
    if (!spType && !soType) {
      const videoId = parseVideoId(query);
      const playlistId = parsePlaylistId(query);

      // Si es playlist y no tiene video individual prioritario
      if (playlistId && !query.includes('watch?v=')) {
        try {
          const playlist = await ytdl.getPlaylist(playlistId);
          if (playlist && playlist.items) {
            for (const item of playlist.items.slice(0, MAX_QUEUE_SIZE)) {
              tracksToAdd.push({
                title: item.title,
                url: item.url,
                duration: formatDuration(item.lengthSeconds),
                thumbnail: item.thumbnails?.[0]?.url,
                source: 'youtube',
                requestedBy: interaction.user
              });
            }
          }
        } catch (plErr) {
          console.warn('Error al cargar playlist de YouTube:', plErr.message);
        }
      }

      // Si es video individual
      if (tracksToAdd.length === 0 && videoId) {
        try {
          const info = await ytdl.getInfo(query);
          const details = info.videoDetails;
          tracksToAdd.push({
            title: details.title,
            url: details.url || `https://www.youtube.com/watch?v=${videoId}`,
            duration: formatDuration(details.lengthSeconds),
            thumbnail: details.thumbnails?.[0]?.url,
            source: 'youtube',
            requestedBy: interaction.user
          });
        } catch (vErr) {
          console.warn('Error al obtener info de video individual:', vErr.message);
        }
      }

      // Búsqueda directa por texto si aún no hay resultados
      if (tracksToAdd.length === 0) {
        const searchResults = await ytdl.search(query, { limit: 1 }).catch(() => []);
        if (searchResults && searchResults.length > 0) {
          const v = searchResults[0];
          tracksToAdd.push({
            title: v.title,
            url: v.url,
            duration: formatDuration(v.lengthSeconds),
            thumbnail: v.thumbnails?.[0]?.url,
            source: 'youtube',
            requestedBy: interaction.user
          });
        }
      }
    }

    if (tracksToAdd.length === 0) {
      return interaction.editReply({
        content: '`❌` No se pudo obtener información del audio solicitado.'
      });
    }

    const serverQueue = getOrCreateQueue(interaction);

    if (serverQueue.queue.length + tracksToAdd.length > MAX_QUEUE_SIZE) {
      const allowed = MAX_QUEUE_SIZE - serverQueue.queue.length;
      if (allowed <= 0) {
        return interaction.editReply({
          content: `\`⚠️\` La cola está llena (límite: ${MAX_QUEUE_SIZE} canciones).`
        });
      }
      tracksToAdd = tracksToAdd.slice(0, allowed);
    }

    const wasEmpty = serverQueue.queue.length === 0 && !serverQueue.currentTrack;
    serverQueue.queue.push(...tracksToAdd);

    if (wasEmpty) {
      await interaction.editReply({
        content: `\`🎶\` Conectado a **${memberVoiceChannel.name}**. Iniciando sonido...`
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 6000);
      await playNextTrack(interaction.guildId);
    } else {
      if (tracksToAdd.length === 1) {
        const addedTrack = tracksToAdd[0];
        const addedEmbed = createMonochromeEmbed({
          title: '`➕` Añadido a la Cola',
          description: `### [${addedTrack.title}](${addedTrack.url})\n\n` +
            `• \`⏱️\` **Duración:** \`${addedTrack.duration || 'Desconocida'}\`\n` +
            `• \`👤\` **Solicitado por:** ${addedTrack.requestedBy}\n` +
            `• \`📋\` **Posición en cola:** \`#${serverQueue.queue.length}\``,
          footerText: 'Hassbulla Music'
        });
        if (addedTrack.thumbnail) addedEmbed.setThumbnail(addedTrack.thumbnail);
        await interaction.editReply({ embeds: [addedEmbed] });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 8000);
      } else {
        await interaction.editReply({
          content: `\`📃\` Se añadieron **${tracksToAdd.length} canciones** a la cola desde la lista.`
        });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 8000);
      }
    }
  } catch (err) {
    console.error('Error in /play command:', err);
    return interaction.editReply({
      content: '`❌` Ocurrió un error al procesar la canción solicitada.'
    });
  }
}
