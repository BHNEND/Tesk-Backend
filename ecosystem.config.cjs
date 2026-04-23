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
      instances: 5,
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
      name: 'tesk-app-worker',
      script: 'dist/index.js',
      instances: 2,
      env: {
        NODE_ENV: 'production',
        PROCESS_TYPE: 'app-worker',
        APP_WORKER_CONCURRENCY: '4',
        DATABASE_POOL_LIMIT: '10',
      },
      max_memory_restart: '1G',
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
