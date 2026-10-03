// Forwards /api calls from the Angular dev server to the backend, so the browser
// only talks to one origin (no CORS setup needed).
// Locally the API runs on localhost:3000; in docker-compose API_URL points at the
// backend service.
module.exports = {
  '/api': {
    target: process.env.API_URL || 'http://localhost:3000',
    secure: false,
    changeOrigin: true,
  },
};
