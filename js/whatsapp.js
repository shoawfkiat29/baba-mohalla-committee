// Builds the receipt message text and the wa.me deep link used to send it.

function normalizePhoneForWhatsApp(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 10) return '91' + digits; // assume India if no country code given
  return digits;
}

function buildReceiptMessage(payment, family, settings) {
  if (payment.type === 'advance') return buildAdvanceMessage(payment, family, settings);

  const monthsLabel = monthsListLabel(payment.year, payment.months);
  const advanceApplied = payment.advanceApplied || 0;
  const advanceAdded = payment.advanceAdded || 0;
  const cashCollected = cashCollectedOf(payment);

  const lines = [
    `Asalamualaikum ${family.headName} Ji,`,
    '',
    `Payment receipt - ${settings.committeeName}`,
    `Receipt No: ${payment.receiptNo}`,
    `Date: ${formatDateForDisplay(payment.paidOn)}`,
    `Family Members: ${payment.membersAtPayment}`,
    `Months Paid: ${monthsLabel}`,
    `Rate: ${formatCurrency(payment.ratePerMember)} / member / month`,
    `Dues Amount: ${formatCurrency(payment.amount)}`
  ];
  if (advanceApplied > 0) {
    lines.push(`Advance Used: ${formatCurrency(advanceApplied)}`);
  }
  if (advanceAdded > 0) {
    lines.push(`Extra Added to Advance: ${formatCurrency(advanceAdded)}`);
  }
  lines.push(`Amount Collected: ${formatCurrency(cashCollected)}`);
  if (typeof payment.newAdvanceBalance === 'number') {
    lines.push(`Remaining Advance Balance: ${formatCurrency(payment.newAdvanceBalance)}`);
  }
  if (payment.note) {
    lines.push(`Note: ${payment.note}`);
  }
  lines.push('', 'Thank you for your contribution.', `- ${settings.committeeName}`);
  return lines.join('\n');
}

function buildAdvanceMessage(advance, family, settings) {
  const lines = [
    `Asalamualaikum ${family.headName} Ji,`,
    '',
    `Advance receipt - ${settings.committeeName}`,
    `Receipt No: ${advance.receiptNo}`,
    `Date: ${formatDateForDisplay(advance.paidOn)}`,
    `Amount Received: ${formatCurrency(advance.amount)}`
  ];
  if (typeof advance.newAdvanceBalance === 'number') {
    lines.push(`Total Advance Balance: ${formatCurrency(advance.newAdvanceBalance)}`);
  }
  lines.push('This will be automatically adjusted against your dues in the coming months.');
  if (advance.note) {
    lines.push(`Note: ${advance.note}`);
  }
  lines.push('', 'Thank you for your contribution.', `- ${settings.committeeName}`);
  return lines.join('\n');
}

function buildWhatsAppLink(phone, message) {
  const normalized = normalizePhoneForWhatsApp(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
