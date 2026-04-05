require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const { generalLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();

// ── Security ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-refresh-token'],
  credentials: true,
}));
app.use(generalLimiter);

// ── Parsing (must run before mongoSanitize so req.body exists) ─────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(mongoSanitize());

// ── Logging ────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
}

// ── Health check ───────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Middleware: attach io to req ───────────────────────────────────────────
app.use((req, res, next) => {
  req.io = req.app.get('io');
  next();
});

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth.routes'));
app.use('/api/societies',     require('./routes/society.routes'));
app.use('/api/users',         require('./routes/user.routes'));
app.use('/api/subscriptions', require('./routes/subscription.routes'));
app.use('/api/posts',         require('./routes/post.routes'));
app.use('/api/complaints',    require('./routes/complaint.routes'));
app.use('/api/announcements', require('./routes/announcement.routes'));
app.use('/api/groups',        require('./routes/group.routes'));
app.use('/api/chat',          require('./routes/chat.routes'));
app.use('/api/notifications', require('./routes/notification.routes'));
app.use('/api/upload',        require('./routes/upload.routes'));
app.use('/api/dashboard',     require('./routes/dashboard.routes'));

// ── Error handling ─────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
