# Tournament Mode (Round Robin)

Tài liệu mô tả chế độ Giải đấu theo thể thức vòng tròn (Round Robin), tích hợp
trên cùng game engine, bot runner và cơ chế xác thực hiện có của OTT Code Arena.
Không có dịch vụ thực thi code bên thứ ba nào được thêm vào.

## Tổng quan luồng sử dụng

1. Người dùng đã đăng nhập tạo giải đấu (`draft`). Người tạo là chủ giải.
2. Mỗi người chơi tự đăng ký bằng một bot thuộc quyền sở hữu của mình.
3. Chủ giải chốt danh sách (`draft → ready`): kiểm tra tối thiểu 3 người tham
   gia hợp lệ, đóng băng snapshot mã nguồn/ngôn ngữ cho từng bot, và tạo toàn bộ
   lịch Round Robin.
4. Chủ giải bắt đầu giải (`ready → running`). Máy chủ tự chạy từng vòng.
5. Khi mọi trận của mọi vòng đã kết thúc hợp lệ, giải chuyển sang `completed`
   và bảng xếp hạng được tính từ kết quả đã lưu.

## Trạng thái

- `draft`: đang cấu hình, thêm/xóa người tham gia, sửa thông tin.
- `ready`: đã chốt danh sách và tạo lịch, chờ bắt đầu.
- `running`: đang thi đấu theo từng vòng.
- `completed`: toàn bộ lịch đã hoàn tất hợp lệ.
- `cancelled`: bị hủy bởi chủ giải (chỉ từ `draft` hoặc `ready`).

Các chuyển trạng thái đều được bảo vệ bằng guard ở backend (dùng
`updateMany({ where: { status } })`) nên không thể chốt hai lần, không thể sửa
danh sách sau khi chốt, và không thể bắt đầu khi chưa đủ 3 người.

## Thể thức Round Robin và đổi bên

- Với `n` người tham gia: số cặp = `n × (n − 1) / 2`, tổng số lượt (ván) =
  `n × (n − 1)`. Ví dụ 3 bot → 3 cặp, 6 ván; 4 bot → 6 cặp, 12 ván.
- Thuật toán là phương pháp vòng tròn (circle method), tất định và kiểm thử được:
  - `n` chẵn → `n − 1` vòng, mỗi vòng `n/2` cặp.
  - `n` lẻ → `n` vòng, mỗi vòng `(n − 1)/2` cặp (một người nghỉ mỗi vòng).
  - Trong một vòng không người nào xuất hiện hai lần.
- Mỗi cặp thi đấu đúng hai lượt: lượt 1 bên A đi trước, lượt 2 bên B đi trước.
  Việc "đi trước" được thể hiện qua vị trí `firstEntry`/`secondEntry` của lượt,
  tương ứng với hai góc nhà `a9` và `i1` mà game engine gán cho participant[0]
  và participant[1]. Engine tự random người đi đầu tiên nên hai bên công bằng.

## Tính điểm và xếp hạng

- Thắng một lượt: 3 điểm. Hòa: 1 điểm mỗi bot. Thua: 0 điểm.
- Hòa là trạng thái hợp lệ của engine (đạt giới hạn 1.000 lượt, `winnerId` rỗng).
- Bảng xếp hạng sắp theo: (1) tổng điểm giảm dần, (2) thành tích đối đầu trong
  nhóm bằng điểm, (3) hiệu số thắng − thua, (4) seed. Quy tắc cố định từ trước,
  không đổi sau khi giải bắt đầu.
- Điểm được **tính lại** từ các lượt `completed` mỗi lần xem, nên không bao giờ
  bị cộng hai lần dù worker/request chạy lại.

## Xử lý lỗi

Game engine đã hấp thụ mọi lỗi phía bot (nước đi sai, timeout, crash, sai giao
thức) thành một lượt đi không hợp lệ — ván đấu vẫn kết thúc bình thường. Vì vậy
lỗi thoát khỏi `runGame` là lỗi hạ tầng/cấu hình (spawn lỗi, worker chết, state
hỏng...):

- Phân loại trong `src/services/tournament-error.js`.
- Lỗi hạ tầng được thử lại tối đa `TOURNAMENT_MAX_GAME_ATTEMPTS` (mặc định 3),
  mỗi lần cách `TOURNAMENT_RETRY_DELAY_MS` (mặc định 4000ms).
- Hết số lần thử → trận chuyển sang trạng thái `failed` quan sát được, **không**
  bị tính là thắng hay thua. Vòng vẫn hoàn tất khi mọi trận đã kết thúc (xong
  hoặc failed), nhưng giải không tự phát minh kết quả.
- Lỗi không phân loại được được đánh dấu `failed` chứ không kết luận ai thua.
- Chủ giải có thể gọi `retry-failed` để đưa các trận `failed` về hàng chờ.

## Nhất quán khi chạy trận

- Mỗi ván có định danh ổn định (`matchId + legNumber`, duy nhất).
- Chạy trận qua `claimGame` (optimistic `updateMany` chỉ nhận `pending`) nên hai
  worker không thể cùng chạy một trận.
- Kết quả chỉ ghi một lần qua `completeGame` (chỉ nhận `running`); chạy lại
  request/worker không cộng điểm lần nữa.

## Phục hồi sau khởi động lại

- Lịch và snapshot nằm trong database; trận đã `completed` được giữ nguyên.
- Khi server khởi động lại, `tournament-scheduler.resumeActiveTournaments()` đưa
  các trận còn `running` (chưa có kết quả nào được ghi) về `pending` để chạy lại,
  rồi tiếp tục các giải đang `running`. Không tạo lại lịch.

## Mô hình dữ liệu

Các model mới trong `prisma/schema.prisma`:

- `Tournament`: thông tin giải, `hostUserId`, `status`, `format`, timestamps.
- `TournamentEntry`: người tham gia (`userId`, `botId`) cùng **snapshot bất biến**
  (`snapshotSourceCode`, `snapshotLanguage`, `snapshotProtocolVersion`). Ràng
  buộc duy nhất `(tournamentId, userId)` và `(tournamentId, botId)`.
- `TournamentRound`: số vòng và trạng thái; duy nhất `(tournamentId, roundNumber)`.
- `TournamentMatch`: một cặp (`entryAId`, `entryBId`) thuộc một vòng; duy nhất
  `(tournamentId, entryAId, entryBId)` với thứ tự đã chuẩn hóa.
- `TournamentGame`: một lượt đấu của cặp, có `legNumber`, `firstEntryId`,
  `secondEntryId`, `winnerEntryId`, `isDraw`, `attempts`, thông tin lỗi; duy nhất
  `(matchId, legNumber)`.

Migration: `prisma/migrations/20261014100000_tournament_mode/migration.sql`.
Trong môi trường phát triển chạy `npx prisma migrate deploy`.

## Chạy giải nền

`src/services/tournament-scheduler.js` là bộ điều phối chạy trong tiến trình
(mirror `room-scheduler.js`): nó lấy trận `pending` tiếp theo của vòng hiện tại,
chạy đến khi vòng hiện tại kết thúc hợp lệ rồi mới sang vòng sau. Nó dựa trên
cùng bot runner/sandbox hiện có. **Giới hạn:** scheduler lưu trạng thái trong
từng tiến trình như room scheduler; nếu chạy nhiều bản sao server song song cần
bổ sung khóa dùng chung. Free tier của Render có thể tạm dừng tiến trình; các
trận chưa xong sẽ được tiếp tục sau khi có request đánh thức dịch vụ.

## Frontend

- `/tournaments.html` — danh sách + tạo giải, lọc theo trạng thái.
- `/tournament-detail.html?id=...` — thông tin, người tham gia, lịch theo vòng,
  kết quả hai lượt đổi bên và bảng xếp hạng; các thao tác chủ giải gắn theo
  trạng thái và hiện xác nhận trước hành động quan trọng.
- Dùng lại design system (`style.css`, `dashboard.css`) và layout
  `dashboard-page` + `topbar` + `page-content`. Style riêng trong
  `public/css/tournaments.css`, tái sử dụng token màu/border/radius/button.
- Trang tự động polling (8s ở danh sách, 4s ở chi tiết) để cập nhật tiến độ mà
  không cần WebSocket.

## Kiểm thử

- `npm test` chạy toàn bộ, gồm các test mới:
  - `tests/tournament-round-robin.test.js` — cấu trúc lịch (3/4 bot, chẵn/lẻ,
    không trùng cặp/ván, mỗi vòng mỗi người một lần).
  - `tests/tournament-scoring.test.js` — tính điểm, xếp hạng, không nhân đôi điểm.
  - `tests/tournament.test.js` — quyền chủ giải, vòng đời, chốt danh sách, ẩn
    mã nguồn snapshot.
  - `tests/tournament-scheduler.test.js` — chạy tuần tự theo vòng, retry lỗi hạ
    tầng, trận lỗi cuối cùng không thành thắng/thua, không chạy trùng.
- Kiểm thử end-to-end trên DB phát triển:
  `node scripts/smoke-tournament.js` (tạo dữ liệu tạm, chạy thật 6 ván, dọn dẹp).

