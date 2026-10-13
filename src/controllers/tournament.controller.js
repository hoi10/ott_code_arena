const tournamentService = require("../services/tournament.service");
const {
  createTournamentSchema,
  updateTournamentSchema,
  listTournamentsSchema,
  addParticipantSchema,
  participantIdSchema,
} = require("../validators/tournament.validator");

function tournamentId(req) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error("TOURNAMENT_ID_INVALID");
  }
  return id;
}

function handle(action) {
  return (req, res, next) => {
    Promise.resolve(action(req, res)).catch(next);
  };
}

const tournamentController = {
  list: handle(async (req, res) => {
    const query = listTournamentsSchema.parse(req.query);
    const result = await tournamentService.listTournaments(query, req.user.id);
    res.status(200).json({ success: true, data: result });
  }),

  get: handle(async (req, res) => {
    const tournament = await tournamentService.getTournament(
      tournamentId(req),
      req.user.id
    );
    res.status(200).json({ success: true, data: { tournament } });
  }),

  create: handle(async (req, res) => {
    const data = createTournamentSchema.parse(req.body);
    const tournament = await tournamentService.createTournament(
      req.user.id,
      data
    );
    res.status(201).json({
      success: true,
      message: "Đã tạo giải đấu thành công.",
      data: { tournament },
    });
  }),

  update: handle(async (req, res) => {
    const data = updateTournamentSchema.parse(req.body);
    const tournament = await tournamentService.updateTournament(
      tournamentId(req),
      req.user.id,
      data
    );
    res.status(200).json({
      success: true,
      message: "Đã cập nhật thông tin giải đấu.",
      data: { tournament },
    });
  }),

  addParticipant: handle(async (req, res) => {
    const { botId } = addParticipantSchema.parse(req.body);
    const tournament = await tournamentService.addParticipant(
      tournamentId(req),
      req.user.id,
      botId
    );
    res.status(200).json({
      success: true,
      message: "Đã thêm người tham gia.",
      data: { tournament },
    });
  }),

  removeParticipant: handle(async (req, res) => {
    const { entryId } = participantIdSchema.parse({
      params: req.params,
      body: req.body,
    }).body;
    const tournament = await tournamentService.removeParticipant(
      tournamentId(req),
      req.user.id,
      entryId
    );
    res.status(200).json({
      success: true,
      message: "Đã xóa người tham gia.",
      data: { tournament },
    });
  }),

  lock: handle(async (req, res) => {
    const tournament = await tournamentService.lockRoster(
      tournamentId(req),
      req.user.id
    );
    res.status(200).json({
      success: true,
      message: "Đã chốt danh sách và tạo lịch thi đấu.",
      data: { tournament },
    });
  }),

  start: handle(async (req, res) => {
    const tournament = await tournamentService.startTournament(
      tournamentId(req),
      req.user.id
    );
    res.status(200).json({
      success: true,
      message: "Giải đấu đã bắt đầu.",
      data: { tournament },
    });
  }),

  cancel: handle(async (req, res) => {
    const tournament = await tournamentService.cancelTournament(
      tournamentId(req),
      req.user.id
    );
    res.status(200).json({
      success: true,
      message: "Đã hủy giải đấu.",
      data: { tournament },
    });
  }),

  retryFailed: handle(async (req, res) => {
    const tournament = await tournamentService.retryFailedGames(
      tournamentId(req),
      req.user.id
    );
    res.status(200).json({
      success: true,
      message: "Đã đưa các trận lỗi vào hàng chờ chạy lại.",
      data: { tournament },
    });
  }),
};

module.exports = tournamentController;
