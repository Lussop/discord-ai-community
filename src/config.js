import 'dotenv/config';

export const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  guildId: process.env.GUILD_ID,
  staffRoleId: process.env.STAFF_ROLE_ID || '',
  boosterRoleId: process.env.BOOSTER_ROLE_ID || '',
  streamerRoleId: process.env.STREAMER_ROLE_ID || '',
  voiceLogsChannelId: process.env.VOICE_LOGS_CHANNEL_ID || '',
  modLogsChannelId: process.env.MOD_LOGS_CHANNEL_ID || '',
  honeypotChannelId: process.env.HONEYPOT_CHANNEL_ID || '',
  voiceCreatorChannelId: process.env.VOICE_CREATOR_CHANNEL_ID || '',
  tempVoiceCategoryId: process.env.TEMP_VOICE_CATEGORY_ID || '',
  directosChannelId: process.env.DIRECTOS_CHANNEL_ID || '',
  videosChannelId: process.env.VIDEOS_CHANNEL_ID || '',
  ticketsLogsChannelId: process.env.TICKETS_LOGS_CHANNEL_ID || '',
  verifiedRoleId: process.env.VERIFIED_ROLE_ID || '',
  serverInvite: process.env.SERVER_INVITE || 'https://discord.gg/',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  groqModel: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
  groqApiKeys: [
    process.env.GROQ_API_KEY1,
    process.env.GROQ_API_KEY2,
    process.env.GROQ_API_KEY3,
    process.env.GROQ_API_KEY
  ].filter(Boolean)
};
