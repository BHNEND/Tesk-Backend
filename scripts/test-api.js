const API_URL = 'http://localhost:4000/api/v1/jobs/createTask';
const RECORD_URL = 'http://localhost:4000/api/v1/jobs/recordInfo';
const API_KEY = 'test-api-key-123456';

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json'
};

async function testModelTask() {
  console.log('🚀 发送 [Model] 任务请求...');
  const body = {
    type: 'model',
    model: 'video-gen-v1',
    callBackUrl: 'https://webhook.site/mock-success',
    input: {
      prompt: 'A futuristic city at sunset',
      resolution: '1080p'
    }
  };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const data = await res.json();
  console.log('✅ [Model] 返回结果:', JSON.stringify(data, null, 2));
  return data.data?.taskId;
}

async function testAppTask() {
  console.log('🚀 发送 [App] 任务请求...');
  const body = {
    type: 'app',
    appid: 'app-doc-summary-001',
    callBackUrl: 'https://webhook.site/mock-success',
    input: {
      fileUrl: 'https://example.com/legal-doc.pdf',
      language: 'zh-CN',
      maxWords: 100
    }
  };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const data = await res.json();
  console.log('✅ [App] 返回结果:', JSON.stringify(data, null, 2));
  return data.data?.taskId;
}

async function checkStatus(taskId) {
  if (!taskId) return;
  console.log(`🔍 查询任务状态 [${taskId}]...`);
  const res = await fetch(`${RECORD_URL}?taskId=${taskId}`, { headers });
  const data = await res.json();
  console.log('📊 任务当前详情:', JSON.stringify(data, null, 2));
}

async function runTests() {
  try {
    const taskId1 = await testModelTask();
    const taskId2 = await testAppTask();
    
    // 等待几秒后查询状态
    setTimeout(() => checkStatus(taskId1), 3000);
    setTimeout(() => checkStatus(taskId2), 4000);
  } catch (err) {
    console.error('❌ 测试过程中出错:', err.message);
  }
}

runTests();
