# Auth-Gated App Testing Playbook (PUA — Emergent-managed Google sign-in)

Mongo DB name: `app` (backend/.env DB_NAME). Any Google account may sign in; each user has
a private planner (all planner docs carry ownerId = user_id). Users need `onboarded: true`
(or call POST /api/auth/onboard {"sample": true|false}) before the app shows the planner.

## Step 1: Create Test User & Session
mongosh --eval "
use('app');
var userId = 'test-user-' + Date.now();
var email = 'test.user.' + Date.now() + '@example.com';
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({ user_id: userId, email: email, name: 'Test User', picture: '', created_at: new Date(),
  onboarded: false, friendCode: 'TEST' + Date.now().toString().slice(-4), shareCategories: [] });
db.user_sessions.insertOne({ user_id: userId, session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000), created_at: new Date() });
print('Session token: ' + sessionToken); print('Email: ' + email);
"

## Step 2: Test Backend API
curl "$URL/api/auth/me" -H "Authorization: Bearer $TOKEN"        # 200 user
curl "$URL/api/habits"  -H "Authorization: Bearer $TOKEN"        # 200
curl "$URL/api/habits"                                            # 401 (no session)
curl -X POST "$URL/api/cron/routines" -H "Authorization: Bearer wrong"   # 401 from its own WEBHOOK_CRON_SECRET check, not the session gate

## Step 3: Browser Testing
await page.context().addCookies([{ name: "session_token", value: TOKEN,
  domain: "<preview host>", path: "/", httpOnly: true, secure: true, sameSite: "None" }]);
await page.goto("/");   // app loads, not the sign-in page

## Clean test data
mongosh --eval "
use('app');
db.users.deleteMany({email: /test\.user\./});
db.user_sessions.deleteMany({session_token: /test_session/});
// also delete planner docs with ownerId of test users, and db.shares links
"

## Checklist
- users have custom user_id; sessions.user_id matches; all queries project {_id: 0}
- /api/auth/me returns user; signed-out requests to any other /api route → 401
- callback detection uses useLocation().hash
