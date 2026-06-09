import type { Offer, PaymentReceipt, UserProfile } from '../types';

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function downloadBlob(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function tableHtml(title: string, headers: string[], rows: unknown[][]) {
  return `<h2>${escapeHtml(title)}</h2><table border="1"><thead><tr>${headers
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join('')}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

export function exportTreasuryWorkbook(params: {
  receipts: PaymentReceipt[];
  offers: Offer[];
}) {
  const receiptRows = params.receipts.map((r) => [
    r.user_name,
    r.user_email,
    r.user_whatsapp || '',
    r.type,
    r.status,
    Number(r.amount || 0).toFixed(2),
    r.file_name,
    r.uploaded_at,
    r.reviewed_at || '',
    r.observations || '',
  ]);

  const offerRows = params.offers.map((o) => [
    o.user_name,
    o.user_email || '',
    o.objective,
    o.method,
    o.status,
    Number(o.amount || 0).toFixed(2),
    o.created_at,
    o.reviewed_at || '',
    o.notes || '',
  ]);

  const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body>${tableHtml(
    'Comprovantes',
    ['Nome', 'E-mail', 'WhatsApp', 'Tipo', 'Status', 'Valor', 'Arquivo', 'Enviado em', 'Revisado em', 'Observações'],
    receiptRows
  )}<br/>${tableHtml(
    'Ofertas',
    ['Nome', 'E-mail', 'Objetivo', 'Método', 'Status', 'Valor', 'Criado em', 'Revisado em', 'Observações'],
    offerRows
  )}</body></html>`;

  downloadBlob('tesouraria-forjados.xls', html, 'application/vnd.ms-excel;charset=utf-8');
}

export function exportTeamWorkbook(profiles: UserProfile[]) {
  const rows = profiles.map((p) => [
    p.member_id || '',
    p.display_name,
    p.email,
    p.phone || '',
    p.birth_date || '',
    p.city || '',
    p.neighborhood || '',
    p.role,
    p.inscription_status,
    p.primary_team || '',
    (p.sectors || []).join(', '),
    p.shirt_size || '',
    p.retreat_count_manual ?? p.retreat_count ?? 0,
    p.food_restrictions || '',
    p.health_problems || '',
    p.continuous_medicine || '',
    p.photo_url || '',
  ]);

  const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body>${tableHtml(
    'Ficha da equipe FORJADOS',
    ['ID', 'Nome', 'E-mail', 'Telefone', 'Nascimento', 'Cidade', 'Bairro', 'Cargo', 'Status', 'Equipe principal', 'Setores', 'Camisa', 'Retiros', 'Restrição alimentar', 'Saúde', 'Medicação', 'Foto'],
    rows
  )}</body></html>`;

  downloadBlob('ficha-equipe-forjados.xls', html, 'application/vnd.ms-excel;charset=utf-8');
}

export function printProfileFicha(profile: UserProfile) {
  const popup = window.open('', '_blank', 'width=900,height=700');
  if (!popup) return;
  const rows: Array<[string, unknown]> = [
    ['ID FORJADOS', profile.member_id || ''],
    ['Nome', profile.display_name],
    ['E-mail', profile.email],
    ['Telefone', profile.phone || ''],
    ['Nascimento', profile.birth_date || ''],
    ['Cidade/Bairro', `${profile.city || ''} / ${profile.neighborhood || ''}`],
    ['Cargo', profile.role],
    ['Status', profile.inscription_status],
    ['Equipe principal', profile.primary_team || ''],
    ['Setores', (profile.sectors || []).join(', ')],
    ['Tamanho camisa', profile.shirt_size || ''],
    ['Retiros participados', profile.retreat_count_manual ?? profile.retreat_count ?? 0],
    ['Restrição alimentar', profile.food_restrictions || ''],
    ['Saúde', profile.health_problems || ''],
    ['Medicação', profile.continuous_medicine || ''],
    ['Contato emergência', `${profile.emergency_contact?.name || ''} ${profile.emergency_contact?.phone || ''} ${profile.emergency_contact?.relationship || ''}`],
  ];

  popup.document.write(`<!doctype html><html><head><title>Ficha FORJADOS</title><style>body{font-family:Arial;padding:28px;color:#111}h1{color:#8a5d21}table{width:100%;border-collapse:collapse}td{border:1px solid #ddd;padding:10px}td:first-child{font-weight:bold;background:#f6f1e8;width:220px}img{max-width:180px;border-radius:16px;margin-bottom:18px}</style></head><body><h1>Ficha FORJADOS</h1>${profile.photo_url ? `<img src="${escapeHtml(profile.photo_url)}" />` : ''}<table>${rows.map(([k,v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join('')}</table><script>window.print()</script></body></html>`);
  popup.document.close();
}
