module.exports = {
  apps: [
    {
      name: 'tesk-api',
      script: 'dist/index.js',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PROCESS_TYPE: 'api',
        DATABASE_POOL_LIMIT: '15',
      },
      max_memory_restart: '1G',
    },
    {
      name: 'tesk-worker',
      script: 'dist/index.js',
      instances: 10,
      env: {
        NODE_ENV: 'production',
        PROCESS_TYPE: 'worker',
        WORKER_CONCURRENCY: '20',
        DATABASE_POOL_LIMIT: '40',
      },
      max_memory_restart: '2G',
      node_args: '--max-old-space-size=1792',
    },
    {
      name: 'tesk-timeout',
      script: 'dist/index.js',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PROCESS_TYPE: 'timeout',
        DATABASE_POOL_LIMIT: '5',
      },
      max_memory_restart: '512M',
    },
  ],
};
