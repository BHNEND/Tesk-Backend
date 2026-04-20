module.exports = {
  apps: [
    {
      name: 'tesk-backend',
      script: './src/index.ts',
      interpreter: 'node',
      // 使用 node --import 让 tsx 生效
      interpreter_args: '--import tsx',
      env: {
        NODE_ENV: 'development',
      },
      watch: ['src'],
      ignore_watch: ['node_modules', 'public', 'admin'],
      max_memory_restart: '1G'
    }
  ],
};
