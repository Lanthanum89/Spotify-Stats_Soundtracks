// SoundTracks App JavaScript Logic
let currentTab = 'overview';
let currentRange = 'medium_term'; // short_term, medium_term, long_term
let appData = {
  profile: null,
  topTracks: {}, // Keyed by range
  topArtists: {}, // Keyed by range
  recentlyPlayed: null
};

// UK English formatting helpers
function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

function formatHours(ms) {
  const hours = ms / 3600000;
  return `${hours.toFixed(hours >= 10 ? 1 : 2)}h`;
}

function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMins / 60);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  
  // Format as day/month/year for UK English standard
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Initialise App
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  checkAuthStatus();
});

// Check if user is authenticated
async function checkAuthStatus() {
  const urlParams = new URLSearchParams(window.location.search);
  const error = urlParams.get('error');
  
  if (error) {
    showError(error);
    showLoginScreen();
    hideLoading();
    return;
  }

  try {
    const res = await fetch('/api/auth-status');
    const status = await res.json();

    if (status.authenticated) {
      // Clear URL params if any
      window.history.replaceState({}, document.title, "/");
      await loadDashboard();
    } else {
      showLoginScreen();
    }
  } catch (err) {
    console.error('Error checking auth status:', err);
    showError('failed_connection');
    showLoginScreen();
  } finally {
    hideLoading();
  }
}

function showLoginScreen() {
  document.getElementById('login-container').classList.remove('hidden');
  document.getElementById('app-container').classList.add('hidden');
}

function showDashboardScreen() {
  document.getElementById('login-container').classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loading-container').classList.add('hidden');
}

function showError(errorType) {
  const banner = document.getElementById('auth-error-msg');
  banner.classList.remove('hidden');
  
  let msg = 'An error occurred during authentication. Please try again.';
  if (errorType === 'access_denied') {
    msg = 'Access was denied. You must approve permissions to use the application.';
  } else if (errorType === 'token_exchange_failed') {
    msg = 'Failed to exchange token with Spotify. Please check your credentials.';
  } else if (errorType === 'no_code') {
    msg = 'No authorisation code was returned from Spotify.';
  } else if (errorType === 'failed_connection') {
    msg = 'Unable to connect to the local server. Is it running?';
  }
  
  banner.textContent = msg;
}

// Setup Event Listeners
function setupEventListeners() {
  // Navigation tabs
  document.querySelectorAll('.nav-item').forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  // Time Range filters
  document.querySelectorAll('.time-filter-btn').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.time-filter-btn').forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      currentRange = button.getAttribute('data-range');
      
      // Reload current tab content with new range
      if (currentTab === 'tracks') {
        loadTopTracks(true);
      } else if (currentTab === 'artists') {
        loadTopArtists(true);
      }
    });
  });
}

// Switch tabs logic
function switchTab(tabId) {
  currentTab = tabId;
  
  // Update sidebar active state
  document.querySelectorAll('.nav-item').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Show/Hide time range filter
  const timeFilter = document.getElementById('time-filter-container');
  if (tabId === 'tracks' || tabId === 'artists') {
    timeFilter.classList.remove('hidden');
  } else {
    timeFilter.classList.add('hidden');
  }

  // Update header title
  const titles = {
    overview: 'overview',
    tracks: 'top-tracks',
    artists: 'top-artists',
    genres: 'genres',
    recent: 'recent'
  };
  document.getElementById('current-tab-title').textContent = titles[tabId] || 'dashboard';

  // Toggle tab panels
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
  });
  document.getElementById(`tab-${tabId}`).classList.add('active');

  // Load tab data
  if (tabId === 'overview') {
    renderOverview();
  } else if (tabId === 'tracks') {
    loadTopTracks();
  } else if (tabId === 'artists') {
    loadTopArtists();
  } else if (tabId === 'genres') {
    renderGenresTab();
  } else if (tabId === 'recent') {
    loadRecentlyPlayed();
  }
}

// Load and cache all initial dashboard data
async function loadDashboard() {
  showDashboardScreen();
  
  try {
    // Fetch profile and recently played immediately
    const [profileRes, recentRes, tracksRes, artistsRes] = await Promise.all([
      fetch('/api/profile'),
      fetch('/api/recently-played?limit=50'),
      fetch(`/api/top/tracks?time_range=medium_term&limit=50`),
      fetch(`/api/top/artists?time_range=medium_term&limit=50`)
    ]);

    appData.profile = await profileRes.json();
    appData.recentlyPlayed = await recentRes.json();
    appData.topTracks['medium_term'] = await tracksRes.json();
    appData.topArtists['medium_term'] = await artistsRes.json();

    // Fill user bar details
    document.getElementById('user-name').textContent = appData.profile.display_name;
    const avatarUrl = appData.profile.images && appData.profile.images.length > 0 
      ? appData.profile.images[0].url 
      : 'https://via.placeholder.com/40';
    document.getElementById('user-avatar').src = avatarUrl;
    document.getElementById('user-account-type').textContent = appData.profile.product.toUpperCase();

    // Render overview tab first
    renderOverview();

  } catch (err) {
    console.error('Error fetching dashboard data:', err);
    // If request fails, maybe session expired
    window.location.href = '/logout';
  }
}

// RENDER OVERVIEW TAB
function renderOverview() {
  if (!appData.profile || !appData.recentlyPlayed) return;

  const profile = appData.profile;
  const recent = appData.recentlyPlayed;
  const topTracks = appData.topTracks['medium_term'];
  const topArtists = appData.topArtists['medium_term'];

  // 1. Calculate Playtime (Last 50 songs)
  let totalPlaytimeMs = 0;
  if (recent && recent.items) {
    recent.items.forEach(item => {
      totalPlaytimeMs += item.track.duration_ms;
    });
  }
  const totalPlaytimeMins = Math.round(totalPlaytimeMs / 60000);
  document.getElementById('stat-recent-playtime').textContent = `${totalPlaytimeMins} mins`;

  // 2. Favorite Track / Artist labels
  if (topTracks && topTracks.items && topTracks.items.length > 0) {
    document.getElementById('stat-favorite-track').textContent = topTracks.items[0].name;
  } else {
    document.getElementById('stat-favorite-track').textContent = 'None';
  }

  if (topArtists && topArtists.items && topArtists.items.length > 0) {
    document.getElementById('stat-favorite-artist').textContent = topArtists.items[0].name;
  } else {
    document.getElementById('stat-favorite-artist').textContent = 'None';
  }

  // 3. Profile Card Details
  const avatarUrl = profile.images && profile.images.length > 0 
    ? profile.images[0].url 
    : 'https://via.placeholder.com/150';
  document.getElementById('profile-img-large').src = avatarUrl;
  document.getElementById('profile-name-large').textContent = profile.display_name;
  document.getElementById('profile-followers').textContent = `${profile.followers.total.toLocaleString('en-GB')} followers`;
  document.getElementById('profile-country').textContent = profile.country;
  document.getElementById('profile-product').textContent = profile.product;

  // 4. Recently Played Teaser (Limit to 5)
  const recentList = document.getElementById('overview-recent-list');
  recentList.innerHTML = '';
  if (recent && recent.items) {
    recent.items.slice(0, 5).forEach(item => {
      const track = item.track;
      const cover = track.album.images && track.album.images.length > 0 
        ? track.album.images[0].url 
        : 'https://via.placeholder.com/44';
      const artistsName = track.artists.map(a => a.name).join(', ');
      
      const div = document.createElement('div');
      div.className = 'mini-track-item';
      div.innerHTML = `
        <img class="mini-track-cover" src="${cover}" alt="${track.name}">
        <div class="mini-track-info">
          <span class="mini-track-title">${track.name}</span>
          <span class="mini-track-artist">${artistsName}</span>
        </div>
        <div class="mini-track-meta">
          <span>${formatRelativeTime(item.played_at)}</span>
        </div>
      `;
      recentList.appendChild(div);
    });
  }

  // 5. Current Favorites Teaser (Limit to 5)
  const tracksList = document.getElementById('overview-tracks-list');
  tracksList.innerHTML = '';
  if (topTracks && topTracks.items) {
    topTracks.items.slice(0, 5).forEach(track => {
      const cover = track.album.images && track.album.images.length > 0 
        ? track.album.images[0].url 
        : 'https://via.placeholder.com/44';
      const artistsName = track.artists.map(a => a.name).join(', ');
      
      const div = document.createElement('div');
      div.className = 'mini-track-item';
      div.innerHTML = `
        <img class="mini-track-cover" src="${cover}" alt="${track.name}">
        <div class="mini-track-info">
          <span class="mini-track-title">${track.name}</span>
          <span class="mini-track-artist">${artistsName}</span>
        </div>
        <div class="mini-track-meta">
          <span>${formatDuration(track.duration_ms)}</span>
        </div>
      `;
      tracksList.appendChild(div);
    });
  }

  // 6. Genres summary teaser
  renderMiniGenres(topArtists);
}

// Render Mini Genres List on Overview
function renderMiniGenres(topArtists) {
  const container = document.getElementById('overview-genres-list');
  container.innerHTML = '';

  if (!topArtists || !topArtists.items || topArtists.items.length === 0) {
    container.innerHTML = '<div class="loading-inline">No genre data available.</div>';
    return;
  }

  const genreCounts = {};
  topArtists.items.forEach(artist => {
    artist.genres.forEach(genre => {
      genreCounts[genre] = (genreCounts[genre] || 0) + 1;
    });
  });

  const sortedGenres = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3); // Top 3

  const totalHits = Object.values(genreCounts).reduce((a, b) => a + b, 0);

  if (sortedGenres.length === 0) {
    container.innerHTML = '<div class="loading-inline">Not enough artist data to map genres.</div>';
    return;
  }

  sortedGenres.forEach(([genre, count]) => {
    const percentage = Math.round((count / totalHits) * 100);
    const item = document.createElement('div');
    item.className = 'genre-bar-container';
    item.innerHTML = `
      <div class="genre-bar-info">
        <span class="genre-bar-name">${genre}</span>
        <span class="genre-bar-percentage">${percentage}%</span>
      </div>
      <div class="genre-bar-wrapper">
        <div class="genre-bar-fill" style="width: ${percentage}%"></div>
      </div>
    `;
    container.appendChild(item);
  });
}

// LOAD TOP TRACKS
async function loadTopTracks(forceReload = false) {
  const tbody = document.getElementById('top-tracks-table-body');
  
  if (!forceReload && appData.topTracks[currentRange]) {
    renderTopTracks(appData.topTracks[currentRange]);
    return;
  }

  tbody.innerHTML = '<tr><td colspan="5" class="loading-inline"><div class="spinner" style="height: 30px; width: 30px; margin: 0 auto;"></div></td></tr>';

  try {
    const res = await fetch(`/api/top/tracks?time_range=${currentRange}&limit=50`);
    const data = await res.json();
    appData.topTracks[currentRange] = data;
    renderTopTracks(data);
  } catch (err) {
    console.error('Error fetching top tracks:', err);
    tbody.innerHTML = '<tr><td colspan="5" class="loading-inline">Failed to load tracks. Please try again.</td></tr>';
  }
}

function renderTopTracks(data) {
  const tbody = document.getElementById('top-tracks-table-body');
  tbody.innerHTML = '';

  if (!data || !data.items || data.items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading-inline">No tracks found for this period. Keep listening!</td></tr>';
    return;
  }

  data.items.forEach((track, index) => {
    const cover = track.album.images && track.album.images.length > 0 
      ? track.album.images[0].url 
      : 'https://via.placeholder.com/48';
    const artistsName = track.artists.map(a => a.name).join(', ');
    const spotifyUrl = track.external_urls.spotify;
    const albumUrl = track.album.external_urls.spotify;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>
        <div class="track-row-cell">
          <img class="track-row-cover" src="${cover}" alt="${track.name}">
          <div class="track-row-details">
            <a class="track-row-title" href="${spotifyUrl}" target="_blank" rel="noopener noreferrer">${track.name}</a>
            <span class="track-row-artist">${artistsName}</span>
          </div>
        </div>
      </td>
      <td>
        <a class="album-link" href="${albumUrl}" target="_blank" rel="noopener noreferrer">${track.album.name}</a>
      </td>
      <td>
        <div class="popularity-meter" title="${track.popularity}% popularity">
          <div class="popularity-fill" style="width: ${track.popularity}%"></div>
        </div>
      </td>
      <td style="text-align: right;">${formatDuration(track.duration_ms)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// LOAD TOP ARTISTS
async function loadTopArtists(forceReload = false) {
  const grid = document.getElementById('top-artists-grid');

  if (!forceReload && appData.topArtists[currentRange]) {
    renderTopArtists(appData.topArtists[currentRange]);
    return;
  }

  grid.innerHTML = '<div class="loading-inline" style="grid-column: 1/-1;"><div class="spinner" style="height: 30px; width: 30px; margin: 0 auto;"></div></div>';

  try {
    const res = await fetch(`/api/top/artists?time_range=${currentRange}&limit=50`);
    const data = await res.json();
    appData.topArtists[currentRange] = data;
    renderTopArtists(data);
  } catch (err) {
    console.error('Error fetching top artists:', err);
    grid.innerHTML = '<div class="loading-inline" style="grid-column: 1/-1;">Failed to load artists. Please try again.</div>';
  }
}

function renderTopArtists(data) {
  const grid = document.getElementById('top-artists-grid');
  grid.innerHTML = '';

  if (!data || !data.items || data.items.length === 0) {
    grid.innerHTML = '<div class="loading-inline" style="grid-column: 1/-1;">No artists found for this period. Keep listening!</div>';
    return;
  }

  data.items.forEach((artist, index) => {
    const photo = artist.images && artist.images.length > 0 
      ? artist.images[0].url 
      : 'https://via.placeholder.com/120';
    const mainGenre = artist.genres && artist.genres.length > 0 ? artist.genres[0] : 'Various';
    const spotifyUrl = artist.external_urls.spotify;

    const div = document.createElement('div');
    div.className = 'artist-card';
    div.innerHTML = `
      <span class="artist-rank">#${index + 1}</span>
      <img class="artist-img" src="${photo}" alt="${artist.name}">
      <span class="artist-name"><a href="${spotifyUrl}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;">${artist.name}</a></span>
      <span class="artist-genre-pill" title="${artist.genres.join(', ')}">${mainGenre}</span>
    `;
    grid.appendChild(div);
  });
}

// RENDER GENRES TAB
function renderGenresTab() {
  const chartContainer = document.getElementById('genres-chart-container');
  const donutContainer = document.getElementById('genre-donut');
  const tasteTitle = document.getElementById('taste-title');
  const tasteDesc = document.getElementById('taste-description');
  const primaryGenreVal = document.getElementById('genre-stat-primary');
  const uniqueGenresVal = document.getElementById('genre-stat-unique');
  const topShareVal = document.getElementById('genre-stat-share');

  // We analyze the genres of the active Top Artists list
  const activeArtists = appData.topArtists[currentRange] || appData.topArtists['medium_term'];

  if (!activeArtists || !activeArtists.items || activeArtists.items.length === 0) {
    chartContainer.innerHTML = '<div class="loading-inline">Not enough artist data to display genres. Please listen to more music first.</div>';
    donutContainer.innerHTML = '';
    return;
  }

  const genreCounts = {};
  activeArtists.items.forEach(artist => {
    artist.genres.forEach(genre => {
      genreCounts[genre] = (genreCounts[genre] || 0) + 1;
    });
  });

  const sortedGenres = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1]);

  const totalHits = Object.values(genreCounts).reduce((a, b) => a + b, 0);
  const uniqueCount = sortedGenres.length;

  primaryGenreVal.textContent = sortedGenres.length > 0 ? sortedGenres[0][0] : '-';
  uniqueGenresVal.textContent = uniqueCount;
  topShareVal.textContent = sortedGenres.length > 0
    ? `${Math.round((sortedGenres[0][1] / totalHits) * 100)}%`
    : '0%';

  const recentItems = appData.recentlyPlayed?.items || [];
  const recentDurationMs = recentItems.reduce((total, item) => total + item.track.duration_ms, 0);
  const averageDurationMs = recentItems.length > 0 ? recentDurationMs / recentItems.length : 0;
  document.getElementById('genre-metric-plays').textContent = recentItems.length.toLocaleString('en-GB');
  document.getElementById('genre-metric-hours').textContent = formatHours(recentDurationMs);
  document.getElementById('genre-metric-average').textContent = formatDuration(averageDurationMs);
  document.getElementById('genre-metric-unique').textContent = uniqueCount.toLocaleString('en-GB');

  // Render a focused top-six distribution and group the long tail.
  chartContainer.innerHTML = '';
  const displayGenres = sortedGenres.slice(0, 6);

  displayGenres.forEach(([genre, count], index) => {
    const percentage = Math.round((count / totalHits) * 100);
    const bar = document.createElement('div');
    bar.className = 'genre-bar-container';
    bar.innerHTML = `
      <div class="genre-bar-info">
        <span class="genre-bar-name">${String(index + 1).padStart(2, '0')} / ${genre}</span>
        <span class="genre-bar-percentage">${count} artist${count > 1 ? 's' : ''} · ${percentage}%</span>
      </div>
      <div class="genre-bar-wrapper">
        <div class="genre-bar-fill" style="width: ${percentage}%"></div>
      </div>
    `;
    chartContainer.appendChild(bar);
  });

  renderGenreDonut(sortedGenres, totalHits);

  // Taste Classification Logic
  if (sortedGenres.length === 0) {
    tasteTitle.textContent = 'Insufficient signal';
    tasteDesc.textContent = 'Listen to more artists on Spotify to build a useful genre profile.';
    return;
  }

  const topGenre = sortedGenres[0][0].toLowerCase();
  
  // Custom classification based on top genre
  if (topGenre.includes('rock') || topGenre.includes('metal') || topGenre.includes('grunge')) {
    tasteTitle.textContent = 'High-gain architecture';
    tasteDesc.textContent = 'Guitar-led, rhythm-forward listening with a preference for weight, texture, and strong band dynamics.';
  } else if (topGenre.includes('pop') || topGenre.includes('dance')) {
    tasteTitle.textContent = 'Hook-driven systems';
    tasteDesc.textContent = 'Clean production, immediate melodies, and high-energy arrangements dominate your current listening profile.';
  } else if (topGenre.includes('rap') || topGenre.includes('hip hop') || topGenre.includes('trap')) {
    tasteTitle.textContent = 'Low-end focused';
    tasteDesc.textContent = 'Bass, cadence, and vocal flow are the strongest signals across your top-artist set.';
  } else if (topGenre.includes('indie') || topGenre.includes('alternative') || topGenre.includes('folk')) {
    tasteTitle.textContent = 'Independent signal';
    tasteDesc.textContent = 'Atmospheric arrangements, organic production, and introspective songwriting recur across your taste profile.';
  } else if (topGenre.includes('electronic') || topGenre.includes('house') || topGenre.includes('techno') || topGenre.includes('edm')) {
    tasteTitle.textContent = 'Synthetic runtime';
    tasteDesc.textContent = 'Repetition, detailed sound design, and electronic rhythm form the core of your listening environment.';
  } else if (topGenre.includes('jazz') || topGenre.includes('blues') || topGenre.includes('soul') || topGenre.includes('r&b')) {
    tasteTitle.textContent = 'Harmonic depth';
    tasteDesc.textContent = 'Vocal detail, expressive harmony, and groove carry more weight than genre boundaries in your listening.';
  } else {
    tasteTitle.textContent = 'Distributed taste';
    tasteDesc.textContent = 'Your top artists span a broad set of sub-genres without a single category overwhelming the rest.';
  }
}

function renderGenreDonut(sortedGenres, totalHits) {
  const container = document.getElementById('genre-donut');
  const palette = ['#cbbaf0', '#aa96d8', '#8773b4', '#67568e', '#4f426c', '#393144'];
  const topGenres = sortedGenres.slice(0, 5);
  const topTotal = topGenres.reduce((sum, [, count]) => sum + count, 0);
  const segments = [...topGenres];

  if (topTotal < totalHits) {
    segments.push(['other', totalHits - topTotal]);
  }

  const radius = 72;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const circles = segments.map(([genre, count], index) => {
    const fraction = count / totalHits;
    const dash = fraction * circumference;
    const circle = `
      <circle
        cx="100" cy="100" r="${radius}"
        fill="none"
        stroke="${palette[index]}"
        stroke-width="24"
        stroke-dasharray="${dash} ${circumference - dash}"
        stroke-dashoffset="${-offset}"
        transform="rotate(-90 100 100)"
      >
        <title>${genre}: ${Math.round(fraction * 100)}%</title>
      </circle>`;
    offset += dash;
    return circle;
  }).join('');

  container.innerHTML = `
    <svg viewBox="0 0 200 200" role="img" aria-labelledby="genre-chart-title genre-chart-desc">
      <title id="genre-chart-title">Genre distribution</title>
      <desc id="genre-chart-desc">Distribution of genre tags across your top artists.</desc>
      <circle cx="100" cy="100" r="${radius}" fill="none" stroke="#292431" stroke-width="24"></circle>
      ${circles}
      <text x="100" y="96" class="donut-total">${sortedGenres.length}</text>
      <text x="100" y="112" class="donut-label">GENRE SIGNALS</text>
    </svg>
  `;
}

// LOAD RECENTLY PLAYED
async function loadRecentlyPlayed() {
  const tbody = document.getElementById('recently-played-table-body');
  tbody.innerHTML = '<tr><td colspan="5" class="loading-inline"><div class="spinner" style="height: 30px; width: 30px; margin: 0 auto;"></div></td></tr>';

  try {
    const res = await fetch('/api/recently-played?limit=50');
    const data = await res.json();
    appData.recentlyPlayed = data;
    renderRecentlyPlayed(data);
  } catch (err) {
    console.error('Error fetching recently played:', err);
    tbody.innerHTML = '<tr><td colspan="5" class="loading-inline">Failed to load recently played tracks. Please try again.</td></tr>';
  }
}

function renderRecentlyPlayed(data) {
  const tbody = document.getElementById('recently-played-table-body');
  tbody.innerHTML = '';

  if (!data || !data.items || data.items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading-inline">No recently played tracks found. Let\'s play some music!</td></tr>';
    return;
  }

  data.items.forEach((item, index) => {
    const track = item.track;
    const cover = track.album.images && track.album.images.length > 0 
      ? track.album.images[0].url 
      : 'https://via.placeholder.com/48';
    const artistsName = track.artists.map(a => a.name).join(', ');
    const spotifyUrl = track.external_urls.spotify;
    const albumUrl = track.album.external_urls.spotify;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>
        <div class="track-row-cell">
          <img class="track-row-cover" src="${cover}" alt="${track.name}">
          <div class="track-row-details">
            <a class="track-row-title" href="${spotifyUrl}" target="_blank" rel="noopener noreferrer">${track.name}</a>
            <span class="track-row-artist">${artistsName}</span>
          </div>
        </div>
      </td>
      <td>
        <a class="album-link" href="${albumUrl}" target="_blank" rel="noopener noreferrer">${track.album.name}</a>
      </td>
      <td>
        <span class="played-at-time">${formatRelativeTime(item.played_at)}</span>
      </td>
      <td style="text-align: right;">${formatDuration(track.duration_ms)}</td>
    `;
    tbody.appendChild(tr);
  });
}
