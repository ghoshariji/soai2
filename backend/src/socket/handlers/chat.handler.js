const Message = require('../../models/Message');
const User = require('../../models/User');
const logger = require('../../utils/logger');

const handleSendMessage = async (socket, io, data) => {
  try {
    const { type, content, receiverId, groupId, mediaUrl, mediaType, replyTo } = data;
    const { id: senderId, societyId } = socket.data.user;

    if (!content && !mediaUrl) return;
    if (type === 'personal' && !receiverId) return;
    if (type === 'group' && !groupId) return;

    const message = await Message.create({
      societyId,
      type,
      senderId,
      receiverId: type === 'personal' ? receiverId : null,
      groupId: type === 'group' ? groupId : null,
      content: content || '',
      mediaUrl: mediaUrl || '',
      mediaType: mediaType || 'none',
      replyTo: replyTo || null,
    });

    await message.populate('senderId', 'name profilePhoto flatNumber');

    if (type === 'personal') {
      io.to(`user_${receiverId}`).to(`user_${senderId}`).emit('receive_message', message);
    } else if (type === 'group') {
      io.to(`group_${groupId}`).emit('receive_message', message);
    }
  } catch (err) {
    logger.error(`handleSendMessage error: ${err.message}`);
    socket.emit('message_error', { message: 'Failed to send message' });
  }
};

const handleTyping = (socket, io, data) => {
  const { roomId, typing } = data;
  if (!roomId) return;
  socket.to(roomId).emit('typing', {
    userId: socket.data.user.id,
    name: socket.data.user.name,
    roomId,
    typing: Boolean(typing),
  });
};

const handleStopTyping = (socket, io, data) => {
  const { roomId } = data;
  if (!roomId) return;
  socket.to(roomId).emit('typing', {
    userId: socket.data.user.id,
    name: socket.data.user.name,
    roomId,
    typing: false,
  });
};

const handleReadReceipt = async (socket, io, data) => {
  try {
    const { messageId } = data;
    const userId = socket.data.user.id;
    await Message.updateOne(
      { _id: messageId, 'readBy.userId': { $ne: userId } },
      { $push: { readBy: { userId, readAt: new Date() } } }
    );
    const msg = await Message.findById(messageId).select('senderId receiverId groupId readBy');
    if (!msg) return;
    const targetRoom = msg.groupId ? `group_${msg.groupId}` : `user_${msg.senderId}`;
    io.to(targetRoom).emit('message_read', { messageId, readBy: msg.readBy });
  } catch (err) {
    logger.error(`handleReadReceipt error: ${err.message}`);
  }
};

const handleUserOnline = async (socket, io) => {
  try {
    await User.updateOne({ _id: socket.data.user.id }, { isOnline: true });
  } catch (err) {
    logger.error(`handleUserOnline error: ${err.message}`);
  }
};

const handleUserOffline = async (socket, io) => {
  try {
    await User.updateOne(
      { _id: socket.data.user.id },
      { isOnline: false, lastSeen: new Date() }
    );
  } catch (err) {
    logger.error(`handleUserOffline error: ${err.message}`);
  }
};

module.exports = {
  handleSendMessage,
  handleTyping,
  handleStopTyping,
  handleReadReceipt,
  handleUserOnline,
  handleUserOffline,
};
