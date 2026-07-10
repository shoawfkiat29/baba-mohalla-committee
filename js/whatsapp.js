// Builds the receipt message text and the wa.me deep link used to send it.

function normalizePhoneForWhatsApp(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 10) return '91' + digits; // assume India if no country code given
  return digits;
}

function buildReceiptMessage(payment, family, settings) {
  const monthsLabel = monthsListLabel(payment.year, payment.months);
  const lines = [
    `Asalamualaikum ${family.headName} Ji,`,
    '',
    `Payment receipt - ${settings.committeeName}`,
    `Receipt No: ${payment.receiptNo}`,
    `Date: ${formatDateForDisplay(payment.paidOn)}`,
    `Family Members: ${payment.membersAtPayment}`,
    `Months Paid: ${monthsLabel}`,
    `Rate: ${formatCurrency(payment.ratePerMember)} / member / month`,
    `Total Amount: ${formatCurrency(payment.amount)}`
  ];
  if (payment.note) {
    lines.push(`Note: ${payment.note}`);
  }
  lines.push('', 'Thank you for your contribution.', `- ${settings.committeeName}`);
  return lines.join('\n');
}

function buildWhatsAppLink(phone, message) {
  const normalized = normalizePhoneForWhatsApp(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
