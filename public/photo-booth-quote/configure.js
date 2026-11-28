import {
  ADDONS, DELIVERY_OPTIONS, EXPERIENCES, RATE_CARD, SCREEN_SIZES, addonIncluded, addonPrice, generationInfo, getBooth,
  isLongDayOfferEligible, scheduleInfo, staffingInfo, transportInfo, validateUnit,
} from './model.js';
import { renderVenue, installVenue } from './venue.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

const paths = {
  frame: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="m5 17 5-5 4 4 2-2 3 3"/><circle cx="15.5" cy="9" r="1.25"/>',
  aiPhoto: '<path d="m14 3 1.3 4.2L19.5 8.5l-4.2 1.3L14 14l-1.3-4.2-4.2-1.3 4.2-1.3zM6 12l1 3.3 3.3 1L7 17.4l-1 3.3-1-3.3-3.3-1 3.3-1z"/>',
  aiVideo: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 6.5v6l4 2"/>',
  copy: '<path d="M8 8V4.5h12V17h-3"/><rect x="3.5" y="8" width="13" height="12.5" rx="1.7"/>',
  printer: '<path d="M7 8V3h10v5M7 17H4V8h16v9h-3"/><path d="M7 14h10v7H7zM16 11h1"/>',
  qr: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h4M14 21v-3M18 21h3v-2"/>',
  email: '<rect x="2.7" y="5" width="18.6" height="14" rx="2"/><path d="m3.6 6.2 8.4 6.3 8.4-6.3"/>',
  queue: '<rect x="2" y="4.5" width="12.5" height="9" rx="1.5"/><path d="M8.25 13.5v3.25M5 17h6"/><rect x="13" y="11" width="9" height="7" rx="1.25"/><path d="M17.5 18v2M15 20h5"/>',
  stanchions: '<circle cx="5" cy="6" r="1.5"/><circle cx="19" cy="6" r="1.5"/><path d="M5 7.5v12m14-12v12M2 20h6m8 0h6M5 9c3.5 5.5 10.5 5.5 14 0"/>',
};

function icon(name) {
  return '<svg class="cfg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || '') + '</svg>';
}

function unitLabel(units, unit) {
  const booth = getBooth(unit.type);
  const same = units.filter(item => item.type === unit.type);
  return (booth?.name ?? 'Booth') + ' ' + (same.indexOf(unit) + 1);
}

function errorSlot(key) {
  return '<span class="cfg-error" data-cfg-error="' + key + '" id="cfg-error-' + key + '" hidden></span>';
}

function field(unit, key, label, type = 'text', attributes = '') {
  return '<div class="cfg-field"><label for="cfg-' + key + '">' + label +
    '</label><input data-cfg-field="' + key + '" id="cfg-' + key + '" type="' + type +
    '" value="' + escape(unit[key]) + '" aria-describedby="cfg-error-' + key + '" ' + attributes +
    '>' + errorSlot(key) + '</div>';
}

function clockLabel(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours % 12 || 12) + ':' + String(minutes).padStart(2, '0') + (hours >= 12 ? ' PM' : ' AM');
}

function hourLabel(duration) {
  const totalMinutes = Math.round(duration * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return [hours ? hours + (hours === 1 ? ' hour' : ' hours') : '', minutes ? minutes + ' min' : ''].filter(Boolean).join(' ');
}

const currency = new Intl.NumberFormat('en-AE', { maximumFractionDigits: 2 });
const money = rate => RATE_CARD.currency + ' ' + currency.format(rate);
const dailyRate = rate => rate === 0 ? 'Included' : money(rate) + ' / day';

function arrivalText(unit) {
  const info = scheduleInfo(unit);
  if (!info.standardSetupTime) return 'Our team arrives two hours before the event.';
  const when = info.standardSetupDayOffset === -1 ? ' on the previous day' : '';
  return 'Our team arrives at ' + clockLabel(info.standardSetupTime) + when + ', two hours before the event.';
}

function earlyChargeText(unit) {
  const { earlyHoursPerDay } = scheduleInfo(unit);
  return earlyHoursPerDay
    ? hourLabel(earlyHoursPerDay) + ' of staffed early arrival adds ' + money(earlyHoursPerDay * RATE_CARD.earlySetupHour) + ' per event day.'
    : 'Staffed early arrival is ' + money(RATE_CARD.earlySetupHour) + ' per extra hour on each event day.';
}

function dailyText(unit) {
  const { days, hoursPerDay } = scheduleInfo(unit);
  const labels = [];
  if (days) labels.push(days === 1 ? '1 event day' : days + ' event days');
  if (hoursPerDay) labels.push(hourLabel(hoursPerDay) + ' per day');
  if (hoursPerDay && unit.endTime < unit.startTime) labels.push('ends the following day');
  if (hoursPerDay) {
    const overtime = Math.max(0, hoursPerDay - RATE_CARD.includedHours) * RATE_CARD.overtimeHour;
    const discount = unit.longDayOffer && isLongDayOfferEligible(unit) ? RATE_CARD.longDayDiscountDay : 0;
    labels.push(money(RATE_CARD.boothDay[unit.type] + overtime - discount) + ' daily booth hire');
  }
  return labels.length ? labels.join(' · ') : '';
}

function copySource(units, unit) {
  const index = units.indexOf(unit);
  return units[index > 0 ? index - 1 : 1];
}

function selectUnitTiles(units, selected) {
  return '<nav class="cfg-units" aria-label="Choose a booth to configure">' + units.map(unit => {
    const chosen = unit === selected;
    return '<button type="button" data-cfg-unit="' + escape(unit.id) + '" aria-pressed="' + chosen +
      '" class="cfg-unit' + (chosen ? ' cfg-chosen' : '') + '">' + escape(unitLabel(units, unit)) + '</button>';
  }).join('') + '</nav>';
}

const previews = {
  frame: {gif: 'branded-frame.gif', poster: 'frame-poster.webp', alt: 'Example of a guest portrait with a branded event frame'},
  aiPhoto: {gif: 'ai-photo.gif', poster: 'photo-poster.webp', alt: 'Example of a guest portrait transformed with AI'},
};
const connectivity = {
  frame: 'Capture works offline.',
  aiPhoto: 'Wi-Fi required',
  aiVideo: 'Wi-Fi required',
};

function preview(item) {
  if (item.id === 'aiVideo') {
    return '<div class="cfg-preview"><video src="./assets/ai-video.mp4" controls playsinline preload="metadata" poster="./assets/video-poster.webp" aria-label="AI video experience sample">Your browser can open the <a href="./assets/ai-video.mp4">AI video sample</a>.</video></div>';
  }
  const media = previews[item.id];
  const playing = !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const action = playing ? 'Pause' : 'Play';
  return '<div class="cfg-preview"><img src="./assets/' + (playing ? media.gif : media.poster) +
    '" alt="' + media.alt + '"><button type="button" class="cfg-preview-control" data-cfg-preview="' + item.id +
    '" data-playing="' + playing + '" aria-label="' + action + ' ' + escape(item.name) + ' preview">' + action + '</button></div>';
}

function experienceSection(unit) {
  const rates = {
    frame: 'Included in booth hire',
    aiPhoto: money(RATE_CARD.aiPhotoRate) + ' / photo',
    aiVideo: money(RATE_CARD.videoRate15Seconds['720p']) + ' at 720p · ' + money(RATE_CARD.videoRate15Seconds['1080p']) + ' at 1080p for 15 seconds',
  };
  const cards = EXPERIENCES.map(item => '<div class="cfg-experience-card">' + preview(item) +
    '<label class="cfg-experience-option"><input type="radio" name="cfg-experience" data-cfg-field="experience" value="' +
    escape(item.id) + '" aria-describedby="cfg-error-experience"' + (unit.experience === item.id ? ' checked' : '') + '>' +
    '<span class="cfg-choice-text"><strong>' + escape(item.name) +
    '</strong><span>' + escape(item.description) + '</span><span class="cfg-network">' + connectivity[item.id] +
    '</span><span class="cfg-rate">' + rates[item.id] + '</span></span></label></div>').join('');
  return '<section class="cfg-panel" aria-labelledby="cfg-exp-title"><h2 id="cfg-exp-title">Experience</h2><fieldset class="cfg-choice-list"><legend class="cfg-sr">Choose an experience</legend>' +
    cards + '</fieldset>' + errorSlot('experience') + '</section>';
}

function standSizeSection(unit) {
  if (unit.type !== 'classic') return '';
  const choices = SCREEN_SIZES.map(size => '<label class="cfg-size"><input type="radio" name="cfg-stand-size" data-cfg-field="screenSize" value="' +
    size + '" aria-describedby="cfg-error-screenSize"' + ((unit.screenSize ?? 24) === size ? ' checked' : '') + '><span>' + size + '″</span></label>').join('');
  return '<section class="cfg-panel" aria-labelledby="cfg-size-title"><div class="cfg-section-head"><h2 id="cfg-size-title">Display size</h2><span class="cfg-optional">Same hire rate for all sizes</span></div>' +
    '<fieldset class="cfg-sizes"><legend class="cfg-sr">Choose a display size in inches</legend>' + choices + '</fieldset>' + errorSlot('screenSize') + '</section>';
}

function reportSection(unit) {
  const options = [[0, 'Event day'], [-1, 'Previous day']].map(([value, text]) =>
    '<option value="' + value + '"' + (Number(unit.reportDayOffset) === value ? ' selected' : '') + '>' + text + '</option>').join('');
  return '<div class="cfg-setup"><div class="cfg-arrival">' + icon('clock') + '<div><strong>Setup &amp; reporting</strong><p data-cfg-arrival>' + escape(arrivalText(unit)) +
    '</p></div></div><label class="cfg-early"><input type="checkbox" data-cfg-field="earlySetup"' + (unit.earlySetup ? ' checked' : '') +
    '>Request an earlier staffed arrival · ' + money(RATE_CARD.earlySetupHour) + ' / hour</label><div class="cfg-report" data-cfg-report' + (unit.earlySetup ? '' : ' hidden') + '><p data-cfg-earlycharge>' + escape(earlyChargeText(unit)) + '</p><p>Unattended equipment installation the day before is available by arrangement.</p><div class="cfg-input-grid"><div class="cfg-field"><label for="cfg-reportDayOffset">Reporting day</label>' +
    '<select id="cfg-reportDayOffset" data-cfg-field="reportDayOffset" aria-describedby="cfg-error-reportDayOffset">' + options + '</select>' + errorSlot('reportDayOffset') +
    '</div>' + field(unit, 'reportTime', 'Reporting time', 'time') + '</div></div></div>';
}

function transportLabel(unit) {
  if (!unit.venue.trim()) return 'Enter the venue to see the transport fee.';
  const {emirate, rate} = transportInfo(unit);
  const area = emirate ? ' to ' + emirate : '';
  return rate == null ? 'Transport' + area + ' · Rate to be confirmed.' :
    'Transport' + area + ' · ' + (rate === 0 ? 'Included' : money(rate) + ' per venue per event day.');
}

function packageOffer(unit) {
  const regular = RATE_CARD.boothDay.mirror + (12 - RATE_CARD.includedHours) * RATE_CARD.overtimeHour;
  return '<div class="cfg-package" data-cfg-package' + (isLongDayOfferEligible(unit) ? '' : ' hidden') + '>' +
    '<label class="cfg-early"><input type="checkbox" data-cfg-field="longDayOffer"' + (unit.longDayOffer && isLongDayOfferEligible(unit) ? ' checked' : '') +
    '>Apply four-day Mirror package</label><p>For four 12-hour days, booth hire drops from ' +
    money(regular) + ' to ' + money(regular - RATE_CARD.longDayDiscountDay) + ' per day. Save ' + money(RATE_CARD.longDayDiscountDay) + ' each day.</p></div>';
}

function eventSection(units, unit) {
  const source = copySource(units, unit);
  const copy = source && (source.venue || source.startDate || source.startTime || source.endTime || source.endDate || source.earlySetup) ? '<button type="button" class="cfg-copy" data-cfg-copy>' + icon('copy') + 'Copy details from ' + escape(unitLabel(units, source)) + '</button>' : '';
  return '<section class="cfg-panel" aria-labelledby="cfg-event-title"><div class="cfg-section-head"><h2 id="cfg-event-title">Event details</h2>' + copy + '</div>' +
    '<p class="cfg-hire-rate"><strong>' + money(RATE_CARD.boothDay[unit.type]) + '</strong> covers the first ' + RATE_CARD.includedHours +
    ' hours each day. Additional time is ' + money(RATE_CARD.overtimeHour) + ' per hour.' +
    (unit.type === 'mirror' ? '<span>The Mirror package includes props, a branded frame and a welcome screen.</span>' : '') + '</p>' +
    renderVenue(unit) + '<p class="cfg-transport" data-cfg-transport>' + escape(transportLabel(unit)) + '</p>' +
    '<div class="cfg-input-grid">' + field(unit, 'startDate', 'Start date', 'date') +
    field(unit, 'endDate', 'End date', 'date', unit.startDate ? 'min="' + escape(unit.startDate) + '"' : '') + '</div><div class="cfg-input-grid">' +
    field(unit, 'startTime', 'Daily start time', 'time') + field(unit, 'endTime', 'Daily end time', 'time') + '</div><p class="cfg-duration" data-cfg-duration>' +
    escape(dailyText(unit)) + '</p>' + packageOffer(unit) + reportSection(unit) + '</section>';
}

const isAi = unit => unit.experience === 'aiPhoto' || unit.experience === 'aiVideo';
const countLabel = (n, noun) => currency.format(n) + ' ' + noun + (n === 1 ? '' : 's');
const isBlank = value => value === '' || value == null;

function generationEstimate(unit) {
  if (!isAi(unit)) return '';
  const info = generationInfo(unit);
  const {days, hoursPerDay} = scheduleInfo(unit);
  const output = unit.experience === 'aiVideo' ? 'video' : 'photo';
  const hourlyCapacity = 3600 / info.cycleSeconds;
  const equipment = unit.addons.includes('queue') ? 'with queue management' : 'without queue management';
  const rows = ['Allow ' + info.cycleSeconds + ' seconds per session ' + equipment + ' (about ' + currency.format(hourlyCapacity) + ' per hour).'];
  if (info.capacity != null) {
    rows.push(hourLabel(hoursPerDay) + ' per day × ' + countLabel(days, 'day') + ' gives an estimated maximum of ' + countLabel(info.capacity, output) + ' at this booth.');
  } else {
    rows.push('Set the event dates and times to estimate this booth’s capacity.');
  }
  if (info.expectedGuests != null && info.capacity != null) {
    if (info.guestShortfall > 0) {
      rows.push('At one session per guest, around ' + countLabel(info.guestShortfall, 'guest') + ' may miss a turn. Extend the hours or split attendance across booths.');
    } else if (info.mode === 'fixed' && info.allocation != null && info.allocation < info.expectedGuests) {
      rows.push('The allowance covers ' + countLabel(info.allocation, output) + ' for ' + countLabel(info.expectedGuests, 'expected guest') + '.');
    } else {
      rows.push('The schedule allows one session for each of the ' + countLabel(info.expectedGuests, 'expected guest') + '.');
    }
  }
  if (info.overCapacity) {
    rows.push('Lower the reserved quantity to ' + currency.format(info.capacity) + ' or increase this booth’s capacity.');
  }
  const plan = info.mode === 'unlimited' ? 'Unlimited' : 'Fixed quantity';
  const showCost = info.quantity != null && info.unitPrice != null && info.amount != null;
  const formula = showCost ? countLabel(info.quantity, output) + ' × ' + money(info.unitPrice) + ' = ' + money(info.amount) : money(info.unitPrice) + ' per ' + output;
  return '<div class="cfg-estimate-head"><strong>' + plan + ' · AI generation</strong><span>' + escape(formula) + '</span></div>' +
    rows.map(row => '<p>' + escape(row) + '</p>').join('');
}

function selectField(unit, key, label, choices, initial) {
  const options = choices.map(([value, name]) => '<option value="' + value + '"' +
    ((unit[key] ?? initial) === value ? ' selected' : '') + '>' + name + '</option>').join('');
  return '<div class="cfg-field"><label for="cfg-' + key + '">' + label + '</label><select id="cfg-' + key + '" data-cfg-field="' + key +
    '" aria-describedby="cfg-error-' + key + '">' + options + '</select>' + errorSlot(key) + '</div>';
}

function attendanceSection(units, unit) {
  const ai = isAi(unit);
  const mode = unit.aiMode ?? 'fixed';
  const modes = [
    ['fixed', 'Fixed quantity', 'Reserve a set number of photos or videos.'],
    ['unlimited', 'Unlimited during event hours', 'Guests can return for more. Pricing uses the full capacity of this booth.'],
  ].map(([value, label, description]) => '<label class="cfg-staff-choice"><input type="radio" name="cfg-ai-mode" data-cfg-field="aiMode" value="' +
    value + '" aria-describedby="cfg-error-aiMode"' + (mode === value ? ' checked' : '') + '><span><strong>' + label +
    '</strong><span class="cfg-hint">' + description + '</span></span></label>').join('');
  const guestHint = units.length > 1 ? 'Split your expected guests between the booths they will use. Enter this booth’s share across all event days.' :
    'Enter how many people you expect to use this booth across all event days.';
  return '<section class="cfg-panel" aria-labelledby="cfg-guest-title"><h2 id="cfg-guest-title">Guests' +
    '<span data-cfg-ai-heading' + (ai ? '' : ' hidden') + '> &amp; AI pricing</span></h2>' +
    '<div class="cfg-field cfg-guests"><label for="cfg-expectedGuests">Expected guests at this booth <span class="cfg-optional" data-cfg-guests-optional' +
    (ai ? ' hidden' : '') + '>(optional)</span></label><input type="number" min="1" step="1" inputmode="numeric" id="cfg-expectedGuests" data-cfg-field="expectedGuests" value="' +
    escape(unit.expectedGuests) + '" aria-describedby="cfg-guest-hint cfg-error-expectedGuests"' + (ai ? ' required' : '') + '><p id="cfg-guest-hint" class="cfg-hint">' +
    guestHint + '</p>' + errorSlot('expectedGuests') + '</div>' +
    '<div class="cfg-generation" data-cfg-generation' + (ai ? '' : ' hidden') + '><div class="cfg-input-grid cfg-video-format" data-cfg-video-format' +
    (unit.experience === 'aiVideo' ? '' : ' hidden') + '>' +
    selectField(unit, 'videoResolution', 'Video resolution', [['720p', '720p'], ['1080p', '1080p']], '720p') +
    selectField(unit, 'videoSeconds', 'Length of each video', [[5, '5 seconds'], [10, '10 seconds'], [15, '15 seconds']], 15) + '</div>' +
    '<fieldset class="cfg-plan-options"><legend>AI generation plan</legend><div class="cfg-staff-options">' + modes + '</div></fieldset>' + errorSlot('aiMode') +
    '<div class="cfg-field cfg-allocation" data-cfg-allocation' + (mode === 'unlimited' ? ' hidden' : '') +
    '><label for="cfg-aiQuantity">Reserved quantity <span class="cfg-optional">(optional)</span></label><input type="number" min="1" step="1" inputmode="numeric" id="cfg-aiQuantity" data-cfg-field="aiQuantity" value="' +
    escape(unit.aiQuantity) + '" placeholder="' + escape(unit.expectedGuests || 'One per expected guest') + '" aria-describedby="cfg-quantity-hint cfg-error-aiQuantity">' +
    '<p id="cfg-quantity-hint" class="cfg-hint">Leave blank for one per expected guest. Enter fewer for groups, or more for repeat sessions.</p>' + errorSlot('aiQuantity') + '</div>' +
    '<label class="cfg-early cfg-plan-queue"><input type="checkbox" data-cfg-field="planQueue"' + (unit.addons.includes('queue') ? ' checked' : '') +
    '>Include a collection screen with queue management · ' + dailyRate(addonPrice('queue', unit.type)) + '</label>' +
    '<div class="cfg-estimate" data-cfg-estimate aria-live="polite" aria-atomic="true">' + generationEstimate(unit) + '</div></div></section>';
}

const addonMedia = {
  printer: ['printer.webp', 'On-site photo printer for guest prints'],
  queue: ['queue-setup.webp', 'Mirror photo booth beside a separate collection touchscreen'],
  stanchions: ['queue-barriers.webp', 'Queue posts and barriers for the guest line'],
};

function addonRow(unit, item) {
  const printNote = item.id === 'printer'
    ? '<span data-cfg-print-note' + (unit.experience === 'aiVideo' ? '' : ' hidden') + '>For AI video, the printer produces a still image.</span>'
    : '';
  const price = addonPrice(item.id, unit.type);
  const digital = ['qr', 'email'].includes(item.id);
  const billing = digital ? money(price) + ' / setup' : dailyRate(price);
  const inclusion = addonIncluded(item.id, unit.type) ? ' · Included in Mirror hire' : '';
  const detail = digital ? ' · Wi-Fi required' : item.id === 'printer' && unit.type === 'mirror' ? ' · Unlimited still prints' : '';
  const rate = billing + inclusion + detail;
  const photo = addonMedia[item.id];
  const visual = photo ? '<img class="cfg-addon-photo" loading="lazy" src="./assets/' + photo[0] + '" alt="' + photo[1] + '">' :
    '<span class="cfg-symbol">' + icon(item.id) + '</span>';
  return '<label class="cfg-addon">' + visual + '<span class="cfg-choice-text"><strong>' + escape(item.name) + '</strong><span>' + escape(item.description) +
    '</span>' + printNote + '<span class="cfg-rate">' + rate + '</span></span><input type="checkbox" data-cfg-addon value="' + escape(item.id) + '"' +
    (unit.addons.includes(item.id) ? ' checked' : '') + '></label>';
}

function deliverySection(unit) {
  const hasScreen = unit.addons.includes('queue');
  return '<section class="cfg-panel" aria-labelledby="cfg-delivery-title"><div class="cfg-section-head"><h2 id="cfg-delivery-title">Guest delivery</h2><span class="cfg-optional">Select any</span></div><div class="cfg-addons">' +
    DELIVERY_OPTIONS.map(item => addonRow(unit, item)).join('') +
    '</div><aside class="cfg-screen-tip" data-cfg-email-tip' + (unit.addons.includes('email') ? '' : ' hidden') +
    '><img class="cfg-screen-photo" src="./assets/queue-setup.webp" loading="lazy" alt="Mirror booth with a separate guest collection screen beside it">' +
    '<div><strong>Collection screen for email</strong><p>Guests can enter their email at the main booth. A side screen lets the next guest start while the first finishes.</p>' +
    '<span class="cfg-rate">' + dailyRate(addonPrice('queue', unit.type)) + '</span></div>' +
    '<button type="button" class="cfg-tip-button" data-cfg-add-screen' + (hasScreen ? ' hidden' : '') + '>Add collection screen</button>' +
    '<span class="cfg-tip-selected" data-cfg-screen-selected' + (hasScreen ? '' : ' hidden') + '>Collection screen selected</span></aside></section>';
}

function screenPlacement(unit) {
  const sides = [['either', 'Either side'], ['left', 'Left of booth'], ['right', 'Right of booth']];
  const options = sides.map(([id, name]) => '<option value="' + id + '"' + ((unit.screenSide || 'either') === id ? ' selected' : '') + '>' + name + '</option>').join('');
  return '<div class="cfg-field cfg-screen-placement" data-cfg-placement' + (unit.addons.includes('queue') ? '' : ' hidden') +
    '><label for="cfg-screenSide">Collection screen placement</label><select id="cfg-screenSide" data-cfg-field="screenSide" aria-describedby="cfg-error-screenSide">' +
    options + '</select>' + errorSlot('screenSide') + '</div>';
}

function addonsSection(unit) {
  const rows = ADDONS.map(item => addonRow(unit, item) + (item.id === 'queue' ? screenPlacement(unit) : '')).join('');
  return '<section class="cfg-panel" aria-labelledby="cfg-addon-title"><div class="cfg-section-head"><h2 id="cfg-addon-title">Event add-ons</h2><span class="cfg-optional">Optional</span></div><div class="cfg-addons">' +
    rows + '</div>' + errorSlot('addons') + '</section>';
}

function staffEstimate(unit) {
  const staff = staffingInfo(unit);
  const {days} = scheduleInfo(unit);
  if (!(staff.people > 0)) return '';
  if (staff.amount == null) return 'Set the event schedule and daily shift to calculate staffing.';
  return countLabel(staff.people, 'promoter') + ' × ' + hourLabel(staff.hoursPerDay) + ' × ' +
    countLabel(days, 'day') + ' at ' + money(staff.rate) + ' per person per hour = ' + money(staff.amount) + '.';
}

function shiftSection(unit) {
  const staff = staffingInfo(unit);
  const custom = !isBlank(unit.staffHoursPerDay);
  const minutes = custom && Number(unit.staffHoursPerDay) > 0 ? Math.round(unit.staffHoursPerDay * 60) : null;
  const hoursValue = minutes == null ? '' : Math.floor(minutes / 60);
  const minutesValue = minutes == null ? '' : minutes % 60;
  return '<div class="cfg-shift" data-cfg-shift' + (staff.people ? '' : ' hidden') + '><strong>Daily promoter shift</strong>' +
    '<p class="cfg-hint" data-cfg-shift-default>' + shiftDefault(unit) + '</p>' +
    '<label class="cfg-early"><input type="checkbox" data-cfg-field="customShift"' + (custom ? ' checked' : '') + '>Choose a shorter daily shift</label>' +
    '<div class="cfg-input-grid cfg-shift-fields" data-cfg-shift-fields' + (custom ? '' : ' hidden') + '>' +
    '<div class="cfg-field"><label for="cfg-shift-hours">Hours</label><input id="cfg-shift-hours" data-cfg-field="staffHoursPerDay" type="number" min="0" max="23" step="1" inputmode="numeric" value="' +
    hoursValue + '" placeholder="0" aria-describedby="cfg-error-staffHoursPerDay"></div>' +
    '<div class="cfg-field"><label for="cfg-shift-minutes">Minutes</label><input id="cfg-shift-minutes" data-cfg-field="staffMinutes" type="number" min="0" max="59" step="1" inputmode="numeric" value="' +
    minutesValue + '" placeholder="0" aria-describedby="cfg-error-staffHoursPerDay"></div></div>' + errorSlot('staffHoursPerDay') +
    '<p class="cfg-staff-estimate" aria-live="polite" data-cfg-staff-estimate>' + escape(staffEstimate(unit)) + '</p></div>';
}

function shiftDefault(unit) {
  const hours = scheduleInfo(unit).hoursPerDay;
  const hint = hours ? 'Full event coverage is ' + hourLabel(hours) + ' per promoter per day.' : 'Promoters cover the event hours by default.';
  if (unit.staffing !== 'b3yond' || isBlank(unit.staffHoursPerDay)) return hint;
  const shift = staffingInfo(unit).hoursPerDay;
  return shift != null && hours != null && shift < hours
    ? hint + ' Your team supplies an on-site promoter for the remaining ' + hourLabel(hours - shift) + ' each day.'
    : hint;
}

function staffingSection(unit) {
  const staffing = unit.staffing || 'client';
  const staffOptions = [
    ['client', 'We supply our own promoter', 'No staffing charge'],
    ['b3yond', 'B3YOND supplies a promoter', money(RATE_CARD.promoterHour) + ' / hour'],
  ];
  const choices = staffOptions.map(([id, label, price]) => '<label class="cfg-staff-choice"><input type="radio" name="cfg-staffing" data-cfg-field="staffing" value="' +
    id + '" aria-describedby="cfg-error-staffing"' + (staffing === id ? ' checked' : '') + '><span><strong>' + label + '</strong><span class="cfg-rate">' + price + '</span></span></label>').join('');
  const extraOptions = Array.from({length: 21}, (_, count) => '<option value="' + count + '"' +
    ((unit.additionalStaff ?? 0) === count ? ' selected' : '') + '>' + (count === 0 ? 'None' : count) + '</option>').join('');
  return '<section class="cfg-panel" aria-labelledby="cfg-staff-title"><h2 id="cfg-staff-title">Staffing</h2>' +
    '<p class="cfg-hint cfg-staff-intro">Remote technical support is included. Choose who will provide the on-site promoter for this booth.</p>' +
    '<fieldset class="cfg-staff-options"><legend class="cfg-sr">On-site promoter</legend>' + choices + '</fieldset>' + errorSlot('staffing') +
    '<div class="cfg-field cfg-extra-staff"><label for="cfg-additionalStaff">Additional B3YOND promoters</label>' +
    '<select id="cfg-additionalStaff" data-cfg-field="additionalStaff" aria-describedby="cfg-promoter-rate cfg-error-additionalStaff">' + extraOptions + '</select>' +
    '<p class="cfg-hint" id="cfg-promoter-rate">' + money(RATE_CARD.promoterHour) + ' per person per hour.</p>' + errorSlot('additionalStaff') + '</div>' + shiftSection(unit) + '</section>';
}

export function renderConfig(units, activeId) {
  const unit = units.find(item => item.id === activeId) ?? units[0];
  if (!unit) return '';
  return '<div class="cfg" data-cfg>' + selectUnitTiles(units, unit) + standSizeSection(unit) + experienceSection(unit) + eventSection(units, unit) +
    attendanceSection(units, unit) + deliverySection(unit) + addonsSection(unit) + staffingSection(unit) + '<div class="cfg-sr" role="status" data-cfg-status></div></div>';
}

function updateErrors(root, unit) {
  const errors = validateUnit(unit);
  for (const slot of root.querySelectorAll('[data-cfg-error]')) {
    const key = slot.dataset.cfgError;
    const error = errors[key] || '';
    slot.hidden = !error;
    slot.textContent = error;
    root.querySelectorAll('[data-cfg-field="' + key + '"]').forEach(input => {
      if (error) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    });
  }
  return errors;
}

export function showErrors(root, unit) {
  const panel = root.querySelector('[data-cfg]');
  if (!panel) return;
  panel.dataset.cfgValidated = 'true';
  const errors = updateErrors(root, unit);
  const key = Object.keys(errors)[0];
  if (key) root.querySelector('[data-cfg-field="' + key + '"]')?.focus();
}

export function installConfig(root, { getUnits, getActiveId, setActive, changed }) {
  const activeUnit = () => getUnits().find(unit => unit.id === getActiveId()) ?? getUnits()[0];
  installVenue(root, {getUnit: activeUnit, changed: () => changed({render: true})});
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-cfg-unit], [data-cfg-copy], [data-cfg-add-screen], [data-cfg-preview]');
    if (!button) return;
    if (button.hasAttribute('data-cfg-preview')) {
      const id = button.dataset.cfgPreview;
      const media = previews[id];
      const playing = button.dataset.playing !== 'true';
      const action = playing ? 'Pause' : 'Play';
      button.parentElement.querySelector('img').src = './assets/' + (playing ? media.gif : media.poster);
      button.dataset.playing = String(playing);
      button.textContent = action;
      button.setAttribute('aria-label', action + ' ' + EXPERIENCES.find(item => item.id === id).name + ' preview');
    } else if (button.hasAttribute('data-cfg-add-screen')) {
      const screen = root.querySelector('[data-cfg-addon][value="queue"]');
      if (!screen.checked) screen.click();
      root.querySelector('[data-cfg-field="screenSide"]').focus();
    } else if (button.hasAttribute('data-cfg-unit')) {
      const unit = getUnits().find(item => String(item.id) === button.dataset.cfgUnit);
      if (unit && unit.id !== getActiveId()) {
        setActive(unit.id);
        root.querySelector('.cfg-chosen')?.focus();
      }
    } else {
      const unit = activeUnit();
      const source = copySource(getUnits(), unit);
      if (!source) return;
      for (const key of ['venue', 'venueEmirate', 'startDate', 'endDate', 'startTime', 'endTime', 'earlySetup', 'reportTime', 'reportDayOffset']) {
        unit[key] = source[key];
      }
      if (!isLongDayOfferEligible(unit)) unit.longDayOffer = false;
      changed({render: true});
      root.querySelector('[data-cfg-copy]')?.focus();
      const status = root.querySelector('[data-cfg-status]');
      if (status) status.textContent = 'Copied event details from ' + unitLabel(getUnits(), source) + '.';
    }
  });

  function edit(event) {
    const input = event.target.closest('[data-cfg-field], [data-cfg-addon]');
    if (!input) return;
    const unit = activeUnit();
    if (!unit) return;
    const key = input.dataset.cfgField;
    // Keep numeric fields and estimates live without replacing a focused control.
    if (['text', 'number'].includes(input.type) !== (event.type === 'input')) return;
    if (key === 'planQueue') {
      root.querySelector('[data-cfg-addon][value="queue"]').click();
      return;
    }
    if (input.hasAttribute('data-cfg-addon')) {
      unit.addons = [...root.querySelectorAll('[data-cfg-addon]:checked')].map(el => el.value);
      const hasScreen = unit.addons.includes('queue');
      root.querySelector('[data-cfg-field="planQueue"]').checked = hasScreen;
      root.querySelector('[data-cfg-email-tip]').hidden = !unit.addons.includes('email');
      root.querySelector('[data-cfg-add-screen]').hidden = hasScreen;
      root.querySelector('[data-cfg-screen-selected]').hidden = !hasScreen;
      root.querySelector('[data-cfg-placement]').hidden = !hasScreen;
    } else if (key === 'earlySetup') {
      unit.earlySetup = input.checked;
      if (unit.earlySetup && !unit.reportTime) {
        unit.reportDayOffset = scheduleInfo(unit).standardSetupDayOffset || 0;
        root.querySelector('[data-cfg-field="reportDayOffset"]').value = String(unit.reportDayOffset);
      }
      root.querySelector('[data-cfg-report]').hidden = !unit.earlySetup;
    } else if (key === 'startDate') {
      if (input.value && (!unit.endDate || unit.endDate === unit.startDate)) {
        unit.endDate = input.value;
        root.querySelector('[data-cfg-field="endDate"]').value = input.value;
      }
      unit.startDate = input.value;
      root.querySelector('[data-cfg-field="endDate"]').min = input.value;
    } else if (key === 'customShift') {
      unit.staffHoursPerDay = input.checked ? 0 : '';
      root.querySelector('#cfg-shift-hours').value = '';
      root.querySelector('#cfg-shift-minutes').value = '';
      root.querySelector('[data-cfg-shift-fields]').hidden = !input.checked;
      if (input.checked) root.querySelector('#cfg-shift-hours').focus();
    } else if (key === 'staffHoursPerDay' || key === 'staffMinutes') {
      const hoursInput = root.querySelector('#cfg-shift-hours');
      const minutesInput = root.querySelector('#cfg-shift-minutes');
      unit.staffHoursPerDay = hoursInput.validity.valid && minutesInput.validity.valid
        ? Number(hoursInput.value) + Number(minutesInput.value) / 60 : -1;
    } else if (key === 'longDayOffer') {
      unit.longDayOffer = input.checked && isLongDayOfferEligible(unit);
    } else {
      const numeric = ['reportDayOffset', 'screenSize', 'additionalStaff', 'expectedGuests', 'aiQuantity', 'videoSeconds'].includes(key);
      unit[key] = numeric && input.value !== '' ? Number(input.value) : input.value;
      if (numeric && input.validity.badInput) unit[key] = -1;
      if (key === 'experience') {
        root.querySelector('[data-cfg-print-note]').hidden = unit.experience !== 'aiVideo';
      }
      if (key === 'venue') {
        unit.venueEmirate = '';
        root.querySelector('[data-cfg-transport]').textContent = transportLabel(unit);
      }
    }
    const eligible = isLongDayOfferEligible(unit);
    root.querySelector('[data-cfg-package]').hidden = !eligible;
    if (!eligible && unit.longDayOffer) {
      unit.longDayOffer = false;
      root.querySelector('[data-cfg-field="longDayOffer"]').checked = false;
    }
    root.querySelector('[data-cfg-arrival]').textContent = arrivalText(unit);
    root.querySelector('[data-cfg-duration]').textContent = dailyText(unit);
    root.querySelector('[data-cfg-earlycharge]').textContent = earlyChargeText(unit);
    const ai = isAi(unit);
    root.querySelector('[data-cfg-generation]').hidden = !ai;
    root.querySelector('[data-cfg-ai-heading]').hidden = !ai;
    root.querySelector('[data-cfg-guests-optional]').hidden = ai;
    root.querySelector('#cfg-expectedGuests').required = ai;
    root.querySelector('[data-cfg-video-format]').hidden = unit.experience !== 'aiVideo';
    root.querySelector('[data-cfg-allocation]').hidden = unit.aiMode === 'unlimited';
    root.querySelector('#cfg-aiQuantity').placeholder = unit.expectedGuests > 0 ? String(unit.expectedGuests) : 'One per expected guest';
    const estimate = root.querySelector('[data-cfg-estimate]');
    const estimateMarkup = generationEstimate(unit);
    if (estimate.innerHTML !== estimateMarkup) estimate.innerHTML = estimateMarkup;
    root.querySelector('[data-cfg-shift]').hidden = !staffingInfo(unit).people;
    root.querySelector('[data-cfg-shift-default]').textContent = shiftDefault(unit);
    root.querySelector('[data-cfg-staff-estimate]').textContent = staffEstimate(unit);
    if (root.querySelector('[data-cfg-validated]')) updateErrors(root, unit);
    changed({render: false});
  }
  root.addEventListener('input', edit);
  root.addEventListener('change', edit);
}
