// app.json plus the web build's base path: "/spofftilist" on GitHub Pages, "" when testing locally.
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    baseUrl: process.env.SPOFFTILIST_BASE_URL || undefined,
  },
});
