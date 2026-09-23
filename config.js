// where the force server lives. Same origin in local dev, the GPU box in production.
window.API_BASE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '' : 'https://api.CHANGE-ME.example';
