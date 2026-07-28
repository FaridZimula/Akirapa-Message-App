const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 3009;
const baseUrl = `http://127.0.0.1:${PORT}`;
let serverProcess = null;

async function waitForServer(url, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return true;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

test.before(async () => {
  const serverPath = path.join(__dirname, '..', 'server.js');
  serverProcess = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe'
  });
  serverProcess.stdout.on('data', (d) => console.log(`[SERVER STDOUT] ${d}`));
  serverProcess.stderr.on('data', (d) => console.error(`[SERVER STDERR] ${d}`));
  await waitForServer(baseUrl);
});

test.after(() => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
});

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { response, body };
}

test('Full System API Integration Suite', async () => {
  // 1. Health check
  const health = await request('/api/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.body.ok, true);

  // 2. Auth - Login Caregiver via Username
  const caregiverLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'ava_caregiver', password: '123456' })
  });
  assert.equal(caregiverLogin.response.status, 200);
  assert.ok(caregiverLogin.body.session?.access_token);
  const caregiverToken = caregiverLogin.body.session.access_token;

  // 2b. Auth - Send Email OTP
  const testEmail = `newuser_${Date.now()}@akirapa.com`;
  const testUsername = `user_${Date.now()}`;
  const sendOtpRes = await request('/api/auth/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail })
  });
  assert.equal(sendOtpRes.response.status, 200);
  assert.ok(sendOtpRes.body.devOtp);
  assert.equal(sendOtpRes.body.devOtp.length, 6);
  const randomOtp = sendOtpRes.body.devOtp;

  // 2c. Auth - Register with Random OTP
  const regWithOtp = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'New Registered User',
      username: testUsername,
      email: testEmail,
      password: 'password123',
      role: 'FAMILY_MEMBER',
      code: randomOtp
    })
  });
  assert.equal(regWithOtp.response.status, 200);
  assert.equal(regWithOtp.body.user.username, testUsername);

  // 2d. Auth - Google OAuth Sign In / Sign Up
  const googleAuthRes = await request('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user.google@gmail.com', name: 'Google User Test', role: 'CAREGIVER' })
  });
  assert.equal(googleAuthRes.response.status, 200);
  assert.ok(googleAuthRes.body.session?.access_token);
  assert.equal(googleAuthRes.body.user.email, 'user.google@gmail.com');

  // 3. Auth - Login Admin via Username
  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'jordan_admin', password: '123456' })
  });
  assert.equal(adminLogin.response.status, 200);
  const adminToken = adminLogin.body.session.access_token;

  // 4. Auth - Me check
  const me = await request('/api/auth/me', {
    headers: { Authorization: `Bearer ${caregiverToken}` }
  });
  assert.equal(me.response.status, 200);
  assert.equal(me.body.user.email, 'ava@akirapa.com');

  // 5. Contact Search (Non-Admin user searching for family member)
  const searchResult = await request('/api/users/search?q=mina', {
    headers: { Authorization: `Bearer ${caregiverToken}` }
  });
  assert.equal(searchResult.response.status, 200);
  assert.ok(Array.isArray(searchResult.body.users));
  assert.ok(searchResult.body.users.length > 0);
  const familyUser = searchResult.body.users[0];

  // 6. Create / retrieve conversation
  const convResult = await request('/api/conversations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${caregiverToken}`
    },
    body: JSON.stringify({ participantId: familyUser.id })
  });
  assert.equal(convResult.response.status, 200);
  assert.ok(convResult.body.conversation?.id);
  const convId = convResult.body.conversation.id;

  // 7. Get conversations list
  const convsList = await request('/api/messages/conversations', {
    headers: { Authorization: `Bearer ${caregiverToken}` }
  });
  assert.equal(convsList.response.status, 200);
  assert.ok(Array.isArray(convsList.body.conversations));
  assert.ok(convsList.body.conversations.some((c) => c.id === convId));

  // 8. Send message
  const sendMsg = await request('/api/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${caregiverToken}`
    },
    body: JSON.stringify({
      conversationId: convId,
      text: 'Test integration message'
    })
  });
  assert.equal(sendMsg.response.status, 200);
  assert.ok(sendMsg.body.message?.id);
  const msgId = sendMsg.body.message.id;

  // 9. Fetch messages
  const msgs = await request(`/api/messages?conversationId=${convId}`, {
    headers: { Authorization: `Bearer ${caregiverToken}` }
  });
  assert.equal(msgs.response.status, 200);
  assert.ok(msgs.body.messages.some((m) => m.id === msgId));

  // 10. Mark message as read
  const readRes = await request('/api/messages/read', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${caregiverToken}`
    },
    body: JSON.stringify({ messageIds: [msgId], conversationId: convId })
  });
  assert.equal(readRes.response.status, 200);
  assert.equal(readRes.body.success, true);

  // 11. Admin users endpoint
  const adminUsers = await request('/api/admin/users', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(adminUsers.response.status, 200);
  assert.ok(Array.isArray(adminUsers.body.users));

  // 12. Admin audit logs endpoint
  const auditLogs = await request('/api/admin/audit-logs', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(auditLogs.response.status, 200);
  assert.ok(Array.isArray(auditLogs.body.logs));

  // 14. Login Family Member
  const familyLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'mina@akirapa.com', password: '123456' })
  });
  assert.equal(familyLogin.response.status, 200);
  const familyToken = familyLogin.body.session.access_token;

  // 15. Family Member searching contacts - Should ONLY return Caregiver (ava), NOT Admin (jordan)
  const familySearch = await request('/api/users/search?q=a', {
    headers: { Authorization: `Bearer ${familyToken}` }
  });
  assert.equal(familySearch.response.status, 200);
  assert.ok(familySearch.body.users.every((u) => u.role === 'CAREGIVER'));

  // 16. Family Member attempting to message Admin - Should return 403 Forbidden
  const familyToAdminConv = await request('/api/conversations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${familyToken}`
    },
    body: JSON.stringify({ participantId: 'user_3' }) // user_3 is Admin
  });
  assert.equal(familyToAdminConv.response.status, 403);
  assert.match(familyToAdminConv.body.error, /Family members can only message caregivers/i);

  // 17. Admin messaging Family Member - Should succeed (200)
  const adminToFamilyConv = await request('/api/conversations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({ participantId: 'user_2' }) // user_2 is Family Member
  });
  assert.equal(adminToFamilyConv.response.status, 200);
  const adminFamilyConvId = adminToFamilyConv.body.conversation.id;

  // 17b. Admin messaging another Admin (user_6 Stuart) - Should succeed (200)
  const adminToAdminConv = await request('/api/conversations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({ participantId: 'user_6' }) // user_6 is Admin Stuart
  });
  assert.equal(adminToAdminConv.response.status, 200);

  // 17c. Categorized Contacts API - Caregiver should see Admins & Family Members, but NO Caregivers
  const caregiverCat = await request('/api/users/categorized', {
    headers: { Authorization: `Bearer ${caregiverToken}` }
  });
  assert.equal(caregiverCat.response.status, 200);
  assert.equal(caregiverCat.body.groups.caregivers.length, 0);
  assert.ok(caregiverCat.body.groups.admins.length > 0);
  assert.ok(caregiverCat.body.groups.familyMembers.length > 0);

  // 17d. Caregiver attempting to message another Caregiver (user_4 Andrew) - Should return 403 Forbidden
  const caregiverToCaregiverConv = await request('/api/conversations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${caregiverToken}`
    },
    body: JSON.stringify({ participantId: 'user_4' }) // user_4 is Caregiver Andrew
  });
  assert.equal(caregiverToCaregiverConv.response.status, 403);

  // 18. Admin viewing Caregiver <-> Family Member conversation (conv_user_1_user_2) - Should succeed (200)
  const adminViewCaregiverFamilyMsgs = await request(`/api/messages?conversationId=conv_user_1_user_2`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(adminViewCaregiverFamilyMsgs.response.status, 200);

  // 19. Family Member attempting to view Admin <-> Caregiver conversation - Should return 403 Forbidden
  const adminCaregiverConv = await request('/api/conversations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({ participantId: 'user_1' }) // user_1 is Caregiver
  });
  assert.equal(adminCaregiverConv.response.status, 200);
  const adminCaregiverConvId = adminCaregiverConv.body.conversation.id;

  const familyViewAdminCaregiverMsgs = await request(`/api/messages?conversationId=${adminCaregiverConvId}`, {
    headers: { Authorization: `Bearer ${familyToken}` }
  });
  assert.equal(familyViewAdminCaregiverMsgs.response.status, 403);

  // 20. Caregiver attempting to view Admin <-> Family Member conversation - Should return 403 Forbidden
  const caregiverViewAdminFamilyMsgs = await request(`/api/messages?conversationId=${adminFamilyConvId}`, {
    headers: { Authorization: `Bearer ${caregiverToken}` }
  });
  assert.equal(caregiverViewAdminFamilyMsgs.response.status, 403);
});

