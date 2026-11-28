import {
  ADDONS, DELIVERY_OPTIONS, EXPERIENCES, RATE_CARD, SCREEN_SIZES, addonPrice, getBooth,
  isLongDayOfferEligible, scheduleInfo, transportInfo, validateUnit,
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
  aiPhoto: 'Wi-Fi required · 20 Mbps',
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
  const cards = EXPERIENCES.map(item => '<div class="cfg-experience-card">' + preview(item) +
    '<label class="cfg-experience-option"><input type="radio" name="cfg-experience" data-cfg-field="experience" value="' +
    escape(item.id) + '" aria-describedby="cfg-error-experience"' + (unit.experience === item.id ? ' checked' : '') + '>' +
    '<span class="cfg-choice-text"><strong>' + escape(item.name) +
    '</strong><span>' + escape(item.description) + '</span><span class="cfg-network">' + connectivity[item.id] +
    '</span><span class="cfg-rate">' + dailyRate(RATE_CARD.experienceDay[item.id]) + '</span></span></label></div>').join('');
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
  const includedDetail = (item.id === 'printer' && unit.type === 'mirror') ? ' · Unlimited still prints' : '';
  const wifi = ['email', 'qr'].includes(item.id) ? ' · Wi-Fi required for delivery' : '';
  const rate = dailyRate(price) + includedDetail + wifi;
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

function staffingSection(unit) {
  const staffing = unit.staffing || 'client';
  const staffOptions = [
    ['client', 'We supply our own promoter', 'No staffing charge'],
    ['b3yond', 'B3YOND supplies a promoter', dailyRate(RATE_CARD.promoterDay)],
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
    '<p class="cfg-hint" id="cfg-promoter-rate">' + money(RATE_CARD.promoterDay) + ' per additional promoter per day.</p>' + errorSlot('additionalStaff') + '</div></section>';
}

export function renderConfig(units, activeId) {
  const unit = units.find(item => item.id === activeId) ?? units[0];
  if (!unit) return '';
  return '<div class="cfg" data-cfg>' + selectUnitTiles(units, unit) + standSizeSection(unit) + experienceSection(unit) + eventSection(units, unit) +
    deliverySection(unit) + addonsSection(unit) + staffingSection(unit) + '<div class="cfg-sr" role="status" data-cfg-status></div></div>';
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
    // Text controls update the summary while typing. Pickers, checkboxes and radios commit on change.
    if ((input.type === 'text') !== (event.type === 'input')) return;
    if (input.hasAttribute('data-cfg-addon')) {
      unit.addons = [...root.querySelectorAll('[data-cfg-addon]:checked')].map(el => el.value);
      const hasScreen = unit.addons.includes('queue');
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
    } else if (key === 'longDayOffer') {
      unit.longDayOffer = input.checked && isLongDayOfferEligible(unit);
    } else {
      unit[key] = ['reportDayOffset', 'screenSize', 'additionalStaff'].includes(key) ? Number(input.value) : input.value;
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
    if (root.querySelector('[data-cfg-validated]')) updateErrors(root, unit);
    changed({render: false});
  }
  root.addEventListener('input', edit);
  root.addEventListener('change', edit);
}
