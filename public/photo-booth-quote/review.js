import { ADDONS, DELIVERY_OPTIONS, EXPERIENCES, RATE_CARD, generationInfo, getBooth, priceQuote, quoteEstimate, scheduleInfo, staffingInfo } from './model.js';

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
  const same = units.filter(item => item.type === unit.type);
  return same.length === 1 ? name : name + ' ' + (same.indexOf(unit) + 1);
}
function dateRange(unit) {
  return unit.startDate === unit.endDate ? day(unit.startDate) : day(unit.startDate) + ' – ' + day(unit.endDate);
}
function details(unit, includeHeader) {
  const info = scheduleInfo(unit);
  const overnight = unit.endTime && unit.endTime < unit.startTime ? ' (next day)' : '';
  const start = unit.earlySetup ? unit.reportTime : info.standardSetupTime;
  const previous = Number(unit.earlySetup ? unit.reportDayOffset : info.standardSetupDayOffset) === -1;
  const arrival = clock(start) + (previous ? ' (previous day)' : '');
  const selected = new Set(unit.addons || []);
  const delivery = DELIVERY_OPTIONS.filter(item => selected.has(item.id)).map(item =>
    item.id === 'printer' && unit.experience === 'aiVideo' ? item.name + ' (still image)' : item.name).join(', ');
  const addons = ADDONS.filter(item => selected.has(item.id)).map(item => item.name).join(', ');
  const promoter = unit.staffing === 'b3yond' ? '1 B3YOND promoter' : '1 client-provided promoter';
  const extra = Number(unit.additionalStaff) || 0;
  const staffing = staffingInfo(unit);
  const needsWifi = ['aiPhoto', 'aiVideo'].includes(unit.experience) || selected.has('qr') || selected.has('email');
  const rows = [
    ['Daily event time', clock(unit.startTime) + ' – ' + clock(unit.endTime) + overnight + ' GST'],
    ['Crew arrival', arrival + (unit.earlySetup ? ' · Earlier reporting' : ' · Two-hour setup')],
    ['On-site staffing', promoter + (extra > 0 ? ' + ' + extra + ' additional B3YOND staff' : '')],
    ['Guest delivery', delivery || 'None selected'],
    ['Venue Wi-Fi', needsWifi ? 'Reliable internet required' : 'Framed photo capture works offline'],
  ];
  if (includeHeader) {
    rows.unshift(
      ['Experience', EXPERIENCES.find(item => item.id === unit.experience)?.name ?? 'Pending'],
      ['Venue', unit.venue || 'Pending'],
      ['Event dates', dateRange(unit) + (info.days > 1 ? ' · ' + count(info.days, 'day') : '')],
    );
    if (unit.type === 'classic') rows.unshift(['Display size', (unit.screenSize || 24) + '-inch screen']);
  }
  if (addons) rows.push(['Add-ons', addons]);
  if (unit.experience === 'aiPhoto') rows.push(['Artwork', unit.customArtwork === true ? 'Shared custom artwork' : 'Standard theme included']);
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

function productionPlan(unit, savedResult = null) {
  if (!['aiPhoto', 'aiVideo'].includes(unit.experience)) return '';
  const ai = generationInfo(unit);
  const schedule = scheduleInfo(unit);
  const video = unit.experience === 'aiVideo';
  const seconds = Number(unit.videoSeconds ?? 15);
  const format = video
    ? (unit.videoResolution || '720p') + ', ' + seconds + ' seconds'
    : (ai.photoWithPrint ? 'Digital photo and one print per photo' : 'Digital photo only');
  const recorded = savedResult?.lines.find(line => ['photo', 'video'].includes(line.unit));
  const quantity = recorded?.quantity ?? ai.quantity;
  const oldUnlimited = recorded?.label.includes('unlimited during booked hours');
  const basis = oldUnlimited ? 'Unlimited during booked hours (saved quotation)' : ai.mode === 'unlimited' ? 'Flexible sessions, up to ' + count(quantity, 'session') + ' across the booking' : 'Priced by estimated attendance';
  const queue = unit.addons?.includes('queue') ? 'with queue management' : 'without queue management';
  const timing = count(ai.cycleSeconds, 'second') + ' per session ' + queue +
    (schedule.days > 1 ? ' · ' + count(ai.capacityPerDay, 'session') + '/day × ' + count(schedule.days, 'day') : '');
  const attendance = ai.expectedGuests == null ? 'Attendance to confirm' : 'Estimated attendance is ' + count(ai.expectedGuests, 'guest');
  const capacity = ai.capacity == null ? 'Capacity depends on the event schedule.' :
    'The booked hours allow approximately ' + count(ai.capacity, 'session') + '.';
  const facts = [
    ['AI plan', basis + ' · ' + format],
    ['Session timing', timing],
    ['Attendance and capacity', attendance + '. ' + capacity],
  ];
  return '<section class="rv-production"><h3>Guest experience</h3><dl class="rv-details">' +
    facts.map(([label, value]) => '<div><dt>' + escape(label) + '</dt><dd>' + escape(value) + '</dd></div>').join('') +
    '</dl></section>';
}
function detailList(unit, includeHeader = true) {
  return '<dl class="rv-details">' + details(unit, includeHeader).map(([label, value]) =>
    '<div><dt>' + escape(label) + '</dt><dd>' + escape(value) + '</dd></div>').join('') + '</dl>';
}
function breakdown(result) {
  const rows = result.lines.map(line => {
    const included = line.rate === 0 && line.amount === 0;
    const unitRate = included ? '' : '<small class="rv-rate"> × ' + escape(amount(line.rate)) + '/' + escape(line.unit) + '</small>';
    return '<tr><th scope="row">' + escape(line.label) + '</th><td>' + count(line.quantity, line.unit) +
      unitRate + '</td><td>' + (included ? 'Included' : escape(amount(line.amount))) + '</td></tr>';
  }).join('');
  return '<table class="rv-lines"><thead><tr><th scope="col">Item</th><th scope="col">Quantity × rate</th><th scope="col">Amount</th></tr></thead><tbody>' +
    rows + '</tbody><tfoot><tr><th scope="row" colspan="2">Booth subtotal</th><td>' + escape(amount(result.total)) + '</td></tr></tfoot></table>';
}

function quotationTotals(quote, estimate, showTotal) {
  const totalLine = (label, value, className = '') =>
    '<div class="rv-tally-line ' + className + '"><dt>' + label + '</dt><dd>' + escape(value) + '</dd></div>';
  const subtotal = totalLine('Booth charges', amount(quote.subtotal));
  const booking = quote.bookingLines.map(line => {
    let title = escape(line.label);
    let basis = 'Once per booking';
    if (line.artworkCount != null) {
      title += ' · ' + escape(count(line.artworkCount, 'design')) + ' for the booking';
      const extraRate = amount(RATE_CARD.customArtworkExtraPair);
      basis = amount(RATE_CARD.customArtworkSetup) + ' for up to 2 designs';
      basis += line.extraPairs ? ' + ' + count(line.extraPairs, 'extra set') + ' of up to 2 × ' + extraRate :
        '. Each extra set of 1 or 2 costs ' + extraRate + '.';
    }
    return totalLine(title + '<small>' + escape(basis) + '</small>', amount(line.amount));
  }).join('');
  const travel = quote.travelLines.map(line => {
    const place = line.emirate ? escape(line.emirate) : 'Other venue';
    const breakdown = line.days > 1 && line.rate != null ? '<small>' + line.days + ' × ' + escape(amount(line.rate)) + '</small>' : '';
    return totalLine('Transport · ' + place + breakdown,
      line.amount == null ? 'To confirm' : amount(line.amount));
  }).join('');
  const total = showTotal ? totalLine(quote.total == null ? 'Priced so far before VAT' : 'Estimate before VAT',
    amount(estimate), 'rv-tally-total') : '';
  return '<dl class="rv-tally">' + subtotal + booking + travel + total + '</dl>';
}

function terms(units, collapsed = false, legacy = false) {
  const policies = [
    ['Access and setup', 'Provide venue access and power by the agreed reporting time. Standard setup starts two hours before opening each day. Earlier staffed reporting costs ' + amount(RATE_CARD.earlySetupHour) + ' per hour per booth. Arrange unattended early installation separately.'],
    ['Event extensions', legacy ? 'Extra booth time is AED 400 per hour per booth, subject to approval and availability. Unlimited AI output and extended staff shifts are recalculated for the new hours.' : 'Booked-hour packages include automatic full-day caps and 15% off hire from day two. Extensions require approval and a revised quotation.'],
    ['Staffing', 'Remote technical support is included. B3YOND promoters are charged at ' + amount(RATE_CARD.promoterHour) + ' per person-hour for booked shifts. The client supplies a promoter for any remaining opening hours.'],
    ['Connectivity', 'Provide reliable Wi-Fi for AI generation, email delivery and QR downloads. Framed photos can be captured offline.'],
    ['Transport', 'Transport is shared across booths at the same venue. Any pending transport rate will be confirmed before booking.'],
    ['Payment', '50% in advance and 50% on delivery.'],
  ];
  if (units.some(unit => ['aiPhoto', 'aiVideo'].includes(unit.experience))) {
    policies.splice(3, 0, ['AI sessions', legacy ? 'Actual booth participation may vary. A session for every attendee cannot be guaranteed within the booked hours.' : 'Actual participation may vary. Flexible sessions allow up to 125% of expected guests within booth capacity. Further sessions require approval at the selected unit rate. A turn for every attendee cannot be guaranteed within booked hours.']);
  }
  if (units.some(unit => unit.experience === 'aiPhoto' && unit.addons?.includes('printer'))) {
    policies.splice(4, 0, ['AI photo prints', 'Printed AI photos include one print per generation. Mirror Booth hire includes the printer. The Display Stand printer package includes email setup when selected.']);
  }
  const content = '<dl>' + policies.map(([name, detail]) =>
    '<div><dt>' + escape(name) + '</dt><dd>' + escape(detail) + '</dd></div>').join('') + '</dl>';
  return collapsed ? '<details class="rv-terms rv-disclosure"><summary>Terms and conditions</summary>' + content + '</details>' :
    '<section class="rv-terms"><h2>Terms and conditions</h2>' + content + '</section>';
}

export function renderReview(units, artworkCount = 2, saved = null) {
  if (!units.length) return '';
  const quote = saved?.quote ?? priceQuote(units, RATE_CARD, artworkCount);
  const estimate = quote.total ?? saved?.estimate?.amount ?? quoteEstimate(units, RATE_CARD, artworkCount).amount;
  const manual = quote.requiresReview && !saved;
  const panels = units.map((unit, i) => {
    const title = escape(boothLabel(units, unit));
    const booth = getBooth(unit.type);
    const image = booth ? '<img class="rv-thumb" src="./assets/' + escape(booth.id) + '.webp" alt="">' : '';
    const experience = EXPERIENCES.find(item => item.id === unit.experience)?.name ?? '';
    const description = [experience, unit.type === 'classic' ? (unit.screenSize || 24) + '″ display' : ''].filter(Boolean).join(' · ');
    return '<article class="rv-panel"><header class="rv-head">' + image + '<div><h2>' + title + '</h2>' +
      '<p>' + escape(description) + '</p></div>' +
      '<button type="button" data-action="edit-unit" data-id="' + escape(unit.id) + '" aria-label="Edit ' + title +
      '" class="rv-edit">' + pencil + ' Edit</button></header>' +
      '<p class="rv-booking">' + escape(dateRange(unit)) + ' · ' + escape(unit.venue || 'Venue pending') + '</p>' +
      '<details class="rv-disclosure rv-booth-details"><summary>Event details and prices</summary><div class="rv-columns"><section><h3>Event details</h3>' +
      detailList(unit, false) + productionPlan(unit, saved ? quote.units[i] : null) + '</section><section><h3>Price breakdown</h3>' + (manual ? '<p>Pricing requires confirmation.</p>' : breakdown(quote.units[i])) + '</section></div></details></article>';
  });
  return '<div class="rv-stack"><section class="rv-total"><div><h2>' +
    (quote.requiresReview ? 'Custom quote required' : quote.total == null ? 'Priced so far before VAT' : 'Estimate before VAT') + '</h2><strong>' + (manual ? 'Contact B3YOND' : escape(amount(estimate))) + '</strong>' +
    (quote.travelPending ? '<p>Transport still to confirm.</p>' : '') + '</div>' +
    (manual ? '<p>B3YOND will confirm a tailored price for the selected volume or staffing.</p>' : quotationTotals(quote, estimate, false)) + '</section>' + panels.join('') + terms(units, true, Boolean(saved && !quote.pricingPolicyVersion)) + '</div>';
}

export function renderPrint(units, artworkCount = 2, saved = null) {
  if (!units.length) return '';
  const quote = saved?.quote ?? priceQuote(units, RATE_CARD, artworkCount);
  const estimate = quote.total ?? saved?.estimate?.amount ?? quoteEstimate(units, RATE_CARD, artworkCount).amount;
  const manual = quote.requiresReview && !saved;
  const date = quoteDateFormat.format(saved?.createdAt ? new Date(saved.createdAt) : new Date());
  const lastUnit = units.at(-1);
  const separateSummary = lastUnit.experience !== 'frame' || quote.units.at(-1).lines.length > 4 || quote.travelLines.length > 1 || quote.bookingLines.length > 0 || lastUnit.venue?.length > 80;
  const pages = units.length + Number(separateSummary);
  const sheet = (index, title, body) => {
    const compact = quote.units[index]?.lines.length > 10 ? ' rv-sheet-compact' : '';
    return '<article class="rv-sheet' + compact + '"><img class="rv-letterhead" src="./assets/b3yond-letterhead.webp" alt="B3YOND letterhead"><div class="rv-sheet-body">' +
      '<div class="rv-doc-meta"><span>' + escape(date) + '</span><span>Page ' + (index + 1) + ' of ' + pages + '</span></div>' +
      '<h1>' + title + '</h1>' + body + '</div></article>';
  };
  const finalSection = (manual ? '<p>Custom quote required. Pricing is pending confirmation by B3YOND.</p>' : quotationTotals(quote, estimate, true)) + terms(units, false, Boolean(saved && !quote.pricingPolicyVersion));
  const sheets = units.map((unit, i) => sheet(i, quote.requiresReview ? 'Estimate for review' : 'Photo booth quotation',
    '<h2>' + escape(boothLabel(units, unit)) + '</h2>' + detailList(unit) + productionPlan(unit, saved ? quote.units[i] : null) + '<h3>Price breakdown</h3>' +
    (manual ? '<p>Pricing requires confirmation.</p>' : breakdown(quote.units[i])) + (i === units.length - 1 && !separateSummary ? finalSection : '')));
  if (separateSummary) sheets.push(sheet(units.length, quote.requiresReview ? 'Custom quote required' : 'Quotation summary', finalSection));
  return sheets.join('');
}


