import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MEMORY_FILE = path.join(__dirname, '../../hasbulla_memory.json');
const TMP_FILE = `${MEMORY_FILE}.tmp`;

const MAX_KNOWN_USERS = 500;
const MAX_NOTES_PER_USER = 8;
const MAX_LEARNED_FACTS = 25;
const DEBOUNCE_MS = 2000;
const MAX_WAIT_MS = 10000;

let inMemoryData = null;
let saveTimer = null;
let firstSaveScheduledTime = 0;
let isSaving = false;

// Cargar memoria o rescatar JSON corrupto
export function loadMemory() {
  if (inMemoryData) return inMemoryData;

  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const raw = fs.readFileSync(MEMORY_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      inMemoryData = {
        knownUsers: parsed.knownUsers || {},
        learnedFacts: Array.isArray(parsed.learnedFacts) ? parsed.learnedFacts : [],
        totalInteractions: typeof parsed.totalInteractions === 'number' ? parsed.totalInteractions : 0
      };
      return inMemoryData;
    }
  } catch (err) {
    console.error('[Memory] Error parseando hasbulla_memory.json. Creando backup corrupto:', err.message);
    try {
      if (fs.existsSync(MEMORY_FILE)) {
        const corruptPath = `${MEMORY_FILE}.corrupt-${Date.now()}`;
        fs.renameSync(MEMORY_FILE, corruptPath);
        console.warn(`[Memory] Archivo corrupto preservado en: ${corruptPath}`);
      }
    } catch {}
  }

  inMemoryData = {
    knownUsers: {},
    learnedFacts: [],
    totalInteractions: 0
  };
  return inMemoryData;
}

// Escritura serializada y atómica
async function commitMemoryToFile() {
  if (!inMemoryData || isSaving) return;
  isSaving = true;

  try {
    // Podar por inactividad (lastSeen más antiguo) si supera MAX_KNOWN_USERS
    const userKeys = Object.keys(inMemoryData.knownUsers);
    if (userKeys.length > MAX_KNOWN_USERS) {
      const sorted = userKeys.sort((a, b) => {
        const aTime = inMemoryData.knownUsers[a].lastSeen || 0;
        const bTime = inMemoryData.knownUsers[b].lastSeen || 0;
        return aTime - bTime; // Los más inactivos primero
      });

      const toRemove = userKeys.length - MAX_KNOWN_USERS;
      for (let i = 0; i < toRemove; i++) {
        delete inMemoryData.knownUsers[sorted[i]];
      }
    }

    if (inMemoryData.learnedFacts.length > MAX_LEARNED_FACTS) {
      inMemoryData.learnedFacts = inMemoryData.learnedFacts.slice(-MAX_LEARNED_FACTS);
    }

    const jsonStr = JSON.stringify(inMemoryData, null, 2);
    await fs.promises.writeFile(TMP_FILE, jsonStr, 'utf-8');
    await fs.promises.rename(TMP_FILE, MEMORY_FILE);
  } catch (err) {
    console.error('[Memory] Error en commitMemoryToFile:', err.message);
  } finally {
    isSaving = false;
    firstSaveScheduledTime = 0;
  }
}

// Guardado sincrónico de emergencia para SIGINT / SIGTERM
export function flushMemorySync() {
  if (!inMemoryData) return;
  try {
    if (saveTimer) clearTimeout(saveTimer);
    const jsonStr = JSON.stringify(inMemoryData, null, 2);
    fs.writeFileSync(TMP_FILE, jsonStr, 'utf-8');
    fs.renameSync(TMP_FILE, MEMORY_FILE);
    console.log('[Memory] Memoria guardada exitosamente al cerrar proceso.');
  } catch (err) {
    console.error('[Memory] Error en flushMemorySync:', err.message);
  }
}

// Manejadores de apagado del proceso
process.on('SIGINT', () => {
  flushMemorySync();
  process.exit(0);
});
process.on('SIGTERM', () => {
  flushMemorySync();
  process.exit(0);
});

// Guardado con throttle y maxWait para evitar aplazamiento indefinido
export function scheduleSaveMemory() {
  const now = Date.now();
  if (!firstSaveScheduledTime) firstSaveScheduledTime = now;

  if (saveTimer) clearTimeout(saveTimer);

  // Si pasaron más de MAX_WAIT_MS desde la primera solicitud, forzar guardado inmediato
  if (now - firstSaveScheduledTime >= MAX_WAIT_MS) {
    commitMemoryToFile();
    return;
  }

  saveTimer = setTimeout(() => {
    commitMemoryToFile();
  }, DEBOUNCE_MS);
}

export function recordUserInteraction(userId, cleanName) {
  const mem = loadMemory();
  const now = Date.now();

  if (!mem.knownUsers[userId]) {
    mem.knownUsers[userId] = {
      name: cleanName,
      notes: [],
      interactionsCount: 0,
      lastSeen: now
    };
  }
  mem.knownUsers[userId].name = cleanName;
  mem.knownUsers[userId].lastSeen = now;
  mem.knownUsers[userId].interactionsCount = (mem.knownUsers[userId].interactionsCount || 0) + 1;
  mem.totalInteractions = (mem.totalInteractions || 0) + 1;

  scheduleSaveMemory();
  return mem.knownUsers[userId];
}

// Validación estricta anti-inyección para hechos aprendidos
const FORBIDDEN_FACT_PATTERNS = [
  /ignora/i,
  /olvida/i,
  /siempre/i,
  /nunca/i,
  /regla/i,
  /token/i,
  /password/i,
  /admin/i,
  /permiso/i,
  /prompt/i,
  /modo/i,
  /dan\b/i
];

export function addLearnedFact(userId, fact) {
  const mem = loadMemory();
  if (!fact || typeof fact !== 'string' || fact.length < 5 || fact.length > 120) return;

  const cleanFact = fact.replace(/[\[\]\r\n`]/g, '').trim();

  // Filtrar intentos de inyección
  for (const pattern of FORBIDDEN_FACT_PATTERNS) {
    if (pattern.test(cleanFact)) {
      return;
    }
  }

  // Los hechos solo se asignan al perfil personal del usuario para evitar contaminar el prompt global
  if (userId && mem.knownUsers[userId]) {
    const userNotes = mem.knownUsers[userId].notes || [];
    if (!userNotes.includes(cleanFact)) {
      userNotes.push(cleanFact);
      if (userNotes.length > MAX_NOTES_PER_USER) userNotes.shift();
      mem.knownUsers[userId].notes = userNotes;
      scheduleSaveMemory();
    }
  }
}

// Comando /olvidame: Derecho al olvido y privacidad de datos
export function forgetUser(userId) {
  const mem = loadMemory();
  if (mem.knownUsers[userId]) {
    delete mem.knownUsers[userId];
    scheduleSaveMemory();
    return true;
  }
  return false;
}

export function getMemoryStats() {
  const mem = loadMemory();
  return {
    totalUsers: Object.keys(mem.knownUsers || {}).length,
    totalInteractions: mem.totalInteractions || 0,
    totalLearnedFacts: (mem.learnedFacts || []).length
  };
}
