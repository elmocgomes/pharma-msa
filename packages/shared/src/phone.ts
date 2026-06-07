export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function toWhatsAppJid(phone: string): string {
  const digits = normalizePhone(phone);
  return `${digits}@s.whatsapp.net`;
}

export function fromWhatsAppJid(jid: string): string {
  return jid.replace(/@.*$/, '');
}

export function formatBrazilianPhone(phone: string): string {
  const digits = normalizePhone(phone);
  if (digits.length === 13 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const num = digits.slice(4);
    return `+55 (${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
  }
  return phone;
}
