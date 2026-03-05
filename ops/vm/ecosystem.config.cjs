module.exports = {
  apps: [
    {
      name: "somnia2-api",
      cwd: "/opt/somnia2-deployer/current/server",
      script: "dist/index.js",
      interpreter: "node",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
        PORT: "3001",
      },
    },
  ],
};
