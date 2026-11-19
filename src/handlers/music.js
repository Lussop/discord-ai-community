import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
  entersState
} from '@discordjs/voice';
import { MessageFlags } from 'discord.js';
import play from 'play-dl';
import { Ytdl } from '@distube/ytdl-core';
import { createMonochromeEmbed, buildMusicController } from '../utils/embeds.js';

const ytdl = new Ytdl();

export const MAX_QUEUE_SIZE = 100;

// Mapa de colas por servidor: guildId -> { connection, player, queue: [], currentTrack: null, textChannel, volume, paused, panelMessage }
export const musicQueues = new Map();

export async function playNextTrack(guildId) {
  const serverQueue = musicQueues.get(guildId);
  if (!serverQueue) return;

  if (serverQueue.queue.length === 0) {
    // Si autoplay está activo y hay un track previo, buscar recomendación automática
    if (serverQueue.autoplay && serverQueue.currentTrack) {
      try {
        const lastTrack = serverQueue.currentTrack;
        const videoIdMatch = lastTrack.url?.match(/(?:watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        let nextSong = null;

        if (videoIdMatch && videoIdMatch[1]) {
          const related = await ytdl.getRelated(videoIdMatch[1]).catch(() => []);
          if (related && related.length > 0) {
            // Filtrar videos en vivo excesivamente largos
            const candidate = related.find(r => r.lengthSeconds > 60 && r.lengthSeconds < 1200) || related[0];
            if (candidate) {
              const mins = Math.floor(candidate.lengthSeconds / 60);
              const secs = Math.floor(candidate.lengthSeconds % 60);
              nextSong = {
                title: candidate.title,
                url: candidate.url,
                duration: `${mins}:${secs.toString().padStart(2, '0')}`,
                thumbnail: candidate.thumbnails?.[0]?.url,
                source: 'youtube',
                requestedBy: '`🔄 Autoplay`'
              };
            }
          }
        }

        if (!nextSong) {
          const searchWord = `${lastTrack.title} radio mix`;
          const results = await ytdl.search(searchWord, { limit: 3 }).catch(() => []);
          const candidate = results.find(r => r.url !== lastTrack.url) || results[0];
          if (candidate) {
            const mins = Math.floor(candidate.lengthSeconds / 60);
            const secs = Math.floor(candidate.lengthSeconds % 60);
            nextSong = {
              title: candidate.title,
              url: candidate.url,
              duration: `${mins}:${secs.toString().padStart(2, '0')}`,
              thumbnail: candidate.thumbnails?.[0]?.url,
              source: 'youtube',
              requestedBy: '`🔄 Autoplay`'
            };
          }
        }

        if (nextSong) {
          serverQueue.queue.push(nextSong);
        }
      } catch (apErr) {
        console.warn('[Autoplay] Error buscando siguiente pista recomendada:', apErr.message);
      }
    }

    if (serverQueue.queue.length === 0) {
      serverQueue.currentTrack = null;
      if (serverQueue.panelMessage) {
        await serverQueue.panelMessage.delete().catch(() => {});
        serverQueue.panelMessage = null;
      }
      if (serverQueue.textChannel) {
        const emptyEmbed = createMonochromeEmbed({
          title: '`🎵` Cola Finalizada',
          description: 'Se han reproducido todas las canciones de la lista.\nPuedes añadir más temas utilizando `/play` o interactuar con el panel.',
          footerText: 'Hassbulla Music'
        });
        const finishMsg = await serverQueue.textChannel.send({ embeds: [emptyEmbed] }).catch(() => null);
        if (finishMsg) {
          setTimeout(() => finishMsg.delete().catch(() => {}), 15000);
        }
      }
      return;
    }
  }

  const track = serverQueue.queue.shift();
  serverQueue.currentTrack = track;
  serverQueue.paused = false;

  try {
    let streamUrl = track.url;
    if (track.source === 'spotify' || !streamUrl || !streamUrl.startsWith('http')) {
      const querySearch = `${track.title} ${track.artist || ''}`.trim();
      const searchResults = await ytdl.search(querySearch, { limit: 1 });
      if (searchResults && searchResults.length > 0) {
        streamUrl = searchResults[0].url;
      } else {
        throw new Error(`No se encontró fuente de audio para: ${track.title}`);
      }
    }

    if (!streamUrl) {
      throw new Error(`streamUrl inválida para la pista ${track.title}`);
    }

    let resource;

    if (track.source === 'soundcloud') {
      const stream = await play.stream(streamUrl);
      resource = createAudioResource(stream.stream, {
        inputType: stream.type,
        inlineVolume: true
      });
    } else {
      // YouTube / Spotify fallback search via @distube/ytdl-core
      const audioStream = ytdl.download(streamUrl, {
        filter: { hasAudio: true, hasVideo: false },
        quality: 'highestaudio',
        highWaterMark: 1 << 25
      });

      audioStream.on('error', err => {
        // Ignorar premature close normal generado al abortar o cambiar de tema
        if (err.message && err.message.includes('Premature close')) return;
        console.warn('[Audio Stream Error]:', err.message);
      });

      resource = createAudioResource(audioStream, {
        inputType: StreamType.Arbitrary,
        inlineVolume: true
      });
    }

    if (resource.volume) {
      resource.volume.setVolume(serverQueue.volume / 100);
    }

    serverQueue.player.play(resource);

    if (serverQueue.textChannel) {
      const { container } = buildMusicController(track, serverQueue);
      const payload = {
        flags: MessageFlags.IsComponentsV2,
        components: [container]
      };

      if (serverQueue.panelMessage) {
        try {
          await serverQueue.panelMessage.edit(payload);
        } catch {
          const msg = await serverQueue.textChannel.send(payload).catch(() => null);
          serverQueue.panelMessage = msg;
        }
      } else {
        const msg = await serverQueue.textChannel.send(payload).catch(() => null);
        serverQueue.panelMessage = msg;
      }
    }
  } catch (err) {
    console.error('Error al reproducir pista:', err);
    if (serverQueue.textChannel) {
      await serverQueue.textChannel.send(`\`❌\` Error al reproducir **${track.title}**. Continuando con la siguiente...`).catch(() => {});
    }
    playNextTrack(guildId);
  }
}

export function getOrCreateQueue(interaction) {
  let serverQueue = musicQueues.get(interaction.guildId);

  if (!serverQueue) {
    const voiceChannel = interaction.member.voice.channel;
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: interaction.guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator
    });

    const player = createAudioPlayer();
    connection.subscribe(player);

    serverQueue = {
      connection,
      player,
      queue: [],
      currentTrack: null,
      textChannel: interaction.channel,
      volume: 100,
      paused: false,
      autoplay: true,
      panelMessage: null
    };

    musicQueues.set(interaction.guildId, serverQueue);

    player.on(AudioPlayerStatus.Idle, () => {
      playNextTrack(interaction.guildId);
    });

    player.on('error', error => {
      console.error('Audio Player Error:', error.message);
      playNextTrack(interaction.guildId);
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5000)
        ]);
      } catch {
        connection.destroy();
        musicQueues.delete(interaction.guildId);
      }
    });
  }

  serverQueue.textChannel = interaction.channel;
  return serverQueue;
}

export function assertMusicControl(interaction) {
  const memberChannel = interaction.member?.voice?.channel;
  if (!memberChannel) return '`❌` Debes estar conectado a un canal de voz.';
  const serverQueue = musicQueues.get(interaction.guildId);
  if (serverQueue && serverQueue.connection.joinConfig.channelId !== memberChannel.id) {
    return '`❌` Debes estar en el mismo canal de voz que el bot para controlar la música.';
  }
  return null;
}
