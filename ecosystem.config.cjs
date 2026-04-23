module.exports = {
  apps: [
    {
      name: 'tesk-backend',
      script: 'dist/index.js',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '1G',
    },
  ],
};
