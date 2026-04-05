const express = require('express');
const router = express.Router();
const {
  getConversations,
  getChatDirectory,
  getPersonalMessages,
  sendPersonalMessage,
  getGroupMessages,
  sendGroupMessage,
  deleteMessage,
} = require('../controllers/chat.controller');
const { authenticate } = require('../middleware/auth');
const { checkTenant } = require('../middleware/tenant');

router.use(authenticate, checkTenant);

router.get('/conversations', getConversations);
router.get('/directory', getChatDirectory);
router.get('/personal/:userId', getPersonalMessages);
router.post('/personal/:userId', sendPersonalMessage);
router.get('/group/:groupId', getGroupMessages);
router.post('/group/:groupId', sendGroupMessage);
router.delete('/messages/:messageId', deleteMessage);

module.exports = router;
