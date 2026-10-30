/**
 * AGENDA DO ESTÚDIO v2 — backend gratuito (Google Apps Script)
 * -------------------------------------------------------------
 * - Site de marcações (index.html) e painel do estúdio (admin.html), ambos no GitHub Pages.
 * - Profissionais, serviços, horários, folgas, feriados e definições geridos no painel (sem editar código).
 * - Cada profissional tem um Google Calendar próprio na conta do estúdio, partilhável com o e-mail dele
 *   (aparece no Google Calendar ou no Calendário do iPhone).
 * - Pedidos online entram como "⏳ PENDENTE" e são aprovados no painel ou pelo e-mail.
 *
 * Primeira configuração: 1) definirSenhaAdmin  2) setup  3) Implementar como App da Web. Ver README.
 */

/* Valores iniciais: usados apenas até guardares algo no painel. */
const DEFAULTS = {
  settings: {
    studioName: 'Estúdio Exemplo',
    address: 'Rua Exemplo 123, Lisboa',
    adminEmail: '',          // quem recebe os pedidos (vazio = conta do estúdio)
    currency: 'EUR',
    slotStep: 15,            // intervalo entre horários possíveis (min)
    minNoticeHours: 2,       // antecedência mínima para marcações online
    maxDaysAhead: 60,        // até quantos dias à frente se pode marcar
    autoConfirm: false,      // true = marcações online confirmadas sem aprovação
    siteUrl: '',             // link do site de marcações (para aparecer no painel)
  },
  services: [
    { id: 'manicure', name: 'Manicure', duration: 45, price: 15, description: 'Limpeza, cutículas e verniz.', active: true },
    { id: 'gel', name: 'Unhas de gel', duration: 90, price: 35, description: 'Aplicação ou manutenção.', active: true },
    { id: 'guitarra', name: 'Aula de guitarra', duration: 60, price: 25, description: 'Aula individual, todos os níveis.', active: true },
  ],
  professionals: [
    {
      id: 'ana', name: 'Ana Silva', role: 'Manicure', email: '', active: true, services: ['manicure', 'gel'],
      hours: { 2: [['09:00', '13:00'], ['14:00', '19:00']], 3: [['09:00', '13:00'], ['14:00', '19:00']],
               4: [['09:00', '13:00'], ['14:00', '19:00']], 5: [['09:00', '13:00'], ['14:00', '19:00']], 6: [['09:00', '14:00']] },
    },
    {
      id: 'rui', name: 'Rui Costa', role: 'Professor de música', email: '', active: true, services: ['guitarra'],
      hours: { 1: [['15:00', '21:00']], 3: [['15:00', '21:00']], 5: [['15:00', '21:00']], 6: [['10:00', '13:00']] },
    },
  ],
  closedDates: [],
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/* ============================ CONFIGURAÇÃO INICIAL ============================ */

/** 1) Escreve a senha do painel na linha abaixo, clica Executar e depois apaga-a do código. */
function definirSenhaAdmin() {
  const SENHA = ''; // ← senha do painel (mínimo 8 caracteres)
  if (String(SENHA).length < 8) throw new Error('Escreve uma senha com pelo menos 8 caracteres na linha "const SENHA".');
  setPassword_(SENHA);
  Logger.log('Senha do painel definida. Já podes apagá-la do código.');
}

/** 2) Autoriza as permissões e cria os calendários dos profissionais iniciais. */
function setup() {
  secret_();
  MailApp.getRemainingDailyQuota();
  const pros = pros_();
  pros.forEach(p => { ensureCalendar_(p); Logger.log(p.name + ' → ' + p.calendarId); });
  setStore_('professionals', pros);
  if (!prop_('ADMIN_PW')) Logger.log('⚠️ Falta definir a senha do painel: executa definirSenhaAdmin.');
  Logger.log('Pronto. Agora: Implementar → Nova implementação → App da Web.');
}

/* ============================== ENTRADAS HTTP ============================== */

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    switch (p.action) {
      case 'config':  return json_(publicConfig_());
      case 'slots':   return json_({ slots: getSlots_(p.pro, p.service, p.date, false) });
      case 'approve': return decisionPage_(p, true);
      case 'reject':  return decisionPage_(p, false);
      default:        return json_({ ok: true, studio: settings_().studioName });
    }
  } catch (err) {
    if (p.action === 'approve' || p.action === 'reject') return page_('Erro', esc_(err.message));
    return json_({ error: err.message });
  }
}

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.action === 'admin') return json_(admin_(d));
    return json_(book_(d, false));
  } catch (err) {
    return json_({ error: err.message, auth: !!err.auth });
  }
}

/* ============================== API DO PAINEL ============================== */

function admin_(d) {
  if (d.op === 'login') return login_(d.password);
  verifyToken_(d.token);

  const writes = ['saveService', 'deleteService', 'savePro', 'deletePro', 'saveSettings', 'saveClosed',
                  'setStatus', 'addBlock', 'deleteBlock', 'changePassword'];
  const lock = LockService.getScriptLock();
  if (writes.indexOf(d.op) > -1) lock.waitLock(20000);
  try {
    switch (d.op) {
      case 'getAll':         return getAll_();
      case 'saveService':    return saveService_(d.service);
      case 'deleteService':  return setActive_('services', d.id, false);
      case 'savePro':        return savePro_(d.pro);
      case 'deletePro':      return setActive_('professionals', d.id, false);
      case 'saveSettings':   return saveSettings_(d.settings);
      case 'saveClosed':     return saveClosed_(d.dates);
      case 'listBookings':   return listBookings_(d);
      case 'setStatus':      return setStatus_(d);
      case 'createBooking':  return book_(d.booking || {}, true); // book_ usa o seu próprio bloqueio
      case 'slots':          return { slots: getSlots_(d.pro, d.service, d.date, true) };
      case 'listBlocks':     return listBlocks_(d);
      case 'addBlock':       return addBlock_(d);
      case 'deleteBlock':    return deleteBlock_(d);
      case 'changePassword': return changePassword_(d);
      default: throw new Error('Operação desconhecida.');
    }
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function getAll_() {
  return { settings: settings_(), services: services_(), professionals: pros_(), closedDates: closed_(), adminEmail: adminEmail_() };
}

function saveService_(s) {
  s = s || {};
  const name = clean_(s.name, 60);
  if (!name) throw new Error('O serviço precisa de um nome.');
  const duration = Math.round(+s.duration);
  if (!(duration >= 5 && duration <= 600)) throw new Error('A duração tem de estar entre 5 e 600 minutos.');
  const price = Math.round((+s.price || 0) * 100) / 100;
  if (price < 0) throw new Error('O preço não pode ser negativo.');

  const list = services_();
  const item = {
    id: s.id || uniqueId_(name, list), name, duration, price,
    description: clean_(s.description, 200), icon: clean_(s.icon, 8), active: s.active !== false,
  };
  upsert_(list, item);
  setStore_('services', list);
  return { services: list };
}

function savePro_(p) {
  p = p || {};
  const name = clean_(p.name, 60);
  if (!name) throw new Error('O profissional precisa de um nome.');
  const email = clean_(p.email, 120).toLowerCase();
  if (email && !EMAIL_RE.test(email)) throw new Error('E-mail do profissional inválido.');
  const svcIds = services_().map(s => s.id);

  const list = pros_();
  const id = p.id || uniqueId_(name, list);
  const old = list.filter(x => x.id === id)[0] || {};
  const item = Object.assign({}, old, {
    id, name, email,
    role: clean_(p.role, 60),
    services: (p.services || []).filter(x => svcIds.indexOf(x) > -1),
    hours: normHours_(p.hours),
    active: p.active !== false,
  });

  const info = ensureCalendar_(item);
  if (old.name && old.name !== name) {
    try { CalendarApp.getCalendarById(item.calendarId).setName(calName_(item)); } catch (e) { /* sem problema */ }
  }
  upsert_(list, item);
  setStore_('professionals', list);
  return { professionals: list, info };
}

function setActive_(key, id, active) {
  const list = key === 'services' ? services_() : pros_();
  const item = list.filter(x => x.id === id)[0];
  if (!item) throw new Error('Não encontrado.');
  item.active = active;
  setStore_(key, list);
  const out = {}; out[key] = list;
  return out;
}

function saveSettings_(s) {
  s = s || {};
  const cur = settings_();
  const next = {
    studioName: clean_(s.studioName, 80) || cur.studioName,
    address: clean_(s.address, 160),
    adminEmail: clean_(s.adminEmail, 120).toLowerCase(),
    currency: /^[A-Z]{3}$/.test(s.currency || '') ? s.currency : cur.currency,
    slotStep: clampInt_(s.slotStep, 5, 120, cur.slotStep),
    minNoticeHours: clampInt_(s.minNoticeHours, 0, 720, cur.minNoticeHours),
    maxDaysAhead: clampInt_(s.maxDaysAhead, 1, 365, cur.maxDaysAhead),
    autoConfirm: !!s.autoConfirm,
    siteUrl: clean_(s.siteUrl, 200),
  };
  if (next.adminEmail && !EMAIL_RE.test(next.adminEmail)) throw new Error('E-mail de notificações inválido.');
  setStore_('settings', next);
  return { settings: next };
}

function saveClosed_(dates) {
  const list = (dates || []).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const uniq = list.filter((d, i) => list.indexOf(d) === i).sort();
  setStore_('closedDates', uniq);
  return { closedDates: uniq };
}

function changePassword_(d) {
  const stored = (prop_('ADMIN_PW') || '').split(':');
  if (sha256_(stored[0] + String(d.current || '')) !== stored[1]) throw new Error('A senha atual está incorreta.');
  if (String(d.next || '').length < 8) throw new Error('A nova senha precisa de pelo menos 8 caracteres.');
  setPassword_(d.next);
  return login_(d.next);
}

/* ---------- Marcações ---------- */

function listBookings_(q) {
  const from = parseDate_(q.from);
  const toDay = parseDate_(q.to);
  const to = new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate() + 1);
  if (to <= from) throw new Error('Período inválido.');
  if (to - from > 400 * 86400e3) throw new Error('Escolhe um período de até 400 dias.');

  const svcs = services_();
  const rows = [];
  pros_().forEach(pro => {
    if (q.pro && q.pro !== pro.id) return;
    const cal = pro.calendarId && CalendarApp.getCalendarById(pro.calendarId);
    if (!cal) return;
    cal.getEvents(from, to).forEach(ev => {
      if (!ev.getTag('status')) return;
      if (q.service && q.service !== ev.getTag('service')) return;
      rows.push(row_(ev, pro, svcs));
    });
  });
  rows.sort((a, b) => a.start - b.start);
  return { rows };
}

function row_(ev, pro, svcs) {
  const s = ev.getStartTime(), e = ev.getEndTime();
  const sid = ev.getTag('service') || '';
  const svc = svcs.filter(x => x.id === sid)[0];
  let status = ev.getTag('status');
  if (status === 'confirmed' && e.getTime() < Date.now()) status = 'done';
  const tagPrice = ev.getTag('price');
  return {
    id: ev.getId(), pro: pro.id, proName: pro.name,
    service: sid, serviceName: svc ? svc.name : sid || '—',
    name: ev.getTag('name') || '', email: ev.getTag('email') || '',
    phone: ev.getTag('phone') || '', notes: ev.getTag('notes') || '',
    date: fmt_(s, 'yyyy-MM-dd'), time: fmt_(s, 'HH:mm'), endTime: fmt_(e, 'HH:mm'),
    start: s.getTime(), end: e.getTime(),
    price: tagPrice !== null && tagPrice !== '' && !isNaN(+tagPrice) ? +tagPrice : (svc && !isNaN(+svc.price) ? +svc.price : 0),
    status, source: ev.getTag('source') || 'online',
  };
}

function setStatus_(d) {
  const pro = findPro_(d.pro);
  const ev = getCalendar_(pro).getEventById(d.id);
  if (!ev || !ev.getTag('status')) throw new Error('Marcação não encontrada (pode ter sido apagada no calendário).');
  const cur = ev.getTag('status');

  switch (d.status) {
    case 'confirmed':
      if (cur === 'pending') approve_(ev, pro);
      else if (cur === 'noshow') setBookingStatus_(ev, 'confirmed');
      break;
    case 'rejected':
      if (cur !== 'pending') throw new Error('Só é possível recusar pedidos pendentes.');
      reject_(ev, pro);
      break;
    case 'cancelled':
      cancel_(ev, pro, d.notify !== false);
      break;
    case 'noshow':
      if (ev.getEndTime() > new Date()) throw new Error('Só é possível marcar falta depois da hora da marcação.');
      setBookingStatus_(ev, 'noshow');
      break;
    default:
      throw new Error('Estado inválido.');
  }
  return { ok: true };
}

function book_(d, admin) {
  if (d.website) return { ok: true }; // armadilha anti-spam (campo escondido)
  const st = settings_();

  const name = clean_(d.name, 80);
  const email = clean_(d.email, 120).toLowerCase();
  const phone = clean_(d.phone, 30);
  const notes = clean_(d.notes, 500);
  if (!name) throw new Error('Indica o nome do cliente.');
  if ((!admin || email) && !EMAIL_RE.test(email)) throw new Error('E-mail inválido.');

  const pro = findPro_(d.pro, true);
  const svc = findService_(d.service, true);
  if (pro.services.indexOf(svc.id) === -1) throw new Error('Este serviço não está disponível com este profissional.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const force = admin && d.force;
    if (!force && getSlots_(pro.id, svc.id, d.date, admin).indexOf(d.time) === -1) {
      throw new Error('Este horário já não está disponível. Escolhe outro, por favor.');
    }
    const start = atTime_(parseDate_(d.date), d.time);
    const end = new Date(start.getTime() + svc.duration * 60e3);
    const status = admin || st.autoConfirm ? 'confirmed' : 'pending';

    const ev = getCalendar_(pro).createEvent(titleFor_(status, svc.name, name), start, end, {
      location: st.address,
      description: [
        'Cliente: ' + name, 'E-mail: ' + (email || '—'), 'Telefone: ' + (phone || '—'),
        'Serviço: ' + svc.name + ' (' + svc.duration + ' min)', 'Notas: ' + (notes || '—'),
        'Origem: ' + (admin ? 'estúdio' : 'online'),
      ].join('\n'),
    });
    const tags = { type: 'booking', status, pro: pro.id, service: svc.id, name, email, phone, notes,
                   price: String(+svc.price || 0), source: admin ? 'studio' : 'online' };
    Object.keys(tags).forEach(k => ev.setTag(k, tags[k]));
    ev.setColor(colorFor_(status));

    const when = fmtWhen_(start);
    if (status === 'pending') {
      MailApp.sendEmail({
        to: adminEmail_(), replyTo: email,
        subject: 'Novo pedido: ' + svc.name + ' com ' + pro.name + ' — ' + when,
        htmlBody: mail_('Novo pedido de marcação',
          '<b>' + esc_(name) + '</b> pediu <b>' + esc_(svc.name) + '</b> com ' + esc_(pro.name) + '<br>' + esc_(when) +
          '<br><br>E-mail: ' + esc_(email) + '<br>Telefone: ' + esc_(phone || '—') + '<br>Notas: ' + esc_(notes || '—') +
          '<br><br>' + btn_(actionUrl_('approve', pro.id, ev.getId()), 'Aprovar', '#1a7f4b') + ' &nbsp; ' +
          btn_(actionUrl_('reject', pro.id, ev.getId()), 'Recusar', '#b42318') +
          '<br><br><small>Também podes aprovar no painel do estúdio.</small>'),
      });
      MailApp.sendEmail({
        to: email, name: st.studioName,
        subject: 'Recebemos o teu pedido — ' + svc.name,
        htmlBody: mail_('Pedido recebido',
          'Olá ' + esc_(name) + ',<br><br>Recebemos o teu pedido de <b>' + esc_(svc.name) + '</b> com ' + esc_(pro.name) +
          ' para <b>' + esc_(when) + '</b>.<br>Vais receber outro e-mail assim que for confirmado.'),
      });
    } else {
      if (email) sendConfirmation_(ev, pro);
      if (!admin) {
        MailApp.sendEmail({
          to: adminEmail_(), replyTo: email,
          subject: 'Nova marcação: ' + svc.name + ' com ' + pro.name + ' — ' + when,
          htmlBody: mail_('Nova marcação confirmada',
            '<b>' + esc_(name) + '</b> marcou <b>' + esc_(svc.name) + '</b> com ' + esc_(pro.name) + '<br>' + esc_(when) +
            '<br><br>E-mail: ' + esc_(email) + '<br>Telefone: ' + esc_(phone || '—') + '<br>Notas: ' + esc_(notes || '—')),
        });
      }
    }
    return { ok: true, status, id: ev.getId() };
  } finally {
    lock.releaseLock();
  }
}

function approve_(ev, pro) {
  setBookingStatus_(ev, 'confirmed');
  if (ev.getTag('email')) sendConfirmation_(ev, pro);
}

function reject_(ev, pro) {
  const email = ev.getTag('email');
  if (email) {
    MailApp.sendEmail({
      to: email, name: settings_().studioName,
      subject: 'Sobre o teu pedido — ' + svcName_(ev),
      htmlBody: mail_('Não foi possível confirmar',
        'Olá ' + esc_(ev.getTag('name')) + ',<br><br>Infelizmente não conseguimos confirmar <b>' + esc_(svcName_(ev)) +
        '</b> para ' + esc_(fmtWhen_(ev.getStartTime())) + '. Por favor escolhe outro horário na nossa agenda.' + siteLink_()),
    });
  }
  ev.deleteEvent();
}

function cancel_(ev, pro, notify) {
  const email = ev.getTag('email');
  if (notify && email) {
    MailApp.sendEmail({
      to: email, name: settings_().studioName,
      subject: 'Marcação cancelada — ' + svcName_(ev),
      htmlBody: mail_('Marcação cancelada',
        'Olá ' + esc_(ev.getTag('name')) + ',<br><br>A tua marcação de <b>' + esc_(svcName_(ev)) + '</b> com ' + esc_(pro.name) +
        ' para ' + esc_(fmtWhen_(ev.getStartTime())) + ' foi cancelada. Para remarcar, escolhe outro horário na nossa agenda.' + siteLink_()),
    });
  }
  ev.deleteEvent();
}

function setBookingStatus_(ev, status) {
  ev.setTag('status', status);
  ev.setTitle(titleFor_(status, svcName_(ev), ev.getTag('name') || ''));
  ev.setColor(colorFor_(status));
}

function sendConfirmation_(ev, pro) {
  const st = settings_();
  const svc = svcName_(ev);
  const when = fmtWhen_(ev.getStartTime());
  MailApp.sendEmail({
    to: ev.getTag('email'), name: st.studioName,
    subject: 'Marcação confirmada — ' + svc + ', ' + when,
    htmlBody: mail_('Marcação confirmada ✅',
      'Olá ' + esc_(ev.getTag('name')) + ',<br><br>A tua marcação de <b>' + esc_(svc) + '</b> com ' + esc_(pro.name) +
      ' está confirmada para <b>' + esc_(when) + '</b>.<br>Local: ' + esc_(st.address) +
      '<br><br>' + btn_(googleCalUrl_(ev, svc, pro), 'Adicionar ao Google Calendar', '#1a73e8') +
      '<br><br><small>iPhone/Mac ou Outlook: abre o anexo <b>marcacao.ics</b> para adicionar ao calendário.</small>'),
    attachments: [Utilities.newBlob(ics_(ev, svc, pro), 'text/calendar', 'marcacao.ics')],
  });
}

function decisionPage_(p, approve) {
  const action = approve ? 'approve' : 'reject';
  if (!p.id || p.t !== token_(p.id, action)) return page_('Link inválido', 'Este link não é válido.');

  const pro = findPro_(p.pro);
  const ev = getCalendar_(pro).getEventById(p.id);
  if (!ev) return page_('Marcação não encontrada', 'Pode já ter sido recusada ou apagada.');
  if (ev.getTag('status') !== 'pending') return page_('Já tratado', 'Este pedido já foi tratado anteriormente.');

  const name = ev.getTag('name');
  const info = esc_(name) + ' · ' + esc_(svcName_(ev)) + ' com ' + esc_(pro.name) + '<br>' + esc_(fmtWhen_(ev.getStartTime()));

  // Passo de confirmação: evita que os filtros de e-mail "cliquem" no link sozinhos.
  if (p.confirm !== '1') {
    return page_((approve ? 'Aprovar' : 'Recusar') + ' marcação?', info,
      btn_(actionUrl_(action, pro.id, p.id) + '&confirm=1', approve ? 'Sim, aprovar' : 'Sim, recusar', approve ? '#1a7f4b' : '#b42318'));
  }
  if (approve) {
    approve_(ev, pro);
    return page_('Aprovada ✅', esc_(name) + ' já recebeu a confirmação por e-mail.');
  }
  reject_(ev, pro);
  return page_('Recusada', 'O horário foi libertado e ' + esc_(name) + ' foi avisado(a).');
}

/* ---------- Disponibilidade ---------- */

function publicConfig_() {
  const st = settings_();
  const svcs = services_().filter(s => s.active !== false);
  const ids = svcs.map(s => s.id);
  const pros = pros_()
    .filter(p => p.active !== false)
    .map(p => ({
      id: p.id, name: p.name, role: p.role || '',
      services: (p.services || []).filter(id => ids.indexOf(id) > -1),
      days: Object.keys(p.hours || {}).filter(d => (p.hours[d] || []).length).map(Number),
    }))
    .filter(p => p.services.length && p.days.length);
  const offered = svcs.filter(s => pros.some(p => p.services.indexOf(s.id) > -1));
  return {
    studio: st.studioName, address: st.address, currency: st.currency, timeZone: tz_(),
    maxDays: st.maxDaysAhead, autoConfirm: !!st.autoConfirm, closedDates: closed_(),
    services: offered.map(s => ({ id: s.id, name: s.name, duration: s.duration, price: s.price, description: s.description, icon: s.icon || '' })),
    professionals: pros,
  };
}

function getSlots_(proId, serviceId, dateStr, isAdmin) {
  const st = settings_();
  const pro = findPro_(proId, true);
  const svc = findService_(serviceId, true);
  if (pro.services.indexOf(svc.id) === -1) throw new Error('Este serviço não está disponível com este profissional.');
  if (closed_().indexOf(dateStr) > -1) return [];

  const day = parseDate_(dateStr);
  const windows = (pro.hours || {})[day.getDay()] || [];
  if (!windows.length) return [];

  const now = Date.now();
  const earliest = isAdmin ? 0 : now + st.minNoticeHours * 3600e3;
  if (!isAdmin && day.getTime() > now + st.maxDaysAhead * 86400e3) return [];

  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  const busy = getCalendar_(pro).getEvents(day, dayEnd).map(ev =>
    ev.isAllDayEvent() ? [day.getTime(), dayEnd.getTime()] : [ev.getStartTime().getTime(), ev.getEndTime().getTime()]
  );

  const dur = svc.duration * 60e3;
  const step = st.slotStep * 60e3;
  const slots = [];
  windows.forEach(w => {
    const ws = atTime_(day, w[0]).getTime();
    const we = atTime_(day, w[1]).getTime();
    for (let t = ws; t + dur <= we; t += step) {
      if (t < earliest) continue;
      if (busy.some(b => t < b[1] && t + dur > b[0])) continue;
      slots.push(fmt_(new Date(t), 'HH:mm'));
    }
  });
  return slots;
}

/* ---------- Folgas ---------- */

function listBlocks_(q) {
  const from = parseDate_(q.from);
  const toDay = parseDate_(q.to);
  const to = new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate() + 1);
  const rows = [];
  pros_().forEach(pro => {
    if (pro.active === false || (q.pro && q.pro !== pro.id)) return;
    const cal = pro.calendarId && CalendarApp.getCalendarById(pro.calendarId);
    if (!cal) return;
    cal.getEvents(from, to).forEach(ev => {
      if (ev.getTag('status')) return; // é uma marcação
      const allDay = ev.isAllDayEvent();
      const s = allDay ? ev.getAllDayStartDate() : ev.getStartTime();
      const e = allDay ? new Date(ev.getAllDayEndDate().getTime() - 86400e3) : ev.getEndTime();
      rows.push({
        id: ev.getId(), pro: pro.id, proName: pro.name, allDay,
        date: fmt_(s, 'yyyy-MM-dd'), endDate: fmt_(e, 'yyyy-MM-dd'),
        time: allDay ? '' : fmt_(s, 'HH:mm'), endTime: allDay ? '' : fmt_(e, 'HH:mm'),
        reason: ev.getTag('reason') || ev.getTitle(), managed: ev.getTag('type') === 'block', start: s.getTime(),
      });
    });
  });
  rows.sort((a, b) => a.start - b.start);
  return { rows };
}

function addBlock_(d) {
  const ids = d.pros || [];
  const list = pros_().filter(p => p.active !== false && (ids.indexOf('*') > -1 || ids.indexOf(p.id) > -1));
  if (!list.length) throw new Error('Escolhe pelo menos um profissional.');
  const from = parseDate_(d.from);
  const to = parseDate_(d.to || d.from);
  if (to < from) throw new Error('A data final é anterior à inicial.');
  const days = Math.round((to - from) / 86400e3) + 1;
  if (days > 92) throw new Error('Máximo de 92 dias por folga.');
  if (!d.allDay && !(d.start < d.end)) throw new Error('A hora de fim tem de ser depois da hora de início.');

  const reason = clean_(d.reason, 80) || 'Indisponível';
  const title = '🚫 ' + reason;
  let created = 0;
  list.forEach(pro => {
    const cal = getCalendar_(pro);
    const evs = [];
    if (d.allDay) {
      evs.push(cal.createAllDayEvent(title, from, new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1)));
    } else {
      for (let i = 0; i < days; i++) {
        const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
        evs.push(cal.createEvent(title, atTime_(day, d.start), atTime_(day, d.end)));
      }
    }
    evs.forEach(ev => { ev.setTag('type', 'block'); ev.setTag('reason', reason); ev.setColor(CalendarApp.EventColor.GRAY); created++; });
  });
  return { created };
}

function deleteBlock_(d) {
  const pro = findPro_(d.pro);
  const ev = getCalendar_(pro).getEventById(d.id);
  if (!ev) throw new Error('Folga não encontrada.');
  if (ev.getTag('type') !== 'block') throw new Error('Este evento foi criado diretamente no Google Calendar: apaga-o lá.');
  ev.deleteEvent();
  return { ok: true };
}

/* ============================== AUTENTICAÇÃO ============================== */

function setPassword_(pw) {
  const salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('ADMIN_PW', salt + ':' + sha256_(salt + pw));
}

function login_(password) {
  const cache = CacheService.getScriptCache();
  const fails = +(cache.get('login_fails') || 0);
  if (fails >= 10) throw new Error('Demasiadas tentativas. Tenta de novo daqui a 15 minutos.');
  const stored = prop_('ADMIN_PW');
  if (!stored) throw new Error('A senha do painel ainda não foi definida (executa definirSenhaAdmin no Apps Script).');
  const parts = stored.split(':');
  if (sha256_(parts[0] + String(password || '')) !== parts[1]) {
    cache.put('login_fails', String(fails + 1), 900);
    Utilities.sleep(800);
    throw new Error('Senha incorreta.');
  }
  cache.remove('login_fails');
  const exp = Date.now() + 12 * 3600e3;
  return { token: exp + '.' + sign_('admin|' + exp + '|' + parts[1]) };
}

function verifyToken_(t) {
  const parts = String(t || '').split('.');
  const exp = +parts[0];
  const hash = (prop_('ADMIN_PW') || '').split(':')[1] || '';
  if (!exp || exp < Date.now() || !hash || parts[1] !== sign_('admin|' + exp + '|' + hash)) {
    const e = new Error('Sessão expirada. Entra novamente.');
    e.auth = true;
    throw e;
  }
}

/* ============================== ARMAZENAMENTO ============================== */
/* Os dados ficam nas Propriedades do Script, divididos em blocos (limite de 9 KB por propriedade). */

function settings_() { return Object.assign({}, DEFAULTS.settings, getStore_('settings', {})); }
function services_() { return getStore_('services', DEFAULTS.services); }
function pros_() { return getStore_('professionals', DEFAULTS.professionals); }
function closed_() { return getStore_('closedDates', DEFAULTS.closedDates); }

function getStore_(key, fallback) {
  const props = PropertiesService.getScriptProperties();
  const n = +(props.getProperty(key + '#n') || 0);
  if (!n) return JSON.parse(JSON.stringify(fallback));
  let s = '';
  for (let i = 0; i < n; i++) s += props.getProperty(key + '#' + i) || '';
  return JSON.parse(s);
}

function setStore_(key, value) {
  const props = PropertiesService.getScriptProperties();
  const s = JSON.stringify(value).replace(/[\u007f-￿]/g, c => '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4));
  const chunks = [];
  for (let i = 0; i < s.length; i += 8000) chunks.push(s.slice(i, i + 8000));
  const old = +(props.getProperty(key + '#n') || 0);
  const obj = {};
  chunks.forEach((c, i) => { obj[key + '#' + i] = c; });
  obj[key + '#n'] = String(chunks.length);
  props.setProperties(obj);
  for (let i = chunks.length; i < old; i++) props.deleteProperty(key + '#' + i);
}

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }

/* ============================== AJUDANTES ============================== */

function findPro_(id, activeOnly) {
  const p = pros_().filter(x => x.id === id)[0];
  if (!p || (activeOnly && p.active === false)) throw new Error('Profissional não encontrado.');
  return p;
}

function findService_(id, activeOnly) {
  const s = services_().filter(x => x.id === id)[0];
  if (!s || (activeOnly && s.active === false)) throw new Error('Serviço não encontrado.');
  return s;
}

function svcName_(ev) {
  const id = ev.getTag('service');
  const s = services_().filter(x => x.id === id)[0];
  return s ? s.name : (id || 'Marcação');
}

function calName_(pro) { return settings_().studioName + ' · ' + pro.name; }

/** Garante que o profissional tem calendário e partilha-o com o e-mail dele, se houver. Altera `pro`. */
function ensureCalendar_(pro) {
  if (!pro.calendarId) {
    const legacy = prop_('CAL_' + pro.id); // compatibilidade com a v1
    if (legacy) pro.calendarId = legacy;
  }
  let cal = pro.calendarId && CalendarApp.getCalendarById(pro.calendarId);
  if (!cal) {
    cal = CalendarApp.createCalendar(calName_(pro), { timeZone: tz_() });
    pro.calendarId = cal.getId();
  }
  let info = '';
  if (pro.email && pro.sharedWith !== pro.email) {
    if (typeof Calendar === 'undefined') {
      info = 'Partilha automática indisponível: ativa o serviço "Google Calendar API" no Apps Script.';
    } else {
      try {
        Calendar.Acl.insert({ role: 'writer', scope: { type: 'user', value: pro.email } }, pro.calendarId, { sendNotifications: true });
        pro.sharedWith = pro.email;
        info = 'Calendário partilhado com ' + pro.email + '.';
      } catch (e) {
        info = 'Não foi possível partilhar o calendário: ' + e.message;
      }
    }
  }
  return info;
}

function getCalendar_(pro) {
  const cal = pro.calendarId && CalendarApp.getCalendarById(pro.calendarId);
  if (cal) return cal;
  ensureCalendar_(pro);
  const list = pros_();
  const item = list.filter(x => x.id === pro.id)[0];
  if (item) { item.calendarId = pro.calendarId; item.sharedWith = pro.sharedWith; setStore_('professionals', list); }
  return CalendarApp.getCalendarById(pro.calendarId);
}

function normHours_(h) {
  const out = {};
  h = h || {};
  for (let d = 0; d < 7; d++) {
    const list = (h[d] || h[String(d)] || []).map(w => {
      const a = String(w[0] || ''), b = String(w[1] || '');
      if (!/^\d{2}:\d{2}$/.test(a) || !/^\d{2}:\d{2}$/.test(b) || a >= b) {
        throw new Error('Horário inválido na ' + DIAS[d] + ' (' + a + '–' + b + ').');
      }
      return [a, b];
    }).sort((x, y) => (x[0] < y[0] ? -1 : 1));
    if (list.length) out[d] = list;
  }
  return out;
}

function upsert_(list, item) {
  for (let i = 0; i < list.length; i++) if (list[i].id === item.id) { list[i] = item; return; }
  list.push(item);
}

function uniqueId_(name, list) {
  const base = String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'item';
  let id = base, n = 2;
  while (list.some(x => x.id === id)) id = base + '-' + n++;
  return id;
}

function titleFor_(status, svc, name) {
  const p = { pending: '⏳ PENDENTE · ', confirmed: '✅ ', noshow: '🚫 FALTOU · ' }[status] || '';
  return p + svc + ' · ' + name;
}

function colorFor_(status) {
  return { pending: CalendarApp.EventColor.YELLOW, confirmed: CalendarApp.EventColor.GREEN,
           noshow: CalendarApp.EventColor.GRAY }[status] || CalendarApp.EventColor.GREEN;
}

function clampInt_(v, min, max, def) {
  const n = Math.round(+v);
  return isNaN(n) ? def : Math.min(max, Math.max(min, n));
}

function tz_() { return Session.getScriptTimeZone(); }
function fmt_(d, f) { return Utilities.formatDate(d, tz_(), f); }
function adminEmail_() { return settings_().adminEmail || Session.getEffectiveUser().getEmail(); }

function siteLink_() {
  const url = settings_().siteUrl;
  return url ? '<br><br>' + btn_(url, 'Escolher novo horário', '#b5527a') : '';
}

function parseDate_(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) throw new Error('Data inválida.');
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

function atTime_(day, hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
  if (!m) throw new Error('Hora inválida.');
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), +m[1], +m[2]);
}

function fmtWhen_(d) {
  const wd = +fmt_(d, 'u') % 7; // 1 = segunda ... 7 = domingo
  return DIAS[wd] + ', ' + fmt_(d, "dd/MM/yyyy 'às' HH:mm");
}

function clean_(v, max) { return String(v || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max); }

function esc_(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function sha256_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function secret_() {
  let s = prop_('SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); PropertiesService.getScriptProperties().setProperty('SECRET', s); }
  return s;
}

function sign_(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, secret_())).replace(/=+$/, '');
}

function token_(id, action) { return sign_(id + '|' + action).slice(0, 32); }

function actionUrl_(action, proId, eventId) {
  return ScriptApp.getService().getUrl() + '?action=' + action + '&pro=' + encodeURIComponent(proId) +
    '&id=' + encodeURIComponent(eventId) + '&t=' + token_(eventId, action);
}

function googleCalUrl_(ev, svc, pro) {
  const f = d => Utilities.formatDate(d, 'UTC', "yyyyMMdd'T'HHmmss'Z'");
  const st = settings_();
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    '&text=' + encodeURIComponent(svc + ' · ' + st.studioName) +
    '&dates=' + f(ev.getStartTime()) + '/' + f(ev.getEndTime()) +
    '&details=' + encodeURIComponent('Com ' + pro.name) +
    '&location=' + encodeURIComponent(st.address);
}

function ics_(ev, svc, pro) {
  const f = d => Utilities.formatDate(d, 'UTC', "yyyyMMdd'T'HHmmss'Z'");
  const e = s => String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const st = settings_();
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Agenda Estudio//PT', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    'UID:' + ev.getId(), 'DTSTAMP:' + f(new Date()),
    'DTSTART:' + f(ev.getStartTime()), 'DTEND:' + f(ev.getEndTime()),
    'SUMMARY:' + e(svc + ' · ' + st.studioName), 'DESCRIPTION:' + e('Com ' + pro.name), 'LOCATION:' + e(st.address),
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Lembrete', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function btn_(url, label, color) {
  return '<a href="' + esc_(url) + '" style="display:inline-block;padding:12px 20px;border-radius:8px;' +
    'background:' + color + ';color:#fff;text-decoration:none;font-weight:600">' + esc_(label) + '</a>';
}

function mail_(title, body) {
  return '<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;color:#222;line-height:1.5">' +
    '<h2 style="margin:0 0 12px">' + esc_(title) + '</h2>' + body +
    '<p style="color:#888;font-size:12px;margin-top:24px">' + esc_(settings_().studioName) + '</p></div>';
}

function page_(title, html, extra) {
  return HtmlService.createHtmlOutput(
    '<div style="font-family:system-ui,Arial,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;text-align:center">' +
    '<h1 style="font-size:22px">' + esc_(title) + '</h1><p style="color:#444;line-height:1.5">' + html + '</p>' +
    (extra ? '<p style="margin-top:24px">' + extra + '</p>' : '') + '</div>'
  ).setTitle(title).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
