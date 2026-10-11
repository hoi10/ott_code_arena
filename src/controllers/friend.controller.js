const friendService = require("../services/friend.service");
const {
  usernameSchema,
  searchSchema,
  responseSchema,
  presenceSchema,
  roomInvitationSchema,
} = require("../validators/friend.validator");

function idParam(req, key = "id") {
  const id = Number(req.params[key]);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error("FRIEND_ID_INVALID");
  }
  return id;
}

function handle(action) {
  return (req, res, next) => {
    Promise.resolve(action(req, res)).catch(next);
  };
}

const friendController = {
  search: handle(async (req, res) => {
    const { query } = searchSchema.parse(req.query);
    const users = await friendService.searchUsers(query, req.user.id);
    res.status(200).json({ success: true, data: { users } });
  }),

  list: handle(async (req, res) => {
    const [friends, requests] = await Promise.all([
      friendService.listFriends(req.user.id),
      friendService.listRequests(req.user.id),
    ]);
    res.status(200).json({ success: true, data: { friends, requests } });
  }),

  sendRequest: handle(async (req, res) => {
    const { username } = usernameSchema.parse(req.body);
    const result = await friendService.sendFriendRequest(req.user.id, username);
    res.status(201).json({ success: true, data: result });
  }),

  respondRequest: handle(async (req, res) => {
    const { accept } = responseSchema.parse(req.body);
    const result = await friendService.respondFriendRequest(
      idParam(req, "requestId"),
      req.user.id,
      accept
    );
    res.status(200).json({ success: true, data: result });
  }),

  remove: handle(async (req, res) => {
    const result = await friendService.removeFriend(
      req.user.id,
      idParam(req, "friendId")
    );
    res.status(200).json({ success: true, data: result });
  }),

  heartbeat: handle(async (req, res) => {
    const { sessionId } = presenceSchema.parse(req.body);
    await friendService.heartbeat(req.user.id, sessionId);
    res.status(204).end();
  }),

  notifications: handle(async (req, res) => {
    const notifications = await friendService.getNotifications(req.user.id);
    res.status(200).json({ success: true, data: notifications });
  }),

  challenge: handle(async (req, res) => {
    const result = await friendService.sendChallenge(
      req.user.id,
      idParam(req, "friendId")
    );
    res.status(201).json({ success: true, data: result });
  }),

  respondChallenge: handle(async (req, res) => {
    const { accept } = responseSchema.parse(req.body);
    const result = await friendService.respondChallenge(
      idParam(req, "invitationId"),
      req.user.id,
      accept
    );
    res.status(200).json({ success: true, data: result });
  }),

  consumeCompletedChallenge: handle(async (req, res) => {
    const result = await friendService.consumeCompletedChallenge(
      idParam(req, "invitationId"),
      req.user.id
    );
    res.status(200).json({ success: true, data: result });
  }),

  expireChallengeWithoutBot: handle(async (req, res) => {
    const result = await friendService.expireChallengeWithoutBot(
      req.user.id,
      idParam(req, "invitationId")
    );
    res.status(200).json({ success: true, data: result });
  }),

  inviteToRoom: handle(async (req, res) => {
    const { friendId } = roomInvitationSchema.parse(req.body);
    const result = await friendService.sendRoomInvitation(
      idParam(req, "roomId"),
      req.user.id,
      friendId
    );
    res.status(201).json({ success: true, data: result });
  }),

  respondRoomInvitation: handle(async (req, res) => {
    const { accept } = responseSchema.parse(req.body);
    const result = await friendService.respondRoomInvitation(
      idParam(req, "invitationId"),
      req.user.id,
      accept
    );
    res.status(200).json({ success: true, data: result });
  }),
};

module.exports = friendController;
