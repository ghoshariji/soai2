# SocietyWale – Deployment Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                 SocietyWale SaaS Platform              │
├──────────────────┬──────────────────────────────────┤
│  React Native    │          Node.js Backend           │
│  Mobile App      │  Express + Socket.IO + MongoDB    │
│  (iOS/Android)   │  Cloudinary | Nodemailer          │
└──────────────────┴──────────────────────────────────┘
```

---

## Prerequisites

- Node.js >= 18.x
- MongoDB 6.x (local or Atlas)
- Cloudinary account
- SendGrid / SMTP credentials
- React Native development environment (Android Studio / Xcode)

---

## Backend Setup

### 1. Install dependencies
```bash
cd backend
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Required .env values
```env
NODE_ENV=production
PORT=5000
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/societywale_db
JWT_ACCESS_SECRET=<random 64+ char string>
JWT_REFRESH_SECRET=<random 64+ char string>
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_key
CLOUDINARY_API_SECRET=your_secret
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASS=SG.your_sendgrid_key
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=SocietyWale
SUPER_ADMIN_EMAIL=admin@yourdomain.com
SUPER_ADMIN_PASSWORD=StrongPassword@123
SUPER_ADMIN_NAME=Super Admin
```

### 4. Seed the database
```bash
npm run seed        # Create super admin + sample society
npm run seed:destroy  # Clear all data (CAUTION)
```

### 5. Start development server
```bash
npm run dev
```

### 6. Start production server
```bash
npm start
```

---

## Backend Deployment (Railway / Render / EC2)

### Railway (Recommended)
```bash
# Install Railway CLI
npm install -g @railway/cli
railway login
railway init
railway up
```

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN mkdir -p logs
EXPOSE 5000
CMD ["node", "server.js"]
```

```bash
docker build -t societywale-backend .
docker run -p 5000:5000 --env-file .env societywale-backend
```

### PM2 (Process Manager)
```bash
npm install -g pm2
pm2 start server.js --name societywale-backend
pm2 save
pm2 startup
```

---

## Mobile App Setup

### 1. Install dependencies
```bash
cd mobile
npm install
```

### 2. Configure API URL
Edit `src/services/api.ts`:
```typescript
const BASE_URL = __DEV__
  ? 'http://10.0.2.2:5000/api'   // Android emulator → localhost
  : 'https://your-api.railway.app/api';  // Production
```

### 3. iOS Setup
```bash
cd ios && pod install && cd ..
npx react-native run-ios
```

### 4. Android Setup
```bash
npx react-native run-android
```

### 5. Build for production
```bash
# Android APK
cd android && ./gradlew assembleRelease

# Android AAB (Play Store)
cd android && ./gradlew bundleRelease
```

---

## API Endpoints Summary

| Module        | Base Route             | Methods                    |
|---------------|------------------------|----------------------------|
| Auth          | /api/auth              | POST login, refresh, logout|
| Societies     | /api/societies         | CRUD (super_admin)         |
| Users         | /api/users             | CRUD (society_admin)       |
| Subscriptions | /api/subscriptions     | GET, PUT (super_admin)     |
| Posts         | /api/posts             | CRUD + like + comments     |
| Announcements | /api/announcements     | CRUD (admin) + read        |
| Complaints    | /api/complaints        | CRUD + status update       |
| Groups        | /api/groups            | CRUD + members             |
| Chat          | /api/chat              | Messages + conversations   |
| Notifications | /api/notifications     | GET + mark read            |
| Upload        | /api/upload/excel      | POST (bulk users)          |
| Dashboard     | /api/dashboard         | Super admin + society admin|

---

## Socket.IO Events

### Client → Server
| Event        | Payload                                    |
|--------------|--------------------------------------------|
| send_message | { type, content, receiverId?, groupId? }   |
| join_group   | { groupId }                                |
| leave_group  | { groupId }                                |
| typing       | { roomId }                                 |
| stop_typing  | { roomId }                                 |
| mark_read    | { messageId }                              |

### Server → Client
| Event           | Payload                              |
|-----------------|--------------------------------------|
| receive_message | Message object                       |
| typing          | { userId, name, roomId, typing }     |
| message_read    | { messageId, readBy[] }              |
| user_online     | { userId }                           |
| user_offline    | { userId, lastSeen }                 |
| new_announcement| { announcement, message }            |

---

## Multi-Tenant Security Model

1. **JWT middleware** → extracts `userId` + `role` from token
2. **Tenant middleware** → validates `societyId` exists, is active, subscription not expired
3. **All queries** scoped by `societyId` → complete data isolation
4. **Super admin** → bypasses tenant checks, has global access
5. **Soft deletes** → `isDeleted: true` flag, never hard-deleted

---

## Default Credentials (after seeding)

All seeded demo accounts (except super admin when `SUPER_ADMIN_PASSWORD` is set in `.env`) share **`SEED_USER_PASSWORD`**, default **`SamplePass12`** (12 characters).

| Role          | Email                       | Notes                          |
|---------------|-----------------------------|--------------------------------|
| Super Admin   | superadmin@societywale.com  | Same as others unless `SUPER_ADMIN_PASSWORD` is set |
| Society Admin | admin@greenvalley.com       | Green Valley Society           |
| Residents     | rahul@greenvalley.com, priya@…, etc. | Eight sample flats; see `backend/seeder.js` |

Run `npm run seed` again to create missing residents and **reset all seed account passwords** to the current `SEED_USER_PASSWORD`.

> ⚠️ Change all passwords immediately in production!
