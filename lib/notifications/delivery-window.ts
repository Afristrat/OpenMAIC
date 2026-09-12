export interface DeliveryWindow {
  timezone: string;
  quietStart: string | null;
  quietEnd: string | null;
}

function minutes(value: string): number | null {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/u.exec(value);
  if (!match) return null;
  const [hours, mins] = value.split(':').map(Number);
  return hours * 60 + mins;
}

export function isWithinQuietWindow(at: Date, window: DeliveryWindow): boolean {
  if (!window.quietStart || !window.quietEnd || window.quietStart === window.quietEnd) return false;
  const start = minutes(window.quietStart);
  const end = minutes(window.quietEnd);
  if (start === null || end === null) throw new Error('Invalid quiet-hours clock');
  const local = new Intl.DateTimeFormat('en-GB', {
    timeZone: window.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const part = (type: 'hour' | 'minute') => Number(local.find((value) => value.type === type)?.value);
  const current = part('hour') * 60 + part('minute');
  return start < end ? current >= start && current < end : current >= start || current < end;
}
