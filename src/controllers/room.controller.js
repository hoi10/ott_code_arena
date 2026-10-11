const roomService = require("../services/room.service");
const {
  createRoomSchema,
  joinRoomSchema,
  readyRoomSchema,
  changeRoomBotSchema,
  viewerSessionSchema,
  roomSearchSchema,
  roomPresenceSchema,
  rematchResponseSchema,
} = require("../validators/room.validator");

function roomId(req) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error("ROOM_ID_INVALID");
  }
  return id;
}

function handle(action) {
  return (req, res, next) => {
    Promise.resolve(action(req, res)).catch(next);
  };
}

const roomController = {
  listPublic: handle(async (req, res) => {
    const rooms = await roomService.listPublicRooms();
    res.status(200).json({ success: true, data: { rooms } });
  }),

  listLivePublic: handle(async (req, res) => {
    const rooms = await roomService.listLivePublicRooms();
    res.status(200).json({ success: true, data: { rooms } });
  }),

  search: handle(async (req, res) => {
    const { name } = roomSearchSchema.parse(req.query);
    const rooms = await roomService.searchRooms(name);
    res.status(200).json({ success: true, data: { rooms } });
  }),

  listMine: handle(async (req, res) => {
    const rooms = await roomService.listUserRooms(req.user.id);
    res.status(200).json({ success: true, data: { rooms } });
  }),

  create: handle(async (req, res) => {
    const data = createRoomSchema.parse(req.body);
    const room = await roomService.createRoom(req.user.id, data);
    res.status(201).json({ success: true, data: { room } });
  }),

  join: handle(async (req, res) => {
    const { password } = joinRoomSchema.parse(req.body);
    const room = await roomService.joinRoom(
      roomId(req),
      req.user.id,
      password
    );
    res.status(200).json({ success: true, data: { room } });
  }),

  createViewerSession: handle(async (req, res) => {
    const { password } = viewerSessionSchema.parse(req.body);
    const session = await roomService.createViewerSession(
      roomId(req),
      password
    );
    res.status(200).json({ success: true, data: session });
  }),

  get: handle(async (req, res) => {
    const room = await roomService.getRoom(
      roomId(req),
      req.user?.id,
      req.get("x-room-viewer-token")
    );
    res.status(200).json({ success: true, data: { room } });
  }),

  heartbeat: handle(async (req, res) => {
    const { sessionId } = roomPresenceSchema.parse(req.body);
    await roomService.touchPresence(
      roomId(req),
      req.user?.id,
      req.get("x-room-viewer-token"),
      sessionId
    );
    res.status(204).end();
  }),

  leaveViewer: handle(async (req, res) => {
    const { sessionId } = roomPresenceSchema.parse(req.body);
    await roomService.leaveViewer(
      roomId(req),
      req.get("x-room-viewer-token"),
      sessionId
    );
    res.status(204).end();
  }),

  setReady: handle(async (req, res) => {
    const data = readyRoomSchema.parse(req.body);
    const room = await roomService.setReady(roomId(req), req.user.id, data);
    res.status(200).json({ success: true, data: { room } });
  }),

  start: handle(async (req, res) => {
    const room = await roomService.startRoom(roomId(req), req.user.id);
    res.status(200).json({ success: true, data: { room } });
  }),

  pause: handle(async (req, res) => {
    const room = await roomService.pauseRoom(roomId(req), req.user.id);
    res.status(200).json({ success: true, data: { room } });
  }),

  resume: handle(async (req, res) => {
    const room = await roomService.resumeRoom(roomId(req), req.user.id);
    res.status(200).json({ success: true, data: { room } });
  }),

  changeBot: handle(async (req, res) => {
    const { botId } = changeRoomBotSchema.parse(req.body);
    const room = await roomService.changeBot(roomId(req), req.user.id, botId);
    res.status(200).json({ success: true, data: { room } });
  }),

  leave: handle(async (req, res) => {
    const result = await roomService.leaveRoom(roomId(req), req.user.id);
    res.status(200).json({ success: true, data: result });
  }),

  dissolve: handle(async (req, res) => {
    const result = await roomService.dissolveRoom(roomId(req), req.user.id);
    res.status(200).json({ success: true, data: result });
  }),

  requestRematch: handle(async (req, res) => {
    const room = await roomService.requestRematch(roomId(req), req.user.id);
    res.status(200).json({ success: true, data: { room } });
  }),

  respondRematch: handle(async (req, res) => {
    const { accept } = rematchResponseSchema.parse(req.body);
    const result = await roomService.respondRematch(
      roomId(req),
      req.user.id,
      accept
    );
    res.status(200).json({ success: true, data: result });
  }),
};

module.exports = roomController;
