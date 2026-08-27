'use strict';
/*
 * Shared job-detail template for both /jobs/uk/ and /jobs/ie/ — reads
 * ?country=uk|ie&id=... and renders from live GET /v1/jobs API endpoints.
 * Injects JobPosting JSON-LD schema into document.head per Step 6 spec.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  const country = (params.get('country') || 'uk').toLowerCase();
  const id = params.get('id') || '';

  document.getElementById('backLink').href = `/jobs/${country}/`;

  const card = document.getElementById('detailCard');

  let job = null;

  try {
    const res = await fetch(`/v1/jobs?country=${encodeURIComponent(country)}`);
    if (res.ok) {
      const apiJobs = await res.json();
      const rawJob = apiJobs.find((entry) => entry.id === id);
      if (rawJob) {
        job = {
          id: rawJob.id,
          title: rawJob.title,
          company: rawJob.company,
          location: rawJob.location,
          country: rawJob.country === 'ie' ? 'IE' : 'GB',
          arrangement: rawJob.work_arrangement || 'On-site',
          type: rawJob.employment_type || 'Full-time',
          currency: rawJob.currency || (rawJob.country === 'ie' ? 'EUR' : 'GBP'),
          salaryMin: rawJob.salary || 70000,
          salaryMax: rawJob.salary ? Math.round(rawJob.salary * 1.2) : 90000,
          posted: rawJob.created_at || new Date().toISOString(),
          skills: Array.isArray(rawJob.required_skills) ? rawJob.required_skills : [],
          summary: rawJob.description || 'No description provided.',
          requirements: ['Strong technical background and problem-solving skills.', 'Experience building and shipping production AI/software systems.'],
        };
      }
    }
  } catch (err) {
    console.error('Failed to fetch job detail from API:', err);
  }

  if (!job) {
    card.innerHTML = `<h1>Role not found</h1><p>This listing may have closed or does not exist. <a href="/jobs/${country}/">Browse open roles</a>.</p>`;
    return;
  }

  document.title = `${job.title} at ${job.company} | Veer`;
  const symbol = job.currency === 'EUR' ? '€' : '£';
  const salaryFmt = (n) => Math.round(n / 1000) + 'k';
  const salary = job.salaryMin === job.salaryMax ? `${symbol}${salaryFmt(job.salaryMin)}` : `${symbol}${salaryFmt(job.salaryMin)}–${symbol}${salaryFmt(job.salaryMax)}`;

  card.innerHTML = `
    <h1>${escapeHtml(job.title)}</h1>
    <p class="detail-company">${escapeHtml(job.company)} · ${escapeHtml(job.location)}</p>
    <div class="detail-facts">
      <div><b>${salary}</b><span>Salary</span></div>
      <div><b>${escapeHtml(job.type)}</b><span>Employment type</span></div>
      <div><b>${escapeHtml(job.arrangement)}</b><span>Work arrangement</span></div>
      <div><b>${escapeHtml(job.location)}</b><span>Location</span></div>
    </div>
    <div class="detail-section">
      <h2>About the role</h2>
      <p>${escapeHtml(job.summary)}</p>
      <h2>What we're looking for</h2>
      <ul>${job.requirements.map((requirement) => `<li>${escapeHtml(requirement)}</li>`).join('')}</ul>
      <h2>Key skills</h2>
      <div class="job-tags">${job.skills.map((skill) => `<span>${escapeHtml(skill)}</span>`).join('')}</div>
    </div>
    <div class="detail-apply">
      <a class="btn" href="/index.html?jobId=${encodeURIComponent(job.id)}#flow">Apply for this role</a>
      <p>Applying starts with the same fair, explainable Veer process for every candidate — CV match, skills assessment, then a short interview.</p>
    </div>
  `;

  injectJobPostingSchema(job);
});

function injectJobPostingSchema(job) {
  const schema = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title,
    description: job.summary,
    datePosted: job.posted,
    employmentType: job.type === 'Contract' ? 'CONTRACTOR' : 'FULL_TIME',
    hiringOrganization: { '@type': 'Organization', name: job.company },
    jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: job.location, addressCountry: job.country } },
    baseSalary: { '@type': 'MonetaryAmount', currency: job.currency, value: { '@type': 'QuantitativeValue', minValue: job.salaryMin, maxValue: job.salaryMax, unitText: 'YEAR' } },
  };
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(schema);
  document.head.appendChild(script);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}
