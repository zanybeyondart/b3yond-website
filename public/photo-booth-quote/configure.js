import {
  ADDONS, DELIVERY_OPTIONS, EXPERIENCES, RATE_CARD, SCREEN_SIZES, VIDEO_RESOLUTIONS, VIDEO_SECONDS, addonIncluded, addonPrice, artworkPricing, boothHireRate, generationInfo, getBooth,
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
const cents = new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = rate => RATE_CARD.currency + ' ' + (Number.isInteger(rate) ? currency : cents).format(rate);
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
    labels.push(money(boothHireRate(unit) + overtime - discount) + ' daily booth hire');
  }
  return labels.length ? labels.join(' · ') : '';
}

function copySource(units, unit) {
  const index = units.indexOf(unit);
  const candidates = [...units.slice(0, index).reverse(), ...units.slice(index + 1)];
  return candidates.find(item => item.venue && item.startDate && item.endDate && item.startTime && item.endTime)
    ?? candidates.find(item => item.venue || item.startDate || item.startTime || item.endDate || item.endTime);
}

function selectUnitTiles(units, selected) {
  if (units.length < 2) return '';
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
  frame: 'Works offline',
  aiPhoto: 'Wi-Fi required',
  aiVideo: 'Wi-Fi required',
};

function preview(item) {
  if (item.id === 'aiVideo') {
    return '<div class="cfg-preview cfg-video-preview"><video src="./assets/ai-video-event-sample.mp4" playsinline preload="none" poster="./assets/ai-video-event-poster.webp" aria-label="AI video experience sample">Your browser can open the <a href="./assets/ai-video-event-sample.mp4">AI video sample</a>.</video>' +
      '<button class="cfg-video-start" data-cfg-play-video type="button" aria-label="Play AI video sample"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4.5v15l13-7.5z"/></svg></button></div>';
  }
  const media = previews[item.id];
  const playing = !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const action = playing ? 'Pause' : 'Play';
  return '<div class="cfg-preview"><img src="./assets/' + (playing ? media.gif : media.poster) +
    '" alt="' + media.alt + '"><button type="button" class="cfg-preview-control" data-cfg-preview="' + item.id +
    '" data-playing="' + playing + '" aria-label="' + action + ' ' + escape(item.name) + ' preview">' + action + '</button></div>';
}

function experienceSection(unit, artworkCount) {
  const cards = EXPERIENCES.map(item => '<div class="cfg-experience-card">' + preview(item) +
    '<label class="cfg-experience-option"><input type="radio" name="cfg-experience" data-cfg-field="experience" value="' +
    escape(item.id) + '" aria-describedby="cfg-error-experience"' + (unit.experience === item.id ? ' checked' : '') + '>' +
    '<span class="cfg-choice-text"><strong>' + escape(item.name) +
    '</strong><span class="cfg-network">' + connectivity[item.id] + '</span></span></label></div>').join('');
  return '<section class="cfg-panel" aria-labelledby="cfg-exp-title"><h2 id="cfg-exp-title" class="cfg-sr">Guest experience</h2><fieldset class="cfg-choice-list"><legend class="cfg-sr">Choose an experience</legend>' +
    cards + '</fieldset>' + errorSlot('experience') + outputOptions(unit, artworkCount) + '</section>';
}

function videoPrice(unit, resolution) {
  return money(generationInfo({...unit, experience: 'aiVideo', videoResolution: resolution}).unitPrice) + ' / video';
}

function artworkControls(unit, artworkCount) {
  const {count, amount} = artworkPricing(artworkCount);
  return '<div class="cfg-designs" data-cfg-designs' + (unit.customArtwork === true ? '' : ' hidden') +
    '><div class="cfg-designs-header"><strong id="cfg-designs-title">Designs for this booking</strong>' +
    '<div class="cfg-design-count" role="group" aria-labelledby="cfg-designs-title" aria-describedby="cfg-design-pricing">' +
    '<button type="button" data-cfg-design-step="-1" aria-label="Remove one artwork design"' + (count <= 1 ? ' disabled' : '') + '>−</button>' +
    '<output aria-label="Number of artwork designs" aria-live="off" data-cfg-design-count>' + count + '</output>' +
    '<button type="button" data-cfg-design-step="1" aria-label="Add one artwork design">+</button></div></div>' +
    '<p class="cfg-hint" id="cfg-design-pricing">' + money(RATE_CARD.customArtworkSetup) + ' covers the first 2 designs. Each additional pair is ' +
    money(RATE_CARD.customArtworkExtraPair) + '. A single extra design counts as a pair.</p>' +
    '<div class="cfg-design-total"><span>Artwork fee across all booths</span><strong data-cfg-design-total>' + money(amount) + '</strong></div></div>';
}

function outputOptions(unit, artworkCount) {
  const withPrint = unit.addons.includes('printer');
  const photoChoices = [
    ['digital', 'Digital only', RATE_CARD.aiPhotoRate, !withPrint],
    ['print', 'Digital + one print', RATE_CARD.aiPhotoPrintRate, withPrint],
  ].map(([value, label, rate, selected]) =>
    '<label class="cfg-staff-choice"><input type="radio" name="cfg-photo-output" data-cfg-field="photoOutput" value="' + value + '"' +
    (selected ? ' checked' : '') + '><span><strong>' + label + '</strong><span class="cfg-rate">' + money(rate) + ' / photo</span></span></label>'
  ).join('');
  const equipment = addonIncluded('printer', unit) ? 'Printer hire is included with the Mirror Booth.' :
    'Printer hire adds ' + dailyRate(addonPrice('printer', unit)) + (unit.type === 'classic' ? ', including email setup.' : '.');
  const artwork = '<fieldset class="cfg-plan-options cfg-artwork"><legend>AI photo theme</legend><div class="cfg-format-choices">' +
    [['standard', 'Standard theme', 'Included'], ['custom', 'Custom artwork', 'From ' + money(RATE_CARD.customArtworkSetup) + ' / booking']]
      .map(([value, name, cost]) => '<label class="cfg-staff-choice"><input type="radio" name="cfg-artwork" data-cfg-field="customArtwork" value="' +
        value + '"' + ((value === 'custom') === (unit.customArtwork === true) ? ' checked' : '') +
        '><span><strong>' + name + '</strong><span class="cfg-rate">' + cost + '</span></span></label>').join('') +
    '</div></fieldset>' + errorSlot('customArtwork') + artworkControls(unit, artworkCount);
  const resolutions = VIDEO_RESOLUTIONS.map(resolution =>
    '<label class="cfg-staff-choice"><input type="radio" name="cfg-resolution" data-cfg-field="videoResolution" value="' + resolution +
    '" aria-describedby="cfg-error-videoResolution"' + ((unit.videoResolution ?? '720p') === resolution ? ' checked' : '') +
    '><span><strong>' + resolution + '</strong><span class="cfg-rate" data-cfg-video-price="' + resolution + '">' + videoPrice(unit, resolution) +
    '</span></span></label>'
  ).join('');
  return '<div class="cfg-output-options" data-cfg-photo-format' + (unit.experience === 'aiPhoto' ? '' : ' hidden') +
    '><fieldset class="cfg-plan-options"><legend>AI photo delivery</legend><div class="cfg-format-choices">' + photoChoices +
    '</div></fieldset><p class="cfg-hint">' + equipment + '</p>' + artwork + '</div>' +
    '<div class="cfg-output-options" data-cfg-video-format' + (unit.experience === 'aiVideo' ? '' : ' hidden') +
    '><div class="cfg-video-settings"><fieldset class="cfg-plan-options"><legend>Video resolution</legend><div class="cfg-format-choices">' +
    resolutions + '</div>' + errorSlot('videoResolution') + '</fieldset>' +
    selectField(unit, 'videoSeconds', 'Length of each video', VIDEO_SECONDS.map(seconds => [seconds, seconds + ' seconds']), 15) +
    '</div></div>';
}

function standSizeSection(unit) {
  if (unit.type !== 'classic') return '';
  const choices = SCREEN_SIZES.map(size => '<label class="cfg-size"><input type="radio" name="cfg-stand-size" data-cfg-field="screenSize" value="' +
    size + '" aria-describedby="cfg-error-screenSize"' + ((unit.screenSize ?? 24) === size ? ' checked' : '') + '><span><strong>' + size +
    '″</strong><span class="cfg-rate">' + money(boothHireRate({...unit, screenSize: size})) + ' / day</span></span></label>').join('');
  return '<section class="cfg-panel" aria-labelledby="cfg-size-title"><div class="cfg-section-head"><h2 id="cfg-size-title">Display size</h2><span class="cfg-optional">First ' + RATE_CARD.includedHours + ' hours included each day</span></div>' +
    '<fieldset class="cfg-sizes"><legend class="cfg-sr">Choose a display size in inches</legend>' + choices + '</fieldset>' + errorSlot('screenSize') + '</section>';
}

function reportSection(unit) {
  const options = [[0, 'Event day'], [-1, 'Previous day']].map(([value, text]) =>
    '<option value="' + value + '"' + (Number(unit.reportDayOffset) === value ? ' selected' : '') + '>' + text + '</option>').join('');
  return '<div class="cfg-setup"><div class="cfg-arrival">' + icon('clock') + '<div><strong>Setup &amp; reporting</strong><p data-cfg-arrival>' + escape(arrivalText(unit)) +
    '</p></div></div><label class="cfg-early"><input type="checkbox" data-cfg-field="earlySetup"' + (unit.earlySetup ? ' checked' : '') +
    '>Request an earlier staffed arrival · ' + money(RATE_CARD.earlySetupHour) + ' / hour</label><div class="cfg-report" data-cfg-report' + (unit.earlySetup ? '' : ' hidden') + '><p data-cfg-earlycharge>' + escape(earlyChargeText(unit)) + '</p><div class="cfg-input-grid"><div class="cfg-field"><label for="cfg-reportDayOffset">Reporting day</label>' +
    '<select id="cfg-reportDayOffset" data-cfg-field="reportDayOffset" aria-describedby="cfg-error-reportDayOffset">' + options + '</select>' + errorSlot('reportDayOffset') +
    '</div>' + field(unit, 'reportTime', 'Reporting time', 'time') + '</div></div></div>';
}

function transportLabel(unit) {
  if (!unit.venue.trim()) return '';
  const {emirate, rate} = transportInfo(unit);
  const area = emirate ? ' to ' + emirate : '';
  return rate == null ? 'Transport' + area + ' · Rate to be confirmed.' :
    'Transport' + area + ' · ' + (rate === 0 ? 'Included' : money(rate) + ' per venue per event day.');
}

function packageOffer(unit) {
  const regular = RATE_CARD.boothDay.mirror + (12 - RATE_CARD.includedHours) * RATE_CARD.overtimeHour;
  return '<div class="cfg-package" data-cfg-package' + (isLongDayOfferEligible(unit) ? '' : ' hidden') + '>' +
    '<label class="cfg-early"><input type="checkbox" data-cfg-field="longDayOffer"' + (unit.longDayOffer && isLongDayOfferEligible(unit) ? ' checked' : '') +
    '>Use the four-day Mirror package</label><p>' + money(regular - RATE_CARD.longDayDiscountDay) + ' per 12-hour day, saving ' + money(RATE_CARD.longDayDiscountDay) + ' per day.</p></div>';
}

function eventSection(units, unit) {
  const source = copySource(units, unit);
  const copy = source ? '<button type="button" class="cfg-copy" data-cfg-copy>' + icon('copy') + 'Copy details from ' + escape(unitLabel(units, source)) + '</button>' : '';
  return '<section class="cfg-panel" aria-labelledby="cfg-event-title"><h2 class="cfg-sr" id="cfg-event-title">Event details</h2>' + copy +
    '<p class="cfg-hire-rate"><strong data-cfg-hire-rate>' + money(boothHireRate(unit)) + '</strong> covers the first ' + RATE_CARD.includedHours +
    ' hours each day. Additional time is ' + money(RATE_CARD.overtimeHour) + ' per hour.</p>' +
    renderVenue(unit) + '<p class="cfg-transport" data-cfg-transport>' + escape(transportLabel(unit)) + '</p>' +
    '<div class="cfg-input-grid">' + field(unit, 'startDate', 'Start date', 'date') +
    field(unit, 'endDate', 'End date', 'date', unit.startDate ? 'min="' + escape(unit.startDate) + '"' : '') + '</div><div class="cfg-input-grid">' +
    field(unit, 'startTime', 'Daily start time', 'time') + field(unit, 'endTime', 'Daily end time', 'time') + '</div><p class="cfg-duration" data-cfg-duration>' +
    escape(dailyText(unit)) + '</p>' + (unit.experience === 'frame' ? expectedGuestsField(units, unit) : '') +
    packageOffer(unit) + reportSection(unit) + '</section>';
}

const isAi = unit => unit.experience === 'aiPhoto' || unit.experience === 'aiVideo';
const countLabel = (n, noun) => currency.format(n) + ' ' + noun + (n === 1 ? '' : 's');
const isBlank = value => value === '' || value == null;

function generationEstimate(unit) {
  if (!isAi(unit)) return '';
  const info = generationInfo(unit);
  const output = unit.experience === 'aiVideo' ? 'video' : 'photo';
  const formula = info.amount == null ? money(info.unitPrice) + ' / ' + output :
    countLabel(info.quantity, output) + ' × ' + money(info.unitPrice) + ' = ' + money(info.amount);
  const capacity = info.capacity == null ? 'Capacity depends on the event schedule' :
    'Estimated capacity ' + countLabel(info.capacity, 'session');
  return '<span>' + escape(capacity) + '</span><strong>' + escape(formula) + '</strong>';
}

function selectField(unit, key, label, choices, initial) {
  const options = choices.map(([value, name]) => '<option value="' + value + '"' +
    ((unit[key] ?? initial) === value ? ' selected' : '') + '>' + name + '</option>').join('');
  return '<div class="cfg-field"><label for="cfg-' + key + '">' + label + '</label><select id="cfg-' + key + '" data-cfg-field="' + key +
    '" aria-describedby="cfg-error-' + key + '">' + options + '</select>' + errorSlot(key) + '</div>';
}

function expectedGuestsField(units, unit) {
  const ai = isAi(unit);
  const multiple = units.length > 1;
  const label = multiple ? 'Expected guests for this booth' : 'Expected event attendance';
  const guestHint = multiple ? 'Enter this booth’s total across all event days. Split attendance across booths if each guest should count once.' :
    'Use the event headcount across all days.';
  return '<div class="cfg-field cfg-guests"><label for="cfg-expectedGuests">' + label + ' <span class="cfg-optional" data-cfg-guests-optional' +
    (ai ? ' hidden' : '') + '>(optional)</span></label><input type="number" min="1" step="1" inputmode="numeric" id="cfg-expectedGuests" data-cfg-field="expectedGuests" value="' +
    escape(unit.expectedGuests) + '" aria-describedby="cfg-guest-hint cfg-error-expectedGuests"' + (ai ? ' required' : '') + '><p id="cfg-guest-hint" class="cfg-hint">' +
    guestHint + '</p>' + errorSlot('expectedGuests') + '</div>';
}

function attendanceSection(units, unit) {
  const ai = isAi(unit);
  const mode = unit.aiMode ?? 'fixed';
  const queuedCycle = generationInfo({...unit, addons: ['queue']}).cycleSeconds;
  const modes = [
    ['fixed', 'One per guest', 'Priced using the guest count you enter.'],
    ['unlimited', 'Unlimited', 'Priced using booth capacity during event hours.'],
  ].map(([value, label, description]) => '<label class="cfg-staff-choice"><input type="radio" name="cfg-ai-mode" data-cfg-field="aiMode" value="' +
    value + '" aria-describedby="cfg-error-aiMode"' + (mode === value ? ' checked' : '') + '><span><strong>' + label +
    '</strong><span class="cfg-hint">' + description + '</span></span></label>').join('');
  return '<section class="cfg-panel" aria-labelledby="cfg-guest-title"><h2 class="cfg-sr" id="cfg-guest-title">Attendance</h2>' + expectedGuestsField(units, unit) +
    '<div class="cfg-generation" data-cfg-generation' + (ai ? '' : ' hidden') + '>' +
    '<fieldset class="cfg-plan-options"><legend>AI generation plan</legend><div class="cfg-staff-options">' + modes + '</div></fieldset>' + errorSlot('aiMode') +
    '<label class="cfg-early cfg-plan-queue"><input type="checkbox" data-cfg-field="planQueue"' + (unit.addons.includes('queue') ? ' checked' : '') +
    '><span>Add a collection screen <span class="cfg-optional">· ' + dailyRate(addonPrice('queue', unit)) +
    '</span><span class="cfg-hint">Guests collect separately, reducing each session to ' + queuedCycle + ' seconds.</span></span></label>' +
    '<div class="cfg-estimate" data-cfg-estimate aria-live="polite" aria-atomic="true">' + generationEstimate(unit) + '</div></div></section>';
}

const addonMedia = {
  printer: ['printer.webp', 'On-site photo printer for guest prints'],
  props: ['photo-booth-props.webp', 'Photo booth props with colourful glasses, feather boas and signs'],
  queue: ['queue-setup.webp', 'Mirror photo booth beside a separate collection touchscreen'],
  stanchions: ['queue-barriers.webp', 'Queue posts and barriers for the guest line'],
};

function addonRate(unit, id) {
  if (addonIncluded(id, unit)) return unit.type === 'mirror' ? 'Included with Mirror Booth' : 'Included with printer';
  if (id === 'props') return 'Free';
  const rate = addonPrice(id, unit);
  return ['email', 'qr'].includes(id) ? money(rate) + ' / setup' : dailyRate(rate);
}

function addonRow(unit, item) {
  const photo = addonMedia[item.id];
  const visual = photo ? '<img class="cfg-addon-photo" loading="lazy" src="./assets/' + photo[0] + '" alt="' + photo[1] + '">' :
    '<span class="cfg-symbol">' + icon(item.id) + '</span>';
  const descriptions = {
    printer: unit.experience === 'aiVideo' ? 'Prints a still from each video.' :
      unit.experience === 'aiPhoto' ? 'Digital + one print is ' + money(RATE_CARD.aiPhotoPrintRate) + ' per photo.' : '',
    qr: 'Guests scan to download. Wi-Fi required.',
    email: 'Send a copy to each guest. Wi-Fi required.',
    queue: 'Guests collect photos, prints or QR codes at a second screen.',
    props: 'Hats, novelty glasses and signs.',
    stanchions: 'Posts and belts for the guest line.',
  };
  const description = descriptions[item.id];
  const tip = item.id === 'queue' ? '<span class="cfg-network" data-cfg-email-tip' +
    (unit.addons.includes('email') ? '' : ' hidden') + '>Recommended for email so the next guest can start.</span>' : '';
  return '<label class="cfg-addon">' + visual + '<span class="cfg-choice-text"><strong>' + escape(item.name) + '</strong>' +
    (description ? '<span>' + escape(description) + '</span>' : '') + tip +
    '<span class="cfg-rate" data-cfg-addon-rate="' + item.id + '">' + escape(addonRate(unit, item.id)) +
    '</span></span><input type="checkbox" data-cfg-addon value="' + escape(item.id) + '"' +
    (unit.addons.includes(item.id) ? ' checked' : '') + '></label>';
}

function extrasSummary(unit, group) {
  const selected = unit.addons;
  if (group === 'staffing') {
    const count = staffingInfo(unit).people;
    if (unit.staffing === 'client') return count ? 'Your promoter + ' + countLabel(count, 'hired promoter') : 'Your own on-site promoter';
    return countLabel(count, 'hired promoter');
  }
  if (group === 'delivery') {
    const names = { printer: 'Printer', qr: 'QR download', email: 'Email' };
    return DELIVERY_OPTIONS.filter(item => selected.includes(item.id)).map(item => names[item.id]).join(' · ') || 'Choose print or digital delivery';
  }
  const names = { queue: 'Collection screen', stanchions: 'Barriers', props: 'Props' };
  const equipment = ADDONS.filter(item => selected.includes(item.id)).map(item => names[item.id]).join(' · ');
  if (equipment) return equipment;
  return selected.includes('email') ? 'Collection screen recommended for email' : 'Collection screen, barriers and free props';
}

function extrasGroup(unit, group, name, body, open = false) {
  return '<details class="cfg-panel cfg-fold" name="cfg-extra-groups" data-cfg-fold="' + group + '"' + (open ? ' open' : '') +
    '><summary><span><span class="cfg-fold-title">' + name + '</span><span class="cfg-fold-summary" data-cfg-fold-summary="' + group + '">' +
    escape(extrasSummary(unit, group)) + '</span></span><span class="cfg-chevron" aria-hidden="true"></span></summary>' +
    '<div class="cfg-fold-content">' + body + '</div></details>';
}

function deliverySection(unit) {
  return extrasGroup(unit, 'delivery', 'Guest delivery', '<div class="cfg-addons">' +
    DELIVERY_OPTIONS.map(item => addonRow(unit, item)).join('') + '</div>', true);
}

function screenPlacement(unit) {
  const sides = [['either', 'Either side'], ['left', 'Left of booth'], ['right', 'Right of booth']];
  const options = sides.map(([id, name]) => '<option value="' + id + '"' + ((unit.screenSide || 'either') === id ? ' selected' : '') + '>' + name + '</option>').join('');
  return '<div class="cfg-field cfg-screen-placement" data-cfg-placement' + (unit.addons.includes('queue') ? '' : ' hidden') +
    '><label for="cfg-screenSide">Collection screen placement</label><select id="cfg-screenSide" data-cfg-field="screenSide" aria-describedby="cfg-error-screenSide">' +
    options + '</select>' + errorSlot('screenSide') + '</div>';
}

function addonsSection(unit) {
  const rows = ADDONS.map(item => '<div class="cfg-addon-group">' + addonRow(unit, item) +
    (item.id === 'queue' ? screenPlacement(unit) : '') + '</div>').join('');
  return extrasGroup(unit, 'equipment', 'Equipment &amp; props', '<div class="cfg-addons">' +
    rows + '</div>' + errorSlot('addons'));
}

function staffEstimate(unit) {
  const staff = staffingInfo(unit);
  const {days} = scheduleInfo(unit);
  if (!(staff.people > 0)) return '';
  if (staff.amount == null) return 'Set the event schedule and daily shift to calculate staffing.';
  return countLabel(staff.people, 'promoter') + ' × ' + hourLabel(staff.hoursPerDay) + ' × ' + countLabel(days, 'day') + ' = ' + money(staff.amount) + '.';
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
    ['client', 'Use my own promoter', 'No staffing charge'],
    ['b3yond', 'Hire a B3YOND promoter', money(RATE_CARD.promoterHour) + ' / hour'],
  ];
  const choices = staffOptions.map(([id, label, price]) => '<label class="cfg-staff-choice"><input type="radio" name="cfg-staffing" data-cfg-field="staffing" value="' +
    id + '" aria-describedby="cfg-error-staffing"' + (staffing === id ? ' checked' : '') + '><span><strong>' + label + '</strong><span class="cfg-rate">' + price + '</span></span></label>').join('');
  const extraOptions = Array.from({length: 21}, (_, count) => '<option value="' + count + '"' +
    ((unit.additionalStaff ?? 0) === count ? ' selected' : '') + '>' + (count === 0 ? 'None' : count) + '</option>').join('');
  return extrasGroup(unit, 'staffing', 'On-site staffing', '<p class="cfg-hint cfg-staff-intro">One promoter is needed on site. Remote technical support is included.</p>' +
    '<fieldset class="cfg-staff-options"><legend class="cfg-sr">On-site promoter</legend>' + choices + '</fieldset>' + errorSlot('staffing') +
    '<div class="cfg-field cfg-extra-staff"><label for="cfg-additionalStaff">Additional B3YOND promoters</label>' +
    '<select id="cfg-additionalStaff" data-cfg-field="additionalStaff" aria-describedby="cfg-promoter-rate cfg-error-additionalStaff">' + extraOptions + '</select>' +
    '<p class="cfg-hint" id="cfg-promoter-rate">' + money(RATE_CARD.promoterHour) + ' per person per hour.</p>' + errorSlot('additionalStaff') + '</div>' + shiftSection(unit));
}

const partFields = [
  ['type', 'experience', 'screenSize', 'videoSeconds', 'videoResolution', 'customArtwork'],
  ['venue', 'startDate', 'endDate', 'startTime', 'endTime', 'reportTime', 'reportDayOffset'],
  ['expectedGuests', 'aiMode'],
  ['addons', 'staffing', 'additionalStaff', 'staffHoursPerDay', 'screenSide'],
];

export function partForField(key, unit) {
  if (key === 'expectedGuests' && unit?.experience === 'frame') return 1;
  return Math.max(0, partFields.findIndex(fields => fields.includes(key)));
}

export function renderConfig(units, activeId, part = 0, artworkCount = 2) {
  const unit = units.find(item => item.id === activeId) ?? units[0];
  if (!unit) return '';
  const panels = [
    () => standSizeSection(unit) + experienceSection(unit, artworkCount),
    () => eventSection(units, unit),
    () => attendanceSection(units, unit),
    () => deliverySection(unit) + addonsSection(unit) + staffingSection(unit),
  ];
  return '<div class="cfg" data-cfg data-cfg-part="' + part + '">' + selectUnitTiles(units, unit) + (panels[part] ?? panels[0])() +
    '<div class="cfg-sr" role="status" data-cfg-status></div></div>';
}

function updateErrors(root, unit, part) {
  const errors = Object.fromEntries(Object.entries(validateUnit(unit)).filter(([key]) => partForField(key, unit) === part));
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

export function showErrors(root, unit, part) {
  const panel = root.querySelector('[data-cfg]');
  if (!panel) return {};
  panel.dataset.cfgValidated = 'true';
  const errors = updateErrors(root, unit, part ?? Number(panel.dataset.cfgPart));
  const key = Object.keys(errors)[0];
  if (key) {
    const selector = key === 'addons' ? '[data-cfg-addon]' : '[data-cfg-field="' + key + '"]';
    const input = root.querySelector(selector);
    const fold = input?.closest('details');
    if (fold) fold.open = true;
    input?.focus();
  }
  return errors;
}

function toggleAddon(unit, id, selected) {
  const addons = new Set(unit.addons);
  if (selected) addons.add(id);
  else addons.delete(id);
  unit.addons = [...addons];
}

export function installConfig(root, { getUnits, getActiveId, setActive, getArtworkCount, setArtworkCount, changed }) {
  const activeUnit = () => getUnits().find(unit => unit.id === getActiveId()) ?? getUnits()[0];
  installVenue(root, {getUnit: activeUnit, changed: () => changed({render: true})});
  function reflectPlayback(event) {
    if (!event.target.matches('.cfg-video-preview video')) return;
    event.target.controls = event.type === 'play';
    event.target.parentElement.querySelector('[data-cfg-play-video]').hidden = event.type === 'play';
  }
  root.addEventListener('play', reflectPlayback, true);
  root.addEventListener('ended', reflectPlayback, true);
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-cfg-unit], [data-cfg-copy], [data-cfg-preview], [data-cfg-play-video], [data-cfg-design-step]');
    if (!button) return;
    if (button.hasAttribute('data-cfg-design-step')) {
      const current = artworkPricing(getArtworkCount()).count;
      const next = current + Number(button.dataset.cfgDesignStep);
      if (!Number.isSafeInteger(next) || next < 1) return;
      const {count, amount} = artworkPricing(next);
      setArtworkCount(count);
      root.querySelector('[data-cfg-design-count]').textContent = count;
      root.querySelector('[data-cfg-design-total]').textContent = money(amount);
      const minus = root.querySelector('[data-cfg-design-step="-1"]');
      if (count === 1 && minus === root.ownerDocument.activeElement) root.querySelector('[data-cfg-design-step="1"]').focus();
      minus.disabled = count <= 1;
      root.querySelector('[data-cfg-status]').textContent = countLabel(count, 'design') + ', ' + money(amount) + ' for this booking.';
      changed({render: false});
    } else if (button.hasAttribute('data-cfg-play-video')) {
      const video = button.parentElement.querySelector('video');
      video.play().catch(() => {
        video.controls = true;
        button.hidden = true;
        video.focus();
      });
    } else if (button.hasAttribute('data-cfg-preview')) {
      const id = button.dataset.cfgPreview;
      const media = previews[id];
      const playing = button.dataset.playing !== 'true';
      const action = playing ? 'Pause' : 'Play';
      button.parentElement.querySelector('img').src = './assets/' + (playing ? media.gif : media.poster);
      button.dataset.playing = String(playing);
      button.textContent = action;
      button.setAttribute('aria-label', action + ' ' + EXPERIENCES.find(item => item.id === id).name + ' preview');
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
      toggleAddon(unit, 'queue', input.checked);
    } else if (key === 'photoOutput') {
      toggleAddon(unit, 'printer', input.value === 'print');
    } else if (key === 'customArtwork') {
      unit.customArtwork = input.value === 'custom';
      root.querySelector('[data-cfg-designs]').hidden = !unit.customArtwork;
    } else if (input.hasAttribute('data-cfg-addon')) {
      toggleAddon(unit, input.value, input.checked);
      root.querySelector('[data-cfg-email-tip]').hidden = !unit.addons.includes('email');
      root.querySelector('[data-cfg-placement]').hidden = !unit.addons.includes('queue');
      root.querySelector('[data-cfg-addon-rate="email"]').textContent = addonRate(unit, 'email');
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
      const numeric = ['reportDayOffset', 'screenSize', 'additionalStaff', 'expectedGuests', 'videoSeconds'].includes(key);
      unit[key] = numeric && input.value !== '' ? Number(input.value) : input.value;
      if (numeric && input.validity.badInput) unit[key] = -1;
      if (key === 'experience') {
        root.querySelector('[data-cfg-photo-format]').hidden = unit.experience !== 'aiPhoto';
        root.querySelector('[data-cfg-video-format]').hidden = unit.experience !== 'aiVideo';
      }
      if (key === 'videoSeconds') {
        root.querySelectorAll('[data-cfg-video-price]').forEach(price => {
          price.textContent = videoPrice(unit, price.dataset.cfgVideoPrice);
        });
      }
      if (key === 'venue') {
        unit.venueEmirate = '';
        root.querySelector('[data-cfg-transport]').textContent = transportLabel(unit);
      }
    }
    const part = Number(input.closest('[data-cfg]').dataset.cfgPart);
    if (part === 1) {
      const eligible = isLongDayOfferEligible(unit);
      root.querySelector('[data-cfg-package]').hidden = !eligible;
      if (!eligible && unit.longDayOffer) {
        unit.longDayOffer = false;
        root.querySelector('[data-cfg-field="longDayOffer"]').checked = false;
      }
      root.querySelector('[data-cfg-arrival]').textContent = arrivalText(unit);
      root.querySelector('[data-cfg-duration]').textContent = dailyText(unit);
      root.querySelector('[data-cfg-earlycharge]').textContent = earlyChargeText(unit);
    }
    if (part === 2 && isAi(unit)) {
      const estimate = root.querySelector('[data-cfg-estimate]');
      const markup = generationEstimate(unit);
      if (estimate.innerHTML !== markup) estimate.innerHTML = markup;
    }
    if (part === 3) {
      root.querySelectorAll('[data-cfg-fold-summary]').forEach(node => {
        node.textContent = extrasSummary(unit, node.dataset.cfgFoldSummary);
      });
      root.querySelector('[data-cfg-shift]').hidden = !staffingInfo(unit).people;
      root.querySelector('[data-cfg-shift-default]').textContent = shiftDefault(unit);
      root.querySelector('[data-cfg-staff-estimate]').textContent = staffEstimate(unit);
    }
    if (root.querySelector('[data-cfg-validated]')) updateErrors(root, unit, part);
    changed({render: false});
  }
  root.addEventListener('input', edit);
  root.addEventListener('change', edit);
}
