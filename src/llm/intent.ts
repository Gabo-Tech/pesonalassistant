/**
 * Cheap gate so greetings skip grammar-constrained tool decoding.
 * A miss sends the utterance to the slower tool prompt, which can still answer.
 */

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Personal questions answered from known facts, not tools. */
const FACT_QUESTION =
  /^(what('s| is) my (name|age)|whats my (name|age)|who am i|how old am i|where do i live|where am i from|what do you know about me|como me llamo|cual es mi nombre|cuantos anos tengo|que edad tengo|donde vivo|que sabes de mi)\b/;

const TASK_PATTERNS: RegExp[] = [
  /\b(remind|reminder|recordatorio|recuerdame)\b/,
  /\b(alarm|alarma|wake me|despiertame)\b/,
  /\b(note|notes|nota|anota|apunta)\b/,
  /\b(write (this|that) down|toma nota)\b/,
  /\b(whatsapp|whats app|signal|tweet|twitter)\b/,
  /\bpublish\b/,
  /\bpost on\b/,
  /\bpost to\b/,
  /\bon (?:x|twitter)\b/,
  /\b(message|mensaje)\b/,
  /\b(call|llama|llamar|llamada)\b/,
  /\b(calendar|calendario|agenda|event|evento|meeting|reunion|cita|appointment|schedule|reschedule|reprograma)\b/,
  /\b(move|change|edit|send|mueve|cambia|edita|envia)\b/,
  /\b(task|tasks|tarea|tareas|to-do)\b/,
  /\bwrite down\b/,
  /\b(contact|contacto)\b/,
  /\b(search|busca|buscar)\b/,
  /\b(weather|forecast|clima|precio|price|news|noticia)\b/,
  /\bque tiempo hace\b/,
  /\b(my week|this week|next week|mi semana|esta semana|la semana que viene)\b/,
  /\b(how is my day|how's my day|como va (mi |el )?dia|que tengo hoy|que tengo manana)\b/,
  /^(please |por favor )?(remember|recuerda|forget|olvida)\b/,
  /^(please |por favor )?(add|create|schedule|delete|cancel|remove|list|show|set|put|anade|agrega|crea|programa|borra|cancela|elimina|lista|muestra|pon)\b/,
  /\btell\b(?!\s+me\b)/,
  /\btext\s+\S+/,
];

export function looksLikeTask(userText: string): boolean {
  const text = fold(userText);
  if (!text) return false;
  if (FACT_QUESTION.test(text)) return false;
  return TASK_PATTERNS.some((pattern) => pattern.test(text));
}
