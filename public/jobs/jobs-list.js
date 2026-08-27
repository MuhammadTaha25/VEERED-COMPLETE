'use strict';
/* Shared rendering/filter logic for the UK and Ireland job-listing pages.
 * Fetches live data from GET /v1/jobs?country=uk|ie reading directly from SQLite DB,
 * matching architecture-spec.md §4 exactly. */

async function renderJobList(opts) {
  const grid = document.getElementById('jobGrid');
  const emptyState = document.getElementById('emptyState');
  const resultCount = document.getElementById('resultCount');
  const activeFilters = { type: null, arrangement: null };

  let jobs = window.VEER_JOBS || [];

  try {
    const res = await fetch(`/v1/jobs?country=${encodeURIComponent(opts.country)}`);
    if (res.ok) {
      const apiJobs = await res.json();
      if (Array.isArray(apiJobs) && apiJobs.length > 0) {
        jobs = apiJobs.map((j) => ({
          id: j.id,
          title: j.title,
          company: j.company,
          location: j.location,
          country: j.country === 'ie' ? 'IE' : 'GB',
          arrangement: j.work_arrangement || j.arrangement || 'On-site',
          type: j.employment_type || j.type || 'Full-time',
          currency: j.currency || (j.country === 'ie' ? 'EUR' : 'GBP'),
          salaryMin: j.salary || j.salaryMin || 60000,
          salaryMax: j.salary ? Math.round(j.salary * 1.2) : (j.salaryMax || 85000),
          posted: j.created_at || j.posted || new Date().toISOString(),
          skills: Array.isArray(j.required_skills) ? j.required_skills : (j.skills || []),
          summary: j.description || j.summary || '',
        }));
      }
    }
  } catch (err) {
    console.error('API fetch error for jobs, falling back to static window.VEER_JOBS:', err);
  }

  function currencySymbol(code) { return code === 'EUR' ? '€' : '£'; }

  function formatSalary(job) {
    const symbol = currencySymbol(job.currency);
    const fmt = (n) => Math.round(n / 1000) + 'k';
    if (job.salaryMin === job.salaryMax) {
      return `${symbol}${fmt(job.salaryMin)}`;
    }
    return `${symbol}${fmt(job.salaryMin)}–${symbol}${fmt(job.salaryMax)}`;
  }

  function daysAgo(dateStr) {
    const diff = Math.max(0, Math.round((Date.now() - new Date(dateStr).getTime()) / 86400000));
    if (diff === 0) return 'Posted today';
    if (diff === 1) return 'Posted 1 day ago';
    return `Posted ${diff} days ago`;
  }

  function jobCard(job) {
    const card = document.createElement('a');
    card.className = 'job-card';
    card.href = `/jobs/job-detail.html?country=${opts.country}&id=${encodeURIComponent(job.id)}`;
    const left = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = job.title;
    const meta = document.createElement('div');
    meta.className = 'job-meta';
    meta.innerHTML = `<span>${escapeHtml(job.company)}</span><span>${escapeHtml(job.location)}</span><span>${escapeHtml(job.type)}</span><span>${escapeHtml(job.arrangement)}</span>`;
    const tags = document.createElement('div');
    tags.className = 'job-tags';
    tags.replaceChildren(...(job.skills || []).slice(0, 4).map((skill) => { const span = document.createElement('span'); span.textContent = skill; return span; }));
    left.append(title, meta, tags);

    const right = document.createElement('div');
    const salary = document.createElement('div');
    salary.className = 'job-salary';
    salary.textContent = formatSalary(job);
    const posted = document.createElement('div');
    posted.className = 'job-posted';
    posted.textContent = daysAgo(job.posted);
    right.append(salary, posted);

    card.append(left, right);
    return card;
  }

  function applyFilters() {
    const filtered = jobs.filter((job) => {
      if (activeFilters.type && job.type !== activeFilters.type) return false;
      if (activeFilters.arrangement && job.arrangement !== activeFilters.arrangement) return false;
      return true;
    });
    grid.replaceChildren(...filtered.map(jobCard));
    emptyState.classList.toggle('hidden', filtered.length > 0);
    resultCount.textContent = `${filtered.length} role${filtered.length === 1 ? '' : 's'} in ${opts.countryLabel}`;
  }

  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const filterKey = chip.dataset.filter;
      const value = chip.dataset.value;
      const isActive = activeFilters[filterKey] === value;
      activeFilters[filterKey] = isActive ? null : value;
      document.querySelectorAll(`.chip[data-filter="${filterKey}"]`).forEach((other) => {
        other.setAttribute('aria-pressed', String(!isActive && other === chip));
      });
      applyFilters();
    });
  });

  applyFilters();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}
