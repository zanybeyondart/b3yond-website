import { ADDONS, DELIVERY_OPTIONS, EXPERIENCES, RATE_CARD, generationInfo, getBooth, priceQuote, scheduleInfo, staffingInfo, transportInfo } from './model.js';

const currency = new Intl.NumberFormat('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fractionalCurrency = new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const quoteDateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' });
const pencil = '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5 4 4M4 20l4-.8L20 7.3a2.8 2.8 0 0 0-4-4L4.9 15.6 4 20Z"/></svg>';

function escape(value) {
  const chars = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, char => chars[char]);
}
function amount(value) {
  if (value == null) return 'Pending';
  const formatter = Number.isInteger(value) ? currency : fractionalCurrency;
  return (value < 0 ? '−' : '') + RATE_CARD.currency + ' ' + formatter.format(Math.abs(value));
}
function day(value) {
  const stamp = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(stamp) ? dateFormat.format(stamp) : 'Pending';
}
function clock(value) {
  if (!value || !/^\d\d:\d\d$/.test(value)) return 'Pending';
  const [hr, min] = value.split(':');
  return (Number(hr) % 12 || 12) + ':' + min + (Number(hr) < 12 ? ' AM' : ' PM');
}
function count(value, unit) {
  if (value == null) return 'Pending';
  if (unit === 'setup' && value === 1) return '1 setup (once)';
  if ((unit === 'hour' || unit === 'person-hour') && Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) {
    const minutes = Math.round(value * 60);
    const hours = Math.floor(minutes / 60);
    return (hours ? hours + ' h ' : '') + (minutes % 60) + ' min' + (unit === 'person-hour' ? ' of staff time' : '');
  }
  return currency.format(value) + ' ' + unit + (value === 1 ? '' : 's');
}
function boothLabel(units, unit) {
  const name = getBooth(unit.type)?.name ?? 'Booth';
  return name + ' ' + (units.filter(item => item.type === unit.type).indexOf(unit) + 1);
}
function details(unit) {
  const info = scheduleInfo(unit);
  const dates = unit.startDate === unit.endDate ? day(unit.startDate) : day(unit.startDate) + ' – ' + day(unit.endDate);
  const overnight = unit.endTime && unit.endTime < unit.startTime ? ' (next day)' : '';
  const start = unit.earlySetup ? unit.reportTime : info.standardSetupTime;
  const previous = Number(unit.earlySetup ? unit.reportDayOffset : info.standardSetupDayOffset) === -1;
  const arrival = clock(start) + (previous ? ' (previous day)' : '');
  const selected = new Set(unit.addons || []);
  const delivery = DELIVERY_OPTIONS.filter(item => selected.has(item.id)).map(item =>
    item.id === 'printer' && unit.experience === 'aiVideo' ? item.name + ' (still image)' : item.name).join(', ');
  const addons = ADDONS.filter(item => selected.has(item.id)).map(item => item.name).join(', ');
  const { emirate, rate } = transportInfo(unit);
  const promoter = unit.staffing === 'b3yond' ? '1 B3YOND promoter' : '1 client-provided promoter';
  const extra = Number(unit.additionalStaff) || 0;
  const staffing = staffingInfo(unit);
  const needsWifi = ['aiPhoto', 'aiVideo'].includes(unit.experience) || selected.has('qr') || selected.has('email');
  const rows = [
    ['Experience', EXPERIENCES.find(item => item.id === unit.experience)?.name ?? 'Pending'],
    ['Venue', unit.venue || 'Pending'],
    ['Transport', rate == null ? (emirate ? emirate + ' · ' : '') + 'Transport to confirm' : emirate + ' · ' + amount(rate) + ' per venue per day'],
    ['Event dates', dates + (info.days > 1 ? ' · ' + count(info.days, 'day') : '')],
    ['Daily event time', clock(unit.startTime) + ' – ' + clock(unit.endTime) + overnight + ' GST'],
    ['Crew arrival', arrival + (unit.earlySetup ? ' · Earlier reporting' : ' · Two-hour setup')],
    ['On-site staffing', promoter + (extra > 0 ? ' + ' + extra + ' additional B3YOND staff' : '')],
    ['Technical support', 'Remote support included'],
    ['Guest delivery', delivery || 'None selected'],
    ['Add-ons', addons || 'None'],
    ['Venue Wi-Fi', needsWifi ? 'Reliable internet required' : 'Framed photo capture works offline'],
  ];
  if (unit.type === 'classic') rows.unshift(['Display size', (unit.screenSize || 24) + '-inch screen']);
  if (staffing.people > 0) {
    const personLabel = staffing.people === 1 ? '1 person' : staffing.people + ' people';
    let shift = personLabel + ' × ' + count(staffing.hoursPerDay, 'hour') + '/day × ' +
      count(info.days, 'day') + ' = ' + count(staffing.personHours, 'person-hour');
    if (unit.staffing === 'b3yond' && staffing.hoursPerDay != null && info.hoursPerDay > staffing.hoursPerDay) {
      shift += '. Client covers the remaining ' + count(info.hoursPerDay - staffing.hoursPerDay, 'hour') + '/day.';
    }
    rows.push(['B3YOND staff hours', shift]);
  }
  if (unit.experience === 'frame' && Number(unit.expectedGuests) > 0) {
    rows.push(['Expected guests', count(Number(unit.expectedGuests), 'guest') + ' over this booking']);
  }
  if (selected.has('queue')) {
    const side = unit.screenSide === 'left' ? 'Left side' : unit.screenSide === 'right' ? 'Right side' : 'Either side';
    rows.push(['Collection screen', '1 screen · ' + side + ' when facing the booth']);
  }
  return rows;
}

function productionPlan(unit) {
  if (!['aiPhoto', 'aiVideo'].includes(unit.experience)) return '';
  const ai = generationInfo(unit);
  const schedule = scheduleInfo(unit);
  const video = unit.experience === 'aiVideo';
  const output = video ? 'video' : 'photo';
  const seconds = Number(unit.videoSeconds ?? 15);
  const format = video
    ? (unit.videoResolution || '720p') + ', ' + seconds + ' seconds'
    : (ai.photoWithPrint ? 'Digital photo and one print per photo' : 'Digital photo only');
  const basis = ai.mode === 'unlimited' ? 'Unlimited during booked hours' : 'Fixed allocation';
  let price = count(ai.quantity, output) + ' × ' + amount(ai.unitPrice) + ' per ' + output;
  if (video && seconds !== 10) {
    const baseRate = RATE_CARD.videoRate10Seconds[unit.videoResolution || '720p'];
    price += ' (' + (seconds / 10) + ' × the 10-second rate of ' + amount(baseRate) + ')';
  }
  const minutes = schedule.hoursPerDay == null ? null : Math.round(schedule.hoursPerDay * 60);
  const inputs = count(minutes, 'minute') + '/day × 60 seconds/minute ÷ ' + count(ai.cycleSeconds, 'second');
  const queue = unit.addons?.includes('queue') ? 'with queue management' : 'without queue management';
  const result = count(ai.capacityPerDay, output) + '/day × ' + count(schedule.days, 'day') + ' = ' + count(ai.capacity, output);
  const facts = [
    ['Expected guests', count(ai.expectedGuests, 'guest') + ' across this booking'],
    ['Pricing basis', basis + ' · ' + format],
    ['Estimated capacity', inputs + ' per generation ' + queue + '. Counting complete generations gives ' + result + ' over the booking.'],
    ['Quoted output', price],
  ];
  const notes = [];
  if (ai.mode === 'fixed' && ai.overCapacity) notes.push('The fixed allocation exceeds estimated operating capacity.');
  const available = ai.capacity == null || ai.quantity == null ? null : Math.min(ai.capacity, ai.quantity);
  if (available != null && ai.expectedGuests > available) {
    notes.push('At one ' + output + ' per guest, approximately ' + count(ai.expectedGuests - available, 'guest') +
      ' would exceed the planned output.');
  }
  return '<section class="rv-production"><h3>AI production plan</h3><dl class="rv-details">' +
    facts.map(([label, value]) => '<div><dt>' + escape(label) + '</dt><dd>' + escape(value) + '</dd></div>').join('') +
    '</dl>' + (notes.length ? '<p class="rv-capacity-note">' + escape(notes.join(' ')) + '</p>' : '') + '</section>';
}
function detailList(unit) {
  return '<dl class="rv-details">' + details(unit).map(([label, value]) =>
    '<div><dt>' + escape(label) + '</dt><dd>' + escape(value) + '</dd></div>').join('') + '</dl>';
}
function breakdown(result) {
  const rows = result.lines.map(line => {
    const included = line.rate === 0 && line.amount === 0;
    const unitRate = included ? '' : '<small class="rv-rate"> × ' + escape(amount(line.rate)) + '/' + escape(line.unit) + '</small>';
    return '<tr><th scope="row">' + escape(line.label) + '</th><td>' + count(line.quantity, line.unit) +
      unitRate + '</td><td>' + (included ? 'Included · ' + escape(amount(0)) : escape(amount(line.amount))) + '</td></tr>';
  }).join('');
  return '<table class="rv-lines"><thead><tr><th scope="col">Item</th><th scope="col">Quantity × rate</th><th scope="col">Amount</th></tr></thead><tbody>' +
    rows + '</tbody><tfoot><tr><th scope="row" colspan="2">Booth subtotal</th><td>' + escape(amount(result.total)) + '</td></tr></tfoot></table>';
}

function quotationTotals(quote) {
  const totalLine = (label, value, className = '') =>
    '<div class="rv-tally-line ' + className + '"><dt>' + label + '</dt><dd>' + escape(value) + '</dd></div>';
  const subtotal = totalLine('Booth charges', amount(quote.subtotal));
  const travel = quote.travelLines.map(line => {
    const place = line.emirate ? escape(line.emirate) : 'Venue';
    const units = count(line.days, 'venue-day');
    const rate = line.rate == null ? '' : ' × ' + escape(amount(line.rate));
    const label = line.amount == null ? 'Transport to confirm' : 'Transport';
    return totalLine(label + ' · ' + place + '<small>' + units + rate + '</small>',
      line.amount == null ? 'To confirm' : amount(line.amount));
  }).join('');
  return '<dl class="rv-tally">' + subtotal + travel +
    totalLine('Estimated total before VAT', amount(quote.total), 'rv-tally-total') + '</dl>';
}

function terms(units) {
  const localRates = Object.entries(RATE_CARD.transportDay).map(([emirate, rate]) =>
    emirate + ' ' + amount(rate)).join(', ');
  const policies = [
    ['Access and setup', 'Provide venue access and power by the agreed reporting time. Standard crew arrival is two hours before opening on each event day.'],
    ['Early arrival', 'Additional staffed time before standard reporting is ' + amount(RATE_CARD.earlySetupHour) + ' per hour per booth. Arrange earlier unattended installation separately.'],
    ['Event extensions', 'Extra booth time is ' + amount(RATE_CARD.overtimeHour) + ' per hour per booth, subject to client approval and availability. Unlimited AI output and any extended staff shifts are recalculated for the new hours.'],
    ['Staffing', 'Remote technical support is included. B3YOND promoters are charged at ' + amount(RATE_CARD.promoterHour) + ' per person-hour for booked shifts. The client supplies a promoter for any remaining opening hours.'],
    ['Connectivity', 'Provide reliable Wi-Fi for AI generation, email delivery and QR downloads. Framed photos can be captured offline.'],
    ['Transport', 'One charge applies per venue per event day. ' + localRates + '. Other locations require confirmation.'],
    ['Payment', '50% in advance and 50% on delivery.'],
  ];
  if (units.some(unit => ['aiPhoto', 'aiVideo'].includes(unit.experience))) {
    policies.splice(4, 0, ['AI output', 'Fixed bookings are priced by the selected number of outputs. Unlimited bookings are priced using estimated capacity during event hours. Actual output depends on guest participation and operating conditions.']);
  }
  if (units.some(unit => unit.experience === 'aiPhoto' && unit.addons?.includes('printer'))) {
    policies.splice(5, 0, ['AI photo prints', 'Each quoted AI photo includes one print when the on-site printer is selected. Printer hire is shown separately. A Mirror Booth package credit covers the hire.']);
  }
  return '<section class="rv-terms"><h2>Terms and conditions</h2><dl>' + policies.map(([name, detail]) =>
    '<div><dt>' + escape(name) + '</dt><dd>' + escape(detail) + '</dd></div>').join('') + '</dl></section>';
}

export function renderReview(units) {
  const quote = priceQuote(units);
  const panels = units.map((unit, i) => {
    const title = escape(boothLabel(units, unit));
    const booth = getBooth(unit.type);
    const image = booth ? '<img class="rv-thumb" src="./assets/' + escape(booth.id) + '.webp" alt="">' : '';
    return '<article class="rv-panel"><header class="rv-head">' + image + '<h2>' + title + '</h2>' +
      '<button type="button" data-action="edit-unit" data-id="' + escape(unit.id) + '" aria-label="Edit ' + title +
      '" class="rv-edit">' + pencil + ' Edit</button></header><div class="rv-columns"><section><h3>Event details</h3>' +
      detailList(unit) + productionPlan(unit) + '</section><section><h3>Price breakdown</h3>' + breakdown(quote.units[i]) + '</section></div></article>';
  });
  return '<div class="rv-stack">' + panels.join('') + '<section class="rv-total"><div><h2>Quotation summary</h2><p>' +
    'Transport is shared by booths at the same venue on the same date.' +
    '</p></div>' + quotationTotals(quote) + '</section>' + terms(units) + '</div>';
}

export function renderPrint(units) {
  const quote = priceQuote(units);
  const date = quoteDateFormat.format(new Date());
  if (!units.length) return '';
  const lastUnit = units.at(-1);
  const separateSummary = lastUnit.experience !== 'frame' || quote.units.at(-1).lines.length > 4 || quote.travelLines.length > 1 || lastUnit.venue?.length > 80;
  const pages = units.length + Number(separateSummary);
  const sheet = (index, title, body) => {
    const compact = quote.units[index]?.lines.length > 10 ? ' rv-sheet-compact' : '';
    return '<article class="rv-sheet' + compact + '"><img class="rv-letterhead" src="./assets/b3yond-letterhead.webp" alt="B3YOND letterhead"><div class="rv-sheet-body">' +
      '<div class="rv-doc-meta"><span>' + escape(date) + '</span><span>Page ' + (index + 1) + ' of ' + pages + '</span></div>' +
      '<h1>' + title + '</h1>' + body + '</div></article>';
  };
  const finalSection = quotationTotals(quote) + terms(units);
  const sheets = units.map((unit, i) => sheet(i, 'Photo booth quotation',
    '<h2>' + escape(boothLabel(units, unit)) + '</h2>' + detailList(unit) + productionPlan(unit) + '<h3>Price breakdown</h3>' +
    breakdown(quote.units[i]) + (i === units.length - 1 && !separateSummary ? finalSection : '')));
  if (separateSummary) sheets.push(sheet(units.length, 'Quotation summary', finalSection));
  return sheets.join('');
}
