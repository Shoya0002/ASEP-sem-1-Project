// Elite Sports Hub front-end logic

const API_BASE = '';

// Local storage keys
const CLIENT_ID_KEY = 'esh_client_id';
const PREFS_KEY = 'esh_preferences';
const NOTIFIED_MATCHES_KEY = 'esh_notified_matches';

let clientId = null;
let sportsCache = null;
let currentSchedule = [];
let notificationIntervalId = null;

document.addEventListener('DOMContentLoaded', () => {
  initializeClientId();
  setupTabs();
  setupTimezoneSelector();
  loadSportsAndPreferences();
  setupGlobalEvents();
  setupStats();
});

function initializeClientId() {
  clientId = localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    clientId = 'client-' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
}

// Tab switching
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab));
  });
}

function switchTab(el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  const target = el.getAttribute('data-tab');
  const section = document.getElementById(target);
  if (section) section.classList.add('active');
}

// Timezone handling
function setupTimezoneSelector() {
  const tzSelect = document.getElementById('timezoneSelect');
  if (tzSelect) {
    tzSelect.addEventListener('change', () => {
      renderScheduleTable(currentSchedule);
      renderGlobalEvents(); // re-render with new timezone
    });
  }
}

function getSelectedTimezone() {
  const tzSelect = document.getElementById('timezoneSelect');
  return tzSelect ? tzSelect.value : 'local';
}

function formatDateTime(utcString) {
  if (!utcString) return '';
  const date = new Date(utcString);
  const tz = getSelectedTimezone();

  let options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };

  let localeOptions = { ...options };
  if (tz === 'UTC') {
    localeOptions.timeZone = 'UTC';
  } else if (tz === 'EST') {
    localeOptions.timeZone = 'America/New_York';
  } else if (tz === 'PST') {
    localeOptions.timeZone = 'America/Los_Angeles';
  } // local uses browser default

  return date.toLocaleString(undefined, localeOptions);
}

// Sports & preferences
async function loadSportsAndPreferences() {
  try {
    const sportsRes = await fetch(`${API_BASE}/api/sports`);
    sportsCache = await sportsRes.json();
    populateSportSelect();

    const prefsRes = await fetch(
      `${API_BASE}/api/preferences?clientId=${encodeURIComponent(clientId)}`
    );
    const prefs = await prefsRes.json();
    applyPreferencesToUI(prefs);
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));

    // Initial schedule load
    showSchedule();

    // Start notification polling if enabled
    if (prefs.notificationsEnabled) {
      startNotificationPolling(prefs);
    }
  } catch (err) {
    console.error('Error loading sports or preferences', err);
  }
}

function populateSportSelect() {
  const sportSelect = document.getElementById('sportSelect');
  if (!sportSelect || !sportsCache) return;

  // Clear existing except first option
  sportSelect.innerHTML = '<option value=\"\">Select a Sport</option>';
  Object.keys(sportsCache).forEach(key => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = sportsCache[key].name;
    sportSelect.appendChild(opt);
  });

  sportSelect.addEventListener('change', populateTeams);
}

function populateTeams() {
  const sportSelect = document.getElementById('sportSelect');
  const teamSelect = document.getElementById('teamSelect');
  if (!sportSelect || !teamSelect || !sportsCache) return;

  const sport = sportSelect.value;
  teamSelect.innerHTML = '<option value=\"\">Select Your Team</option>';
  if (!sport || !sportsCache[sport]) return;

  sportsCache[sport].teams.forEach(team => {
    const opt = document.createElement('option');
    opt.value = team;
    opt.textContent = team;
    teamSelect.appendChild(opt);
  });
}

function applyPreferencesToUI(prefs) {
  try {
    const sportSelect = document.getElementById('sportSelect');
    const teamSelect = document.getElementById('teamSelect');

    if (prefs.sports && prefs.sports[0] && sportSelect) {
      sportSelect.value = prefs.sports[0];
      populateTeams();
    }
    if (prefs.teams && prefs.teams[0] && teamSelect) {
      teamSelect.value = prefs.teams[0];
    }
  } catch (e) {
    console.warn('Could not apply preferences to UI', e);
  }
}

async function showSchedule() {
  const sportSelect = document.getElementById('sportSelect');
  const teamSelect = document.getElementById('teamSelect');
  const dateFilter = document.getElementById('dateFilter');

  const params = new URLSearchParams();
  if (sportSelect && sportSelect.value) params.append('sport', sportSelect.value);
  if (teamSelect && teamSelect.value) params.append('team', teamSelect.value);
  if (dateFilter && dateFilter.value) params.append('date', dateFilter.value);

  try {
    const res = await fetch(`${API_BASE}/api/schedule?${params.toString()}`);
    const data = await res.json();
    currentSchedule = data || [];
    renderScheduleTable(currentSchedule);
    renderCountdown(currentSchedule);
  } catch (err) {
    console.error('Error loading schedule', err);
  }
}

function renderScheduleTable(matches) {
  const container = document.getElementById('scheduleContainer');
  if (!container) return;

  if (!matches || matches.length === 0) {
    container.innerHTML = '<p style=\"color:white;\">No matches found for this selection.</p>';
    return;
  }

  const now = Date.now();

  let html = '<table><thead><tr>' +
    '<th>Sport</th><th>Match</th><th>Location</th><th>Start Time</th><th>Status</th>' +
    '</tr></thead><tbody>';

  matches.forEach(m => {
    const startMs = new Date(m.startTimeUtc).getTime();
    const diffMinutes = (startMs - now) / (60 * 1000);
    const imminent = diffMinutes >= 0 && diffMinutes <= 30;
    const rowClass = imminent ? 'highlight' : '';

    html += `<tr class=\"${rowClass}\">` +
      `<td>${m.sport}</td>` +
      `<td>${m.homeTeam} vs ${m.awayTeam}</td>` +
      `<td>${m.location}</td>` +
      `<td>${formatDateTime(m.startTimeUtc)}</td>` +
      `<td>${m.status}</td>` +
      '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function renderCountdown(matches) {
  const container = document.getElementById('countdownContainer');
  if (!container) return;

  const upcoming = (matches || []).filter(m => new Date(m.startTimeUtc).getTime() > Date.now());
  if (upcoming.length === 0) {
    container.innerHTML = '';
    return;
  }

  upcoming.sort((a, b) => new Date(a.startTimeUtc) - new Date(b.startTimeUtc));
  const nextMatch = upcoming[0];

  container.innerHTML = `
    <div class=\"countdown\">
      <div class=\"countdown-title\">
        Next: ${nextMatch.homeTeam} vs ${nextMatch.awayTeam} (${nextMatch.sport})
      </div>
      <div id=\"countdownTimer\" class=\"countdown-timer\"></div>
    </div>
  `;

  const targetTime = new Date(nextMatch.startTimeUtc).getTime();
  updateCountdownTimer(targetTime);
  setInterval(() => updateCountdownTimer(targetTime), 1000);
}

function updateCountdownTimer(targetTime) {
  const el = document.getElementById('countdownTimer');
  if (!el) return;

  const now = Date.now();
  let diff = targetTime - now;
  if (diff < 0) diff = 0;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  el.innerHTML = `
    <div class=\"countdown-item\">
      <div class=\"countdown-number\">${days}</div>
      <div class=\"countdown-label\">Days</div>
    </div>
    <div class=\"countdown-item\">
      <div class=\"countdown-number\">${hours}</div>
      <div class=\"countdown-label\">Hours</div>
    </div>
    <div class=\"countdown-item\">
      <div class=\"countdown-number\">${minutes}</div>
      <div class=\"countdown-label\">Minutes</div>
    </div>
    <div class=\"countdown-item\">
      <div class=\"countdown-number\">${seconds}</div>
      <div class=\"countdown-label\">Seconds</div>
    </div>
  `;
}

// Global events (Global tab)
let globalEventsCache = [];

async function setupGlobalEvents() {
  await loadGlobalEvents();
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('keyup', filterEvents);
  }
}

async function loadGlobalEvents(params = {}) {
  const qs = new URLSearchParams(params);
  try {
    const res = await fetch(`${API_BASE}/api/events/global?${qs.toString()}`);
    globalEventsCache = await res.json();
    renderGlobalEvents();
  } catch (err) {
    console.error('Error loading global events', err);
  }
}

function renderGlobalEvents() {
  const tbody = document.getElementById('eventBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  globalEventsCache.forEach(ev => {
    const tr = document.createElement('tr');
    if (ev.status === 'live') tr.classList.add('highlight');

    tr.innerHTML = `
      <td>${ev.name}</td>
      <td>${ev.location}</td>
      <td>${formatDateTime(ev.startDateUtc)} - ${formatDateTime(ev.endDateUtc)}</td>
      <td>
        ${ev.status === 'live'
          ? '<span class=\"live-badge\">LIVE</span>'
          : '<span class=\"upcoming-badge\">UPCOMING</span>'}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterByYear(year, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const searchInput = document.getElementById('searchInput');
  loadGlobalEvents({
    year,
    search: searchInput ? searchInput.value : ''
  });
}

function filterEvents() {
  const searchInput = document.getElementById('searchInput');
  const term = searchInput ? searchInput.value : '';

  const activeYearBtn = document.querySelector('.filter-btn.active');
  let year = 'all';
  if (activeYearBtn && activeYearBtn.textContent.trim() !== 'All Events') {
    year = activeYearBtn.textContent.trim();
  }

  loadGlobalEvents({ year, search: term });
}

// Stats tab
async function setupStats() {
  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    const data = await res.json();
    renderStats(data.statsBySport || []);
  } catch (err) {
    console.error('Error loading stats', err);
  }
}

function renderStats(statsBySport) {
  const grid = document.getElementById('statsGrid');
  if (!grid) return;

  grid.innerHTML = '';
  statsBySport.forEach(stat => {
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = `
      <div class=\"stat-number\">${stat.totalMatches}</div>
      <div class=\"stat-label\">${stat.sport.toUpperCase()} MATCHES</div>
      <p style=\"margin-top:10px;color:#666;font-size:13px;\">
        Upcoming: ${stat.upcoming} • Live: ${stat.live} • Completed: ${stat.completed}
      </p>
    `;
    grid.appendChild(card);
  });

  const perf = document.getElementById('performanceChart');
  if (perf) {
    perf.innerHTML = statsBySport
      .map(
        s =>
          `<div style=\"margin:8px 0;\">${s.sport.toUpperCase()}: ` +
          `<span style=\"display:inline-block;background:#667eea;height:8px;width:${10 *
            s.totalMatches}px;border-radius:4px;\"></span> ` +
          `<span style=\"font-size:12px;color:#666;margin-left:8px;\">${s.totalMatches} matches</span></div>`
      )
      .join('');
  }
}

// Notifications & preferences
async function subscribeToTeam() {
  const sportSelect = document.getElementById('sportSelect');
  const teamSelect = document.getElementById('teamSelect');
  if (!sportSelect || !teamSelect) return;

  const selectedSport = sportSelect.value;
  const selectedTeam = teamSelect.value;

  const prefs = {
    clientId,
    sports: selectedSport ? [selectedSport] : [],
    teams: selectedTeam ? [selectedTeam] : [],
    notificationsEnabled: true
  };

  try {
    await fetch(`${API_BASE}/api/preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs)
    });
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));

    // Request browser notification permission
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }
    }

    startNotificationPolling(prefs);
    showInPageNotification('Subscribed', 'You will get notified about upcoming matches for your selected team.', false);
  } catch (err) {
    console.error('Error saving preferences', err);
    showInPageNotification('Error', 'Could not save your subscription. Please try again.', true);
  }
}

function startNotificationPolling(prefs) {
  if (notificationIntervalId) {
    clearInterval(notificationIntervalId);
  }

  const sports = (prefs.sports || []).join(',');
  const teams = (prefs.teams || []).join(',');

  const poll = () => checkUpcomingNotifications(sports, teams);
  poll(); // immediate
  notificationIntervalId = setInterval(poll, 60 * 1000);
}

async function checkUpcomingNotifications(sports, teams) {
  const params = new URLSearchParams();
  if (sports) params.append('sports', sports);
  if (teams) params.append('teams', teams);
  params.append('windowMinutes', '120'); // next 2 hours

  try {
    const res = await fetch(`${API_BASE}/api/notifications/upcoming?${params.toString()}`);
    const upcoming = await res.json();
    handleMatchNotifications(upcoming || []);
  } catch (err) {
    console.error('Error checking notifications', err);
  }
}

function handleMatchNotifications(matches) {
  let notified = [];
  try {
    notified = JSON.parse(localStorage.getItem(NOTIFIED_MATCHES_KEY) || '[]');
  } catch (e) {
    notified = [];
  }

  matches.forEach(m => {
    if (notified.includes(m.id)) return;

    const title = `Upcoming: ${m.homeTeam} vs ${m.awayTeam}`;
    const body = `${m.sport.toUpperCase()} • Starts at ${formatDateTime(m.startTimeUtc)} in ${m.location}`;

    let usedBrowserNotification = false;

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: ''
      });
      usedBrowserNotification = true;
    }

    if (!usedBrowserNotification) {
      showInPageNotification(title, body, false);
    }

    notified.push(m.id);
  });

  localStorage.setItem(NOTIFIED_MATCHES_KEY, JSON.stringify(notified));
}

function showInPageNotification(title, message, isError) {
  // remove existing
  const existing = document.querySelector('.notification');
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }

  const div = document.createElement('div');
  div.className = 'notification';
  div.style.borderLeft = isError ? '4px solid #ff4444' : '4px solid #4CAF50';
  div.innerHTML = `
    <h4 style=\"margin-bottom:8px;\">${title}</h4>
    <p style=\"font-size:14px;color:#555;\">${message}</p>
    <button class=\"notification-close\">Close</button>
  `;
  document.body.appendChild(div);

  const btn = div.querySelector('.notification-close');
  if (btn) {
    btn.addEventListener('click', () => {
      if (div.parentNode) div.parentNode.removeChild(div);
    });
  }

  setTimeout(() => {
    if (div.parentNode) div.parentNode.removeChild(div);
  }, 8000);
}

// Expose functions used by inline HTML attributes
window.switchTab = switchTab;
window.populateTeams = populateTeams;
window.showSchedule = showSchedule;
window.subscribeToTeam = subscribeToTeam;
window.filterByYear = filterByYear;
window.filterEvents = filterEvents;

