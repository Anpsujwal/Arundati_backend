'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/index');

test('Vercel serverless handler responds to health check without filesystem error', async () => {
  // Simulate HTTP request to health check
  const mockReq = {
    method: 'GET',
    url: '/api/v1/health',
    headers: { host: 'localhost' },
  };

  let statusCode = 200;
  let responseData = null;
  const headers = {};

  const mockRes = {
    statusCode: 200,
    setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
    getHeader: (k) => headers[k.toLowerCase()],
    status: function (code) { this.statusCode = code; return this; },
    json: function (data) { responseData = data; return this; },
    end: function (data) { if (data && !responseData) responseData = data; return this; },
  };

  await handler(mockReq, mockRes);

  assert.equal(mockRes.statusCode, 200);
  assert.equal(responseData.success, true);
  assert.match(responseData.message, /Arundhati API is running/);
});
