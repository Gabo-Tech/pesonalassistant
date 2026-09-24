/**
 * Keyword router used when no GGUF is loaded yet.
 *
 * Small models are the real brain; this is a teaching / fallback layer so you can
 * exercise notes, reminders, and drafts from typed commands without a 1 GB download.
 */

import type { Locale } from '../i18n/wake';
import type { AssistantReply } from './tools';

/** Spoken color words. Canonical names match parseNoteMark in src/notes/organize.ts. */
const COLOR_WORDS: Record<string, string> = {
  amber: 'amber',
  yellow: 'amber',
  gold: 'amber',
  amarillo: 'amber',
  ambar: 'amber',
  sage: 'sage',
  green: 'sage',
  verde: 'sage',
  sky: 'sky',
  blue: 'sky',
  azul: 'sky',
  rose: 'rose',
  pink: 'rose',
  red: 'rose',
  rosa: 'rose',
  rojo: 'rose',
  clear: 'clear',
};

function canonicalColor(raw: string): string | null {
  const key = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return COLOR_WORDS[key] ?? null;
}

function say(locale: Locale, english: string, spanish: string): string {
  return locale === 'es' ? spanish : english;
}

const remembered = (locale: Locale) => say(locale, 'I will remember that.', 'Lo recordaré.');

function organizeNote(text: string, locale: Locale): AssistantReply | null {
  const filedCreate = text.match(/^(?:note|save a note|make a note)\s+in\s+(.+?)\s+that\s+(.+)$/i);
  if (filedCreate) {
    const folder = filedCreate[1].trim();
    const body = filedCreate[2].trim();
    return {
      say: say(locale, `Saved note in ${folder}.`, `Nota guardada en ${folder}.`),
      action: { tool: 'create_note', title: body.slice(0, 80), text: body, query: folder },
    };
  }

  const filedCreateEs = text.match(/^(?:anota|apunta|toma nota)\s+en\s+(.+?)\s+que\s+(.+)$/i);
  if (filedCreateEs) {
    const folder = filedCreateEs[1].trim();
    const body = filedCreateEs[2].trim();
    return {
      say: say(locale, `Saved note in ${folder}.`, `Nota guardada en ${folder}.`),
      action: { tool: 'create_note', title: body.slice(0, 80), text: body, query: folder },
    };
  }

  const file = text.match(
    /^(?:put|move|file)\s+(?:the\s+)?(.+?)\s+note\s+(?:in|into|to)(?:\s+the)?(?:\s+folder)?\s+(.+)$/i,
  );
  if (file) {
    return {
      say: say(locale, `Filed "${file[1].trim()}" in ${file[2].trim()}.`, `Nota "${file[1].trim()}" en ${file[2].trim()}.`),
      action: { tool: 'file_note', title: file[1].trim(), text: file[2].trim() },
    };
  }

  const fileEs = text.match(
    /^(?:pon|mueve|archiva)\s+(?:la\s+)?nota\s+(?:de\s+|del\s+)?(.+?)\s+(?:en|a)(?:\s+la)?(?:\s+carpeta)?\s+(.+)$/i,
  );
  if (fileEs) {
    return {
      say: say(
        locale,
        `Filed "${fileEs[1].trim()}" in ${fileEs[2].trim()}.`,
        `Nota "${fileEs[1].trim()}" en ${fileEs[2].trim()}.`,
      ),
      action: { tool: 'file_note', title: fileEs[1].trim(), text: fileEs[2].trim() },
    };
  }

  const colored = text.match(
    /^(?:highlight|mark)\s+(?:the\s+)?(.+?)\s+note\s+(amber|yellow|gold|sage|green|sky|blue|rose|pink|red|clear)$/i,
  );
  if (colored) {
    const color = canonicalColor(colored[2]);
    if (!color) return null;
    return {
      say: say(locale, `Marked "${colored[1].trim()}".`, `Nota "${colored[1].trim()}" marcada.`),
      action: { tool: 'mark_note', title: colored[1].trim(), text: color },
    };
  }

  const coloredEs = text.match(
    /^(?:marca|destaca)\s+(?:la\s+)?nota\s+(?:de\s+|del\s+)?(.+?)\s+(?:de\s+|en\s+)?(amarillo|ambar|ámbar|verde|azul|rosa|rojo)$/i,
  );
  if (coloredEs) {
    const color = canonicalColor(coloredEs[2]);
    if (!color) return null;
    return {
      say: say(locale, `Marked "${coloredEs[1].trim()}".`, `Nota "${coloredEs[1].trim()}" marcada.`),
      action: { tool: 'mark_note', title: coloredEs[1].trim(), text: color },
    };
  }

  const pin = text.match(/^(?:unpin|pin|highlight)\s+(?:the\s+)?(.+?)\s+note$/i);
  if (pin) {
    const unpin = /^unpin/i.test(text);
    return {
      say: say(
        locale,
        unpin ? `Unpinned "${pin[1].trim()}".` : `Pinned "${pin[1].trim()}".`,
        unpin ? `Nota "${pin[1].trim()}" desfijada.` : `Nota "${pin[1].trim()}" fijada.`,
      ),
      action: { tool: 'mark_note', title: pin[1].trim(), text: unpin ? 'unpin' : 'pin' },
    };
  }

  const pinEs = text.match(/^(?:desfija|fija|destaca)\s+(?:la\s+)?nota\s+(?:de\s+|del\s+)?(.+)$/i);
  if (pinEs) {
    const unpin = /^desfija/i.test(text);
    return {
      say: say(
        locale,
        unpin ? `Unpinned "${pinEs[1].trim()}".` : `Pinned "${pinEs[1].trim()}".`,
        unpin ? `Nota "${pinEs[1].trim()}" desfijada.` : `Nota "${pinEs[1].trim()}" fijada.`,
      ),
      action: { tool: 'mark_note', title: pinEs[1].trim(), text: unpin ? 'unpin' : 'pin' },
    };
  }

  return null;
}

const POLITE = /^(?:please|can you|could you|por favor|puedes|podrias|podrías)\b[\s,]*/i;

/** So "can you remind me…" hits the same parsers as "remind me…". */
function stripPolite(raw: string): string {
  let text = raw.trim();
  for (let i = 0; i < 3; i += 1) {
    const next = text.replace(POLITE, '').trim();
    if (next === text) break;
    text = next;
  }
  return text;
}

export function matchCommand(userText: string, locale: Locale = 'en'): AssistantReply | null {
  const text = stripPolite(userText);
  const lower = text.toLowerCase();

  const packed = text.match(
    /^i(?:'m| am)\s+(.+?)\s+and\s+i(?:'m| am)\s+(\d+)(?:\s+years?\s+old)?\.?$/i,
  );
  if (packed) {
    return {
      say: remembered(locale),
      action: {
        tool: 'remember_fact',
        title: 'identity',
        text: `Name ${packed[1].trim()}, age ${packed[2]}`,
      },
    };
  }

  const named = text.match(/^my name is\s+(.+)/i);
  if (named) {
    return {
      say: remembered(locale),
      action: { tool: 'remember_fact', title: 'identity', text: `Name ${named[1].trim()}` },
    };
  }

  const aged = text.match(/^i(?:'m| am)\s+(\d+)(?:\s+years?\s+old)\.?$/i);
  if (aged) {
    return {
      say: remembered(locale),
      action: { tool: 'remember_fact', title: 'identity', text: `Age ${aged[1]}` },
    };
  }

  const rememberMe = text.match(/^(?:remember(?: that)?)\s+(i(?:'m| am)\s+.+)/i);
  if (rememberMe) {
    return {
      say: remembered(locale),
      action: { tool: 'remember_fact', title: 'identity', text: rememberMe[1].trim() },
    };
  }

  const forget = text.match(/^(?:forget|stop remembering)\s+(?:my\s+)?(.+)/i);
  if (forget) {
    return {
      say: say(locale, `Forgotten ${forget[1].trim()}.`, `Olvidado ${forget[1].trim()}.`),
      action: { tool: 'forget_fact', title: forget[1].trim() },
    };
  }

  const soy = text.match(
    /^soy\s+(.+?)\s+y\s+tengo\s+(\d+)(?:\s+años)?\.?$/i,
  );
  if (soy) {
    return {
      say: remembered(locale),
      action: {
        tool: 'remember_fact',
        title: 'identity',
        text: `Name ${soy[1].trim()}, age ${soy[2]}`,
      },
    };
  }

  const meLlamo = text.match(/^me llamo\s+(.+)/i);
  if (meLlamo) {
    return {
      say: remembered(locale),
      action: { tool: 'remember_fact', title: 'identity', text: `Name ${meLlamo[1].trim()}` },
    };
  }

  const tengo = text.match(/^tengo\s+(\d+)(?:\s+años)\.?$/i);
  if (tengo) {
    return {
      say: remembered(locale),
      action: { tool: 'remember_fact', title: 'identity', text: `Age ${tengo[1]}` },
    };
  }

  const olvida = text.match(/^(?:olvida|deja de recordar)\s+(?:mi\s+)?(.+)/i);
  if (olvida) {
    return {
      say: say(locale, `Forgotten ${olvida[1].trim()}.`, `Olvidado ${olvida[1].trim()}.`),
      action: { tool: 'forget_fact', title: olvida[1].trim() },
    };
  }

  const organized = organizeNote(text, locale);
  if (organized) return organized;

  const note = lower.match(/^(?:note that|make a note|remember that)\s+(.+)/i);
  if (note) {
    const body = text.slice(text.length - note[1].length);
    return {
      say: say(locale, `Saved note "${body.slice(0, 80)}".`, `Nota guardada "${body.slice(0, 80)}".`),
      action: { tool: 'create_note', title: body.slice(0, 80), text: body },
    };
  }

  const bareNote = lower.match(/^(?:note|save a note)\s+(?!that\b)(.+)/i);
  if (bareNote) {
    const body = text.slice(text.length - bareNote[1].length);
    return {
      say: say(locale, `Saved note "${body.slice(0, 80)}".`, `Nota guardada "${body.slice(0, 80)}".`),
      action: { tool: 'create_note', title: body.slice(0, 80), text: body },
    };
  }

  const anota = lower.match(/^(?:anota(?: que)?|apunta(?: que)?|toma nota(?: de)?)\s+(.+)/i);
  if (anota) {
    const body = text.slice(text.length - anota[1].length);
    return {
      say: say(locale, `Saved note "${body.slice(0, 80)}".`, `Nota guardada "${body.slice(0, 80)}".`),
      action: { tool: 'create_note', title: body.slice(0, 80), text: body },
    };
  }

  const alarm = text.match(
    /^(?:set (?:an? )?alarm|wake me(?: up)?)\s+(?:for\s+)?(.+)/i,
  );
  if (alarm) {
    return {
      say: say(locale, `Alarm set for ${alarm[1].trim()}.`, `Alarma a las ${alarm[1].trim()}.`),
      action: { tool: 'create_alarm', when: alarm[1].trim() },
    };
  }

  const alarma = text.match(
    /^(?:pon(?:me)?(?: una)? alarma|despi[eé]rtame|alarma)\s+(?:a las\s+|para\s+|a\s+)?(.+)/i,
  );
  if (alarma) {
    return {
      say: say(locale, `Alarm set for ${alarma[1].trim()}.`, `Alarma a las ${alarma[1].trim()}.`),
      action: { tool: 'create_alarm', when: alarma[1].trim() },
    };
  }

  if (/\b(list alarms|what alarms|any alarms)\b/.test(lower) || /\b(qu[eé] alarmas|lista(?:r)? alarmas)\b/.test(lower)) {
    return { say: say(locale, 'Checking alarms.', 'Revisando alarmas.'), action: { tool: 'list_alarms' } };
  }

  const cancelAlarm =
    text.match(/^(?:cancel|delete|turn off)\s+(?:the\s+)?alarm(?:\s+(?:for|at)\s+)?(.+)/i) ??
    text.match(/^(?:cancel|delete|turn off)\s+(?:the\s+)?(.+?)\s+alarms?$/i) ??
    text.match(/^(?:cancela|borra|apaga)\s+(?:la\s+)?alarma(?:\s+(?:de las|a las|de)\s+)?(.+)/i);
  if (cancelAlarm) {
    return {
      say: say(locale, 'Alarm cancelled.', 'Alarma cancelada.'),
      action: { tool: 'cancel_alarm', text: cancelAlarm[1].trim() },
    };
  }

  const remind = lower.match(
    /^(?:remind me(?: to)?|set a reminder(?: to)?)\s+(.+)/i,
  );
  if (remind) {
    return reminderReply(text, remind[1], locale);
  }

  const recuerdame = lower.match(/^(?:recu[eé]rdame(?: que)?|pon un recordatorio(?: de| para)?)\s+(.+)/i);
  if (recuerdame) {
    return reminderReply(text, recuerdame[1], locale);
  }

  const task = text.match(/^(?:add|create|new)\s+(?:an?\s+)?(?:(important)\s+)?task(?:\s+to)?\s+(.+)/i);
  if (task) return taskReply(task[2], locale, Boolean(task[1]));

  const tarea = text.match(
    /^(?:a[nñ]ade|agrega|crea|nueva)\s+(?:una\s+)?(?:(importante)\s+)?tarea(?:\s+(?:de|para))?\s+(.+)/i,
  );
  if (tarea) return taskReply(tarea[2], locale, Boolean(tarea[1]));

  const finished = text.match(/^(?:i finished|i'?m done with|done with|completed)\s+(.+)/i)
    ?? text.match(/^(?:termin[eé]|he terminado|ya hice|ya termin[eé])\s+(?:de\s+|con\s+)?(.+)/i);
  if (finished) {
    return {
      say: say(locale, 'Marked done.', 'Marcado como hecho.'),
      action: { tool: 'complete_task', text: finished[1].trim() },
    };
  }

  if (
    /^(?:what(?:'s| is) left|what tasks|list tasks|any tasks)$/i.test(lower) ||
    /^(?:qu[eé] me queda|qu[eé] tareas|lista(?:r)? tareas)$/i.test(lower)
  ) {
    return { say: say(locale, 'Checking tasks.', 'Revisando tareas.'), action: { tool: 'list_tasks' } };
  }

  const deleteTask = text.match(/^(?:delete|remove)\s+(?:the\s+)?task\s+(.+)/i)
    ?? text.match(/^(?:borra|elimina)\s+(?:la\s+)?tarea\s+(.+)/i);
  if (deleteTask) {
    return {
      say: say(locale, 'Task deleted.', 'Tarea eliminada.'),
      action: { tool: 'delete_task', query: deleteTask[1].trim() },
    };
  }

  const event = lower.match(/^(?:add|create|schedule)\s+(?:an?\s+)?(?:event|meeting)\s+(.+)/i);
  if (event) {
    return eventReply(text, event[1], locale);
  }

  const evento = lower.match(
    /^(?:a[nñ]ade|agrega|crea|programa)\s+(?:un(?:a)?\s+)?(?:evento|reuni[oó]n)\s+(.+)/i,
  );
  if (evento) {
    return eventReply(text, evento[1], locale);
  }

  const contact = text.match(/^(?:add|save)(?: a)? contact\s+(.+)/i)
    ?? text.match(/^(?:a[nñ]ade|agrega)(?: a)? contacto\s+(.+)/i)
    ?? text.match(/^(?:a[nñ]ade|agrega) a\s+([A-Za-zÁÉÍÓÚáéíóúñ].+)$/i);
  if (contact && !/\b(evento|event|reuni[oó]n|meeting|nota|note|tarea|task)\b/i.test(contact[1])) {
    return contactReply(contact[1], locale);
  }

  const message = text.match(/^(?:message|text)\s+(.+?)\s+(?:that\s+)?(.+)$/i)
    ?? text.match(/^(?:dile a|mensaje a|m[aá]ndale a|mandale a)\s+(.+?)\s+que\s+(.+)$/i);
  if (message && !/whatsapp|signal/i.test(text)) {
    return {
      say: say(locale, `Message for ${message[1].trim()}.`, `Mensaje para ${message[1].trim()}.`),
      action: { tool: 'message_contact', recipient: message[1].trim(), text: message[2].trim() },
    };
  }

  const call = text.match(/^(?:call)\s+(.+)$/i) ?? text.match(/^(?:llama(?:r)? a)\s+(.+)$/i);
  if (call) {
    return {
      say: say(locale, `Call ${call[1].trim()}?`, `¿Llamar a ${call[1].trim()}?`),
      action: { tool: 'call_contact', recipient: call[1].trim() },
    };
  }

  const deleteContact = text.match(/^(?:delete|remove)(?: the)? contact\s+(.+)/i)
    ?? text.match(/^(?:borra|elimina)(?: el)? contacto\s+(.+)/i);
  if (deleteContact) {
    return {
      say: say(locale, 'Contact deleted.', 'Contacto eliminado.'),
      action: { tool: 'delete_contact', title: deleteContact[1].trim() },
    };
  }

  const calendarLine = lower.match(/^(?:add|put)\s+(.+?)\s+(?:on|to)\s+(?:my\s+)?(?:calendar|agenda)$/i);
  if (calendarLine) return eventReply(text, calendarLine[1], locale);

  const calendario = lower.match(/^(?:a[nñ]ade|agrega)\s+(.+?)\s+al calendario$/i);
  if (calendario) return eventReply(text, calendario[1], locale);

  if (
    /\b(what(?:'s| is) on my (?:calendar|agenda)|list events|any events)\b/.test(lower) ||
    /\b(qu[eé] hay(?: ma[nñ]ana)?|qu[eé] hay en el calendario|lista eventos)\b/.test(lower)
  ) {
    const when = /\b(ma[nñ]ana|tomorrow)\b/.test(lower) ? 'tomorrow' : 'today';
    return { say: say(locale, 'Checking the calendar.', 'Revisando el calendario.'), action: { tool: 'list_events', when } };
  }

  if (/\b(list reminders|what reminders|any reminders)\b/.test(lower) || /\b(qu[eé] recordatorios|lista recordatorios)\b/.test(lower)) {
    return { say: say(locale, 'Checking reminders.', 'Revisando recordatorios.'), action: { tool: 'list_reminders' } };
  }

  const brief = matchBrief(lower);
  if (brief) {
    return {
      say: say(locale, 'Here is the summary.', 'Este es el resumen.'),
      action: { tool: 'brief', when: brief },
    };
  }

  const search = lower.match(/^(?:search notes|find notes?|look up notes?)\s+(.+)/i)
    ?? lower.match(/^(?:busca(?:r)? notas|encuentra notas)\s+(.+)/i);
  if (search) {
    return { say: say(locale, 'Searching notes.', 'Buscando notas.'), action: { tool: 'search_notes', query: search[1] } };
  }

  const deleteNote = lower.match(/^(?:delete|remove)\s+(?:the\s+)?note(?:\s+(?:called|named))?\s+(.+)/i)
    ?? lower.match(/^(?:borra|elimina)\s+(?:la\s+)?nota(?:\s+(?:llamada|de))?\s+(.+)/i);
  if (deleteNote) {
    return {
      say: say(locale, 'Note deleted.', 'Nota eliminada.'),
      action: { tool: 'delete_note', query: deleteNote[1] },
    };
  }

  const wa = matchShare(text, /whatsapp|whats app/);
  if (wa) {
    return {
      say: say(
        locale,
        `WhatsApp draft is ready. Say send or cancel.`,
        `Borrador de WhatsApp listo. Di enviar o cancelar.`,
      ),
      action: { tool: 'draft_whatsapp', recipient: wa.recipient, text: wa.body },
    };
  }

  const signal = matchShare(text, /signal/);
  if (signal) {
    return {
      say: say(
        locale,
        `Signal draft is ready. Say send or cancel.`,
        `Borrador de Signal listo. Di enviar o cancelar.`,
      ),
      action: { tool: 'draft_signal', recipient: signal.recipient, text: signal.body },
    };
  }

  const edited = editCommand(text, locale);
  if (edited) return edited;

  const tweet = lower.match(/^(?:tweet|post on (?:x|twitter)|publish on (?:x|twitter))\s+(.+)/i);
  if (tweet) {
    return {
      say: say(locale, 'X draft is ready. Say send or cancel.', 'Borrador de X listo. Di enviar o cancelar.'),
      action: { tool: 'draft_tweet', text: text.slice(text.length - tweet[1].length) },
    };
  }

  return null;
}

export function fallbackAsk(userText: string, locale: Locale = 'en'): AssistantReply {
  return (
    matchCommand(userText, locale) ?? {
      say: say(
        locale,
        'No on-device model is loaded yet. Download one in Settings, or try: "note that …", "set an alarm for 7am", "remind me to … tomorrow at 9", "WhatsApp Marie I\'m late", "tweet …".',
        'Aún no hay un modelo en el teléfono. Descárgalo en Ajustes, o prueba: "anota que …", "pon una alarma a las 7", "recuérdame … mañana a las 9", "WhatsApp a Marie llego tarde".',
      ),
    }
  );
}

function reminderReply(_text: string, rest: string, locale: Locale): AssistantReply {
  const anchored = rest.match(
    /^(.*?)\s+((?:right|just)\s+after|after|justo\s+despu[eé]s\s+de|despu[eé]s\s+de|tras)\s+(.+)$/i,
  );
  if (anchored?.[1].trim()) {
    return {
      say: say(
        locale,
        `Reminder set for right after ${anchored[3].trim()}.`,
        `Recordatorio justo después de ${anchored[3].trim()}.`,
      ),
      action: { tool: 'create_reminder', text: anchored[1].trim(), when: `${anchored[2]} ${anchored[3]}`.trim() },
    };
  }

  const whenMatch = rest.match(
    /\b(in\s+\d+\s+\w+|en\s+\d+\s+\w+|tomorrow(?:\s+at\s+.+)?|ma[nñ]ana(?:\s+a las\s+.+)?|tonight(?:\s+at\s+.+)?|esta noche(?:\s+a las\s+.+)?|today(?:\s+at\s+.+)?|hoy(?:\s+a las\s+.+)?|at\s+\d.+$|a las\s+\d.+$|on\s+\w+.*$)\b/i,
  );
  const when = whenMatch?.[1] ?? 'in 10 minutes';
  const task = whenMatch ? rest.slice(0, whenMatch.index).trim() : rest;
  return {
    say: say(locale, `Reminder set for ${when}.`, `Recordatorio para ${when}.`),
    action: { tool: 'create_reminder', text: task || rest, when },
  };
}

function eventReply(_text: string, rest: string, locale: Locale): AssistantReply {
  const whenMatch = rest.match(
    /\b((?:every|cada|todos los|todas las|all day|todo el d[ií]a)\b.*|(?:tomorrow|ma[nñ]ana|tonight|esta noche|today|hoy|on\s+\w+|el\s+\w+|at\s+\d.+|a las\s+\d.+|in\s+\d+\s+\w+|en\s+\d+\s+\w+))/i,
  );
  const when = whenMatch?.[1] ?? 'tomorrow at 9';
  const title = whenMatch && whenMatch.index != null ? rest.slice(0, whenMatch.index).trim() : rest;
  return {
    say: say(locale, `Added "${title || rest}" on ${when}.`, `Añadido "${title || rest}" el ${when}.`),
    action: { tool: 'create_event', title: title || rest, when, duration_minutes: 60 },
  };
}

function contactReply(rest: string, locale: Locale): AssistantReply {
  const phoneMatch = rest.match(/(\+?\d[\d\s()-]{5,})\s*$/);
  const phone = phoneMatch?.[1]?.trim() ?? '';
  let body = phoneMatch && phoneMatch.index != null ? rest.slice(0, phoneMatch.index).trim() : rest.trim();
  const channelMatch = body.match(/\b(whatsapp|signal|call|llamada)\b\s*$/i);
  const preferred = channelMatch ? (channelMatch[1].toLowerCase().startsWith('llam') ? 'call' : channelMatch[1].toLowerCase()) : 'whatsapp';
  if (channelMatch && channelMatch.index != null) {
    body = body.slice(0, channelMatch.index).replace(/[,\s]+$/, '');
  }
  return {
    say: say(locale, `Saved ${body}.`, `Guardado ${body}.`),
    action: { tool: 'create_contact', title: body, text: phone, query: preferred },
  };
}

function taskReply(rest: string, locale: Locale, important: boolean): AssistantReply {
  const whenMatch = rest.match(
    /\b(tomorrow(?:\s+at\s+.+)?|ma[nñ]ana(?:\s+a las\s+.+)?|today(?:\s+at\s+.+)?|hoy(?:\s+a las\s+.+)?|tonight|esta noche|morning|noon|afternoon|evening|night|por la ma[nñ]ana|al mediod[ií]a|por la tarde|por la noche)\b/i,
  );
  const when = whenMatch?.[1];
  const title = whenMatch && whenMatch.index != null ? rest.slice(0, whenMatch.index).trim() : rest.trim();
  return {
    say: say(locale, 'Task added.', 'Tarea añadida.'),
    action: {
      tool: 'create_task',
      title: title || rest.trim(),
      when,
      priority: important ? 1 : 0,
    },
  };
}

function editPayload(rest: string): { text?: string; when?: string } {
  const when = rest.match(
    /^(?:tomorrow(?:\s+at\s+.+)?|ma[nñ]ana(?:\s+a las\s+.+)?|today(?:\s+at\s+.+)?|hoy(?:\s+a las\s+.+)?|tonight|esta noche|at\s+\d.+|a las\s+\d.+|on\s+\w+.*|el\s+\w+.*|in\s+\d+\s+\w+|en\s+\d+\s+\w+|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/i,
  );
  if (when) return { when: rest.trim() };
  return { text: rest.trim() };
}

function editCommand(text: string, locale: Locale): AssistantReply | null {
  const task = text.match(
    /^(?:change|rename|edit|move|reschedule)\s+(?:the\s+)?(.+?)\s+task\s+(?:to|for)\s+(.+)$/i,
  ) ?? text.match(
    /^(?:cambia|mueve|reprograma|edita)\s+(?:la\s+)?tarea\s+(?:de\s+|del\s+)?(.+?)\s+(?:a|para)\s+(.+)$/i,
  );
  if (task) {
    const payload = editPayload(task[2].trim());
    return {
      say: say(locale, `Updated task "${task[1].trim()}".`, `Tarea "${task[1].trim()}" actualizada.`),
      action: { tool: 'update_task', title: task[1].trim(), ...payload },
    };
  }

  const reminder = text.match(
    /^(?:change|move|reschedule|edit)\s+(?:the\s+)?(.+?)\s+reminder\s+(?:to|for)\s+(.+)$/i,
  ) ?? text.match(
    /^(?:cambia|mueve|reprograma|edita)\s+(?:el\s+)?recordatorio\s+(?:de\s+|del\s+)?(.+?)\s+(?:a|para)\s+(.+)$/i,
  );
  if (reminder) {
    const payload = editPayload(reminder[2].trim());
    return {
      say: say(locale, `Updated the ${reminder[1].trim()} reminder.`, `Recordatorio "${reminder[1].trim()}" actualizado.`),
      action: { tool: 'update_reminder', title: reminder[1].trim(), ...payload },
    };
  }

  const event = text.match(
    /^(?:move|reschedule|change|edit)\s+(?:the\s+)?(?:event\s+|appointment\s+|meeting\s+)?(.+?)\s+to\s+(.+)$/i,
  ) ?? text.match(
    /^(?:mueve|cambia|reprograma|edita)\s+(?:el\s+|la\s+)?(?:evento\s+|cita\s+|reuni[oó]n\s+)?(.+?)\s+((?:a las|al|para)\s+.+)$/i,
  );
  if (event && !/\b(task|tarea|reminder|recordatorio|note|nota)\b/i.test(event[1])) {
    return {
      say: say(locale, `Moved "${event[1].trim()}" to ${event[2].trim()}.`, `Movido "${event[1].trim()}" a ${event[2].trim()}.`),
      action: { tool: 'update_event', title: event[1].trim(), when: event[2].trim() },
    };
  }

  return null;
}

function matchBrief(lower: string): string | null {
  const text = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const how = "how(?:'s|s| is)";
  if (new RegExp(`^(?:${how} next week|what do i have next week|que tengo la semana que viene|como va la semana que viene)$`).test(text)) {
    return 'next week';
  }
  if (
    new RegExp(
      `^(?:${how} (?:my |the )?week|what(?:'s| is| do i have)(?: on)? (?:my |this )?week|como va (?:mi |la )?semana|que tengo esta semana)$`,
    ).test(text)
  ) {
    return 'this week';
  }
  if (new RegExp(`^(?:${how} tomorrow|what(?:'s| is| do i have)(?: on)? tomorrow|que tengo manana|como va manana)$`).test(text)) {
    return 'tomorrow';
  }
  if (new RegExp(`^(?:${how} today|what(?:'s| is| do i have)(?: on)? today|que tengo hoy|como va hoy)$`).test(text)) {
    return 'today';
  }
  return null;
}

function matchShare(
  text: string,
  network: RegExp,
): { recipient: string | undefined; body: string } | null {
  if (!network.test(text)) return null;

  const patterned = text.match(
    /(?:send|message|text|tell|env[ií]a|escribe|dile)\s+(.+?)\s+(?:on\s+|por\s+|en\s+)?(?:whats\s?app|signal)(?:\s+that)?\s*[:,]?\s*(.+)/i,
  );
  if (patterned) return { recipient: patterned[1].trim(), body: patterned[2].trim() };

  const alt = text.match(
    /(?:whats\s?app|signal)\s+(?:a\s+)?(.+?)\s+(?:that\s+|que\s+)?(.+)/i,
  );
  if (alt) return { recipient: alt[1].trim(), body: alt[2].trim() };

  return null;
}
