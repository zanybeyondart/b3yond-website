import {transportInfo} from './model.js';

// The local index keeps venue suggestions usable offline. The map link also searches venues outside this list.
const venues = [
  ['Ajman Saray', 'Ajman', 'luxury collection resort سراي عجمان'],
  ['Fairmont Ajman', 'Ajman', 'fairmont hotel فيرمونت عجمان'],
  ['Sheikh Zayed Center, Ajman University', 'Ajman', 'sheikh zayed centre conferences exhibitions جامعة عجمان'],
  ['Expo Centre Sharjah', 'Sharjah', 'expo center الشارقة اكسبو إكسبو'],
  ['Al Jawaher Reception & Convention Centre', 'Sharjah', 'jrcc al jawaher reception convention center الجواهر الشارقة'],
  ['Dubai World Trade Centre', 'Dubai', 'dwtc trade center مركز دبي التجاري العالمي'],
  ['Dubai Exhibition Centre', 'Dubai', 'dec expo city dubai exhibition center اكسبو دبي إكسبو دبي'],
  ['WAFI City', 'Dubai', 'wafi mall wafi shopping centre وافي مول دبي'],
  ['ADNEC Centre Abu Dhabi', 'Abu Dhabi', 'abu dhabi national exhibition center centre أدنيك ادنيك أبوظبي'],
  ['Rixos Marina Abu Dhabi', 'Abu Dhabi', 'rixos marina hotel ريكسوس مارينا أبوظبي'],
  ['Cleveland Clinic Abu Dhabi', 'Abu Dhabi', 'ccad al maryah island كليفلاند كلينك أبوظبي'],
  ['Yas Marina Circuit', 'Abu Dhabi', 'yas island formula 1 f1 حلبة مرسى ياس أبوظبي'],
  ['RAK Exhibition Centre', 'Ras Al Khaimah', 'rak exhibition center رأس الخيمة'],
  ['Umm Al Quwain Cultural Center', 'Umm Al Quwain', 'uaq cultural centre أم القيوين'],
  ['Fujairah Cultural Center', 'Fujairah', 'fujairah cultural centre الفجيرة'],
];

function normalize(value) {
  return String(value ?? '').toLowerCase().normalize('NFKD')
    .replace(/\p{M}/gu, '').replace(/[’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function matches(query) {
  const normalized = normalize(query);
  if (normalized.length < 2) return [];
  const terms = normalized.split(' ');
  return venues.filter(([name, emirate, aliases]) => {
    const haystack = normalize([name, emirate, aliases].join(' '));
    return terms.every(term => haystack.includes(term));
  }).slice(0, 5);
}

function address(name, emirate) {
  return name.toLowerCase().includes(emirate.toLowerCase()) ? name : name + ', ' + emirate;
}

function mapsUrl(value) {
  const query = String(value ?? '').trim().slice(0, 180);
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', query ? query + ', United Arab Emirates' : 'United Arab Emirates');
  return url.href;
}


function mapPlaces(features) {
  const places = new Map();
  for (const {properties} of Array.isArray(features) ? features : []) {
    if (!properties || String(properties.countrycode).toUpperCase() !== 'AE') continue;
    const name = properties.name || [properties.housenumber, properties.street].filter(Boolean).join(' ');
    if (!name) continue;
    const emirate = transportInfo({venue:properties.state || ''}).emirate ||
      transportInfo({venue:properties.city || ''}).emirate;
    const detail = [...new Set([properties.district, properties.city, emirate || properties.state]
      .filter(value => typeof value === 'string' && value && normalize(value) !== normalize(name)))].join(', ');
    const address = detail ? name + ', ' + detail : name;
    places.set(normalize(address), {name,detail,emirate,address});
  }
  return [...places.values()];
}

const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => (
  {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]
));

export function renderVenue(unit) {
  return '<div class="cfg-field venue-field" data-venue-picker>' +
    '<label for="cfg-venue">Venue or location</label>' +
    '<div class="venue-box"><input id="cfg-venue" data-cfg-field="venue" type="text" role="combobox" aria-autocomplete="list" aria-controls="cfg-venue-list" aria-expanded="false" aria-describedby="cfg-venue-hint cfg-error-venue" autocomplete="off" placeholder="Venue name or full address" value="' + escape(unit.venue) + '">' +
    '<button type="button" class="venue-search" data-venue-search' + (String(unit.venue || '').trim().length < 2 ? ' disabled' : '') + '>Search map</button>' +
    '<ul id="cfg-venue-list" class="venue-options" role="listbox" aria-label="Suggested venues" hidden></ul></div>' +
    '<p class="venue-no-match" data-venue-no-match role="status" hidden>Use your address as entered or search the map for more venues.</p>' +
    '<div class="venue-support"><p id="cfg-venue-hint">Choose a suggested venue or enter the address, including the emirate.</p>' +
    '<a data-venue-map href="' + escape(mapsUrl(unit.venue)) + '" target="_blank" rel="noopener noreferrer">Search Google Maps<span class="cfg-sr"> (opens in a new tab)</span></a></div>' +
    '<section class="venue-map-results" data-venue-results aria-label="Online map results" hidden>' +
    '<div role="status" data-venue-status></div><div data-venue-buttons></div>' +
    '<small data-venue-credit hidden>Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> · Photon</small></section>' +
    '<span class="cfg-error" data-cfg-error="venue" id="cfg-error-venue" hidden></span></div>';
}

export function installVenue(root, {getUnit, changed}) {
  const cache = new Map();
  let controller;
  function cancelSearch() {
    if (controller) controller.abort();
    controller = undefined;
  }
  function resetSearch(picker, value) {
    cancelSearch();
    picker.querySelector('[data-venue-results]').hidden = true;
    picker.querySelector('[data-venue-search]').disabled = value.trim().length < 2;
  }
  async function searchMap(button) {
    const picker = button.closest('[data-venue-picker]');
    const input = picker.querySelector('#cfg-venue');
    const query = input.value.trim();
    if (query.length < 2) return;
    close(input);
    cancelSearch();
    const request = new AbortController();
    controller = request;
    button.disabled = true;
    const resultBox = picker.querySelector('[data-venue-results]');
    const status = picker.querySelector('[data-venue-status]');
    const results = picker.querySelector('[data-venue-buttons]');
    const credit = picker.querySelector('[data-venue-credit]');
    resultBox.hidden = false;
    status.textContent = 'Searching UAE venues…';
    results.innerHTML = '';
    credit.hidden = true;
    const timeout = setTimeout(() => request.abort(), 6000);
    try {
      const key = normalize(query);
      let places = cache.get(key);
      if (!places) {
        const url = new URL('https://photon.komoot.io/api/');
        url.search = new URLSearchParams({q:query.slice(0, 180), countrycode:'AE', lang:'en', limit:'6'}).toString();
        const response = await fetch(url, {signal:request.signal, credentials:'omit', referrerPolicy:'no-referrer'});
        if (!response.ok) throw new Error('Venue search unavailable');
        const data = await response.json();
        places = mapPlaces(data.features);
        if (cache.size >= 50) cache.delete(cache.keys().next().value);
        cache.set(key, places);
      }
      if (controller !== request || !input.isConnected) return;
      status.textContent = places.length
        ? 'Choose a map result'
        : 'No map matches. Continue with the address you entered or try Google Maps.';
      credit.hidden = !places.length;
      results.innerHTML = places.map(place =>
        '<button type="button" data-venue-choice="' + escape(place.address) + '" data-emirate="' + escape(place.emirate) + '">' +
        '<strong>' + escape(place.name) + '</strong><span>' + escape(place.detail) + '</span></button>'
      ).join('');
    } catch {
      if (controller === request && input.isConnected) {
        status.textContent = 'Map search is unavailable. Continue with your typed address or open Google Maps.';
      }
    } finally {
      clearTimeout(timeout);
      if (controller === request) {
        controller = undefined;
        if (input.isConnected) button.disabled = false;
      }
    }
  }

  function close(input) {
    const list = input.parentElement.querySelector('[role="listbox"]');
    list.hidden = true;
    input.closest('[data-venue-picker]').querySelector('[data-venue-no-match]').hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
  function display(input) {
    const list = input.parentElement.querySelector('[role="listbox"]');
    const options = matches(input.value);
    list.innerHTML = options.map(([name, emirate], i) =>
      '<li role="option" aria-selected="false" id="cfg-venue-choice-' + i + '" data-venue-choice="' + escape(address(name, emirate)) +
      '" data-emirate="' + escape(emirate) + '"><strong>' + escape(name) + '</strong><span>' + escape(emirate) + '</span></li>'
    ).join('');
    list.hidden = !options.length;
    input.closest('[data-venue-picker]').querySelector('[data-venue-no-match]').hidden = options.length > 0 || normalize(input.value).length < 2;
    input.setAttribute('aria-expanded', String(options.length > 0));
    input.removeAttribute('aria-activedescendant');
  }
  function choose(option) {
    const unit = getUnit();
    if (!unit) return;
    cancelSearch();
    unit.venue = option.dataset.venueChoice;
    unit.venueEmirate = option.dataset.emirate;
    changed();
    const input = root.querySelector('#cfg-venue');
    if (input) {
      input.focus({preventScroll:true});
      close(input);
    }
  }

  root.addEventListener('input', event => {
    const input = event.target;
    if (input.id !== 'cfg-venue') return;
    const unit = getUnit();
    if (unit) unit.venueEmirate = '';
    resetSearch(input.closest('[data-venue-picker]'),input.value);
    input.closest('[data-venue-picker]').querySelector('[data-venue-map]').href = mapsUrl(input.value);
    display(input);
  });
  root.addEventListener('focusin', event => {
    if (event.target.id === 'cfg-venue' && !getUnit()?.venueEmirate) display(event.target);
  });
  root.addEventListener('focusout', event => {
    if (event.target.id === 'cfg-venue') close(event.target);
  });
  root.addEventListener('pointerdown', event => {
    if (event.target.closest('.venue-options [data-venue-choice]')) event.preventDefault();
  });
  root.addEventListener('click', event => {
    const search = event.target.closest('[data-venue-search]');
    if (search) { searchMap(search); return; }
    const option = event.target.closest('[data-venue-choice]');
    if (option) choose(option);
  });
  root.addEventListener('keydown', event => {
    const input = event.target;
    if (input.id !== 'cfg-venue' || event.isComposing) return;
    const list = input.parentElement.querySelector('[role="listbox"]');
    if (event.key === 'Escape') {
      close(input);
      return;
    }
    if (event.key === 'Enter' && !list.hidden) {
      event.preventDefault();
      const active = list.querySelector('[aria-selected="true"]');
      if (active) choose(active);
      else close(input);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (list.hidden) display(input);
    const options = Array.from(list.children);
    if (!options.length) return;
    event.preventDefault();
    const current = options.findIndex(el => el.getAttribute('aria-selected') === 'true');
    const next = current < 0 ? (event.key === 'ArrowUp' ? options.length - 1 : 0)
      : (current + (event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length;
    for (const [i, option] of options.entries()) option.setAttribute('aria-selected', String(i === next));
    input.setAttribute('aria-activedescendant', options[next].id);
    options[next].scrollIntoView({block:'nearest'});
  });
}
