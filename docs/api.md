# API reference

All endpoints are mounted under `/api`. Authenticated endpoints require
`Authorization: Bearer <token>`; the token is returned by `POST /auth/login`.
JSON request bodies use `Content-Type: application/json`.

## Authentication

### `POST /auth/register`

Request:

```json
{
  "username": "player_1",
  "email": "player@example.com",
  "password": "at-least-8-characters"
}
```

Creates an account. Username must be 3–50 ASCII letters, digits, or underscores;
passwords must be 8–72 characters. The response never includes a password.

### `POST /auth/login`

Accepts `email` and `password`; returns the user and a bearer token.

## Account

### `GET /users/profile`

Returns the authenticated user's public profile (`id`, `username`, `email`,
`createdAt`, and `updatedAt`). Password hashes are excluded.

### `PATCH /users/profile`

Updates the username:

```json
{ "username": "new_name" }
```

### `GET /users/stats`

Returns `totalBots`, `totalSubmissions`, `totalMatches`, and `totalWins`.

### `PATCH /users/password`

Requires the current password and a different new password:

```json
{
  "currentPassword": "current-password",
  "newPassword": "new-password"
}
```

There is no email-verification flow or remote session revocation yet, so email
changes are disabled and password changes do not invalidate existing JWTs.

## Bots

- `GET /bots` lists the signed-in user's bots.
- `GET /bots/public` lists public opponent bots without source code.
- `GET /bots/:id` reads one bot owned by the signed-in user.
- `POST /bots` creates a bot from `name`, `sourceCode`, and optional
  `description`, `language`, and `isPublic`.
- `PATCH /bots/:id` updates an owned bot.
- `DELETE /bots/:id` deletes an owned bot unless it has participated in a match.
- `POST /bots/test` executes unsaved JavaScript, C++, or Python against a sample
  position and validates its returned move. JavaScript receives the `input`
  function argument; C++ and Python receive the same input as JSON on `stdin`
  and must print exactly one JSON action on `stdout`. Output is validated against
  Bot Arena Protocol v2 input before the game engine. Legacy bots can still use
  Protocol v1, which includes `legalMoves` for backwards compatibility.

## Matches

The game uses a 9×9 board. A piece moves one square in any of the eight
directions. Búa captures Kéo, Kéo captures Bao, and Bao captures Búa; pieces
of the same type block one another. A player wins by moving a piece onto the
opponent's home square or capturing every opposing piece. Capturing all pieces
of one type does not end the match.

- `GET /matches` lists matches involving the caller's bots.
- `POST /matches` creates a match from exactly two different bot IDs. One bot
  must belong to the caller; the opponent bot must be public and active.
- `GET /matches/:id` reads a match the caller participates in.
- `POST /matches/:id/run` runs and saves exactly one bot turn.
- `PATCH /matches/:id/bot` switches the caller's bot while the opponent's turn
  is current. The replacement bot is used on the caller's next turn.

## Phòng đấu

Các phòng cho phép người chơi chọn bot, sẵn sàng rồi để máy chủ tự chạy trận.
Người xem không cần đăng nhập nhưng phải nhập mật khẩu phòng. Máy chủ dùng mã
băm để xác thực mật khẩu; đồng thời mật khẩu gốc được giữ để hiển thị cho người
chơi và người xem đã được cấp quyền vào chi tiết phòng. Các API danh sách/tìm
kiếm phòng không trả mật khẩu. API không trả mã nguồn bot.

- `GET /rooms/public` liệt kê tối đa 100 phòng công khai chưa bị giải tán, gồm
  phòng đang chờ người chơi, đang thi đấu, tạm dừng và đã kết thúc.
- `GET /rooms/live` liệt kê tối đa 100 phòng công khai đang chờ, thi đấu hoặc
  tạm dừng; endpoint này không yêu cầu đăng nhập và được dùng ở trang chủ.
- `GET /rooms/search?name=...` tìm tối đa 20 phòng theo tên, gồm cả phòng công
  khai và riêng tư. Phòng riêng tư chỉ xuất hiện trong kết quả tìm kiếm, không
  xuất hiện trong danh sách công khai.
- `GET /rooms/:id` trả thông tin phòng cho người chơi trong phòng hoặc người có
  token xem hợp lệ trong header `X-Room-Viewer-Token`.
- `POST /rooms/:id/presence` nhận `{ "sessionId": "<UUID>" }` để gia hạn trạng
  thái hiện diện của người chơi hoặc người xem; người xem cần gửi thêm header
  `X-Room-Viewer-Token`.
- `POST /rooms/:id/viewer-session` nhận `{ "password": "..." }` và trả token
  xem có thời hạn 12 giờ.
- `POST /rooms` tạo phòng với `name`, `password` và `visibility` (`public` hoặc
  `private`). Chủ phòng được xếp vào vị trí người chơi đầu tiên. Mỗi tài khoản
  chỉ được có một ghế người chơi chưa rời phòng; cần rời phòng đó trước khi tạo
  phòng khác. Quy tắc được kiểm tra nguyên tử ở cơ sở dữ liệu khi tạo phòng.
  Nếu gửi `challengeInvitationId` đã được chấp nhận, người được mời sẽ được xếp
  vào ghế thứ hai cùng lúc mà không cần mật khẩu.
- `POST /rooms/:id/join` nhận mật khẩu để vào phòng đang chờ. Người chơi đã
  thuộc phòng có thể vào lại bằng tài khoản mà không cần nhập lại mật khẩu.
  Không thể tham gia phòng khác nếu tài khoản còn là người chơi trong một phòng;
  cần rời phòng hiện tại trước. Khán giả không bị giới hạn bởi quy tắc này.
- `PATCH /rooms/:id/ready` nhận `{ "botId": 12, "isReady": true }`; cả hai
  người chơi phải có bot đang hoạt động và sẵn sàng trước khi chủ phòng bắt đầu.
- `POST /rooms/:id/start` bắt đầu trận và kích hoạt bộ chạy lượt phía máy chủ.
- `POST /rooms/:id/pause` tạm dừng; mỗi người có tối đa 30 giây tạm dừng tích
  lũy riêng trong trận. Trận tự chạy tiếp khi hết phần thời gian còn lại.
- `POST /rooms/:id/resume` tiếp tục trận. Khi đang tạm dừng, người chơi có thể
  dùng `PATCH /rooms/:id/bot` với `{ "botId": 13 }` để đổi bot của mình từ lượt
  kế tiếp.
- `GET /rooms/mine` liệt kê phòng của tài khoản đã đăng nhập.
- `POST /rooms/:id/leave` cho phép người chơi rời phòng sau khi trận kết thúc;
  phòng được xóa khi cả hai người chơi đã rời.
- Trong sảnh chờ, người chơi không phải chủ phòng cũng có thể rời phòng; chủ
  phòng giải tán phòng thay vì rời riêng.
- `POST /rooms/:id/leave-viewer` cho phép người xem thoát phòng bằng
  `sessionId` và token xem.
- `POST /rooms/:id/rematch` gửi lời mời đấu tiếp và chấp thuận trước cho người
  gửi. Đối thủ phản hồi bằng `POST /rooms/:id/rematch/respond` với
  `{ "accept": true }` hoặc `{ "accept": false }`. Lời mời hết hạn sau 10 giây.
  Nếu đối thủ từ chối, họ rời phòng; nếu chấp nhận, cả hai trở lại sảnh chờ để
  chọn bot và sẵn sàng cho trận tiếp theo.
- `DELETE /rooms/:id` cho phép chủ phòng giải tán bất cứ lúc nào; trận đang chạy
  sẽ được đánh dấu dừng trước khi xóa phòng.

Đóng tab hoặc mất kết nối không xử thua, xóa ghế người chơi, xóa phòng hoặc làm
dừng bot. Người chơi cần chủ động rời phòng; chủ phòng có thể giải tán phòng.
Bộ lập lịch hiện chạy trong tiến trình máy chủ, vì vậy trước khi mở rộng nhiều
bản sao máy chủ cần bổ sung cơ chế điều phối/khóa dùng chung để tránh chạy trùng
lượt. Sau khi mỗi lượt hoàn tất, bộ lập lịch chờ ít nhất 5 giây mới chạy lượt
tiếp theo; thời gian thực thi bot được cộng thêm vào khoảng chờ.

## Bạn bè và lời mời

Các API sau yêu cầu đăng nhập:

- `GET /friends/search?query=...` tìm người dùng theo tên; kết quả chỉ gồm ID,
  tên và trạng thái trực tuyến.
- `GET /friends` trả danh sách bạn bè cùng lời mời kết bạn đến/đi.
- `POST /friends/requests` với `{ "username": "..." }` gửi lời mời kết bạn.
  Lời mời kết bạn không tự hết hạn.
- `POST /friends/requests/:requestId/respond` với `{ "accept": true }` hoặc
  `{ "accept": false }` phản hồi lời mời đến.
- `DELETE /friends/:friendId` xóa bạn.
- `POST /friends/presence` với `{ "sessionId": "<UUID>" }` gia hạn trạng thái
  trực tuyến; client duy trì heartbeat để bạn bè thấy online/offline.
- `GET /friends/notifications` trả lời mời kết bạn, lời mời đấu/phòng và các
  thách đấu đã được chấp nhận.
- `POST /friends/:friendId/challenges` gửi lời mời thi đấu tới bạn đang online.
  Người nhận phản hồi tại `POST /friends/invitations/:invitationId/respond`
  với `{ "accept": true|false }`. Lời mời hết hạn sau 10 giây; khi chấp nhận,
  người mời được đưa tới luồng tạo phòng và người nhận tự động vào phòng khi
  phòng được tạo.
- `POST /friends/rooms/:roomId/invitations` với `{ "friendId": 12 }` mời bạn
  đang online vào phòng chờ. Người nhận phản hồi tại
  `POST /friends/room-invitations/:invitationId/respond` với
  `{ "accept": true|false }`. Lời mời hết hạn sau 10 giây; chấp nhận sẽ thêm
  người nhận vào phòng mà không cần mật khẩu.

Áp dụng thay đổi dữ liệu bằng `npx prisma migrate deploy` trước khi chạy phiên
bản có bạn bè. Các phòng không bị tự xóa khi mất heartbeat.

## Test bot

- `GET /submissions?page=1&limit=20` lists the caller's paginated bot-test runs.
  Page starts at 1 and limit is 1–100.
- `GET /submissions/:id` reads a submission owned by the caller.
- `POST /submissions` executes a saved bot or source code against one freshly
  generated sample position:

```json
{ "botId": 12 }
```

or

```json
{ "sourceCode": "const p = input.pieces.own[0]; return p ? { pieceId: p.id, to: { x: p.x + 1, y: p.y } } : null;", "language": "javascript", "protocolVersion": 2 }
```

For C++ and Python, `sourceCode` is a complete program. Diagnostics must go to
`stderr`, not `stdout`. Supported values are `javascript`, `cpp`, and `python`.
Execution is performed by local runtime/compiler adapters in an OS sandbox; no
Judge0, Piston, or other remote code-execution service is used. If a supported
sandbox is unavailable, the request fails safely instead of running source code
directly in the API process or host.

When both `botId` and `sourceCode` are supplied, the supplied code is checked
and associated with that owned bot. The result is saved as `accepted` for a
legal move, `rejected` for an invalid move, or `failed` for a runtime error.
This is a one-turn bot test, not a tournament or ranked match.

## Giải đấu (Tournament Mode — Round Robin)

Giải đấu theo thể thức vòng tròn: mỗi cặp bot gặp nhau đúng hai lượt, lượt
thứ hai đổi bên đi trước. Tất cả API dưới đây yêu cầu đăng nhập
(`Authorization: Bearer <token>`).

- `POST /tournaments` tạo giải từ `{ "name": "...", "description": "..." }`
  (description không bắt buộc). Người tạo là chủ giải. Giải khởi tạo ở trạng
  thái `draft`.
- `GET /tournaments?status=&page=&limit=` liệt kê giải đấu, có thể lọc theo
  trạng thái (`draft`, `ready`, `running`, `completed`, `cancelled`).
- `GET /tournaments/:id` xem chi tiết: người tham gia, lịch theo vòng, kết quả
  từng lượt và bảng xếp hạng. Phản hồi không bao giờ chứa mã nguồn bot.
- `PATCH /tournaments/:id` cập nhật `name`/`description` — chỉ chủ giải và chỉ
  khi còn ở trạng thái `draft`.

### Đăng ký người tham gia

Mỗi người chơi tự đăng ký bằng một bot thuộc quyền sở hữu của mình (đúng mô
hình phân quyền hiện tại: chỉ dùng được bot của chính mình). Vì vậy chủ giải
không thể chọn bot thuộc tài khoản khác.

- `POST /tournaments/:id/participants` với `{ "botId": 12 }` đăng ký bot của
  người đang gọi. Mỗi người và mỗi bot chỉ xuất hiện một lần trong giải. Chỉ
  thêm được khi giải ở trạng thái `draft`.
- `DELETE /tournaments/:id/participants` với `{ "entryId": 3 }` xóa một người
  tham gia — chỉ chủ giải và chỉ khi còn ở trạng thái `draft`.

### Vòng đời giải

- `POST /tournaments/:id/lock` chốt danh sách: kiểm tra ít nhất 3 người tham
  gia hợp lệ, đóng băng snapshot mã nguồn/ngôn ngữ cho từng bot và tạo toàn bộ
  lịch Round Robin. `draft → ready`. Không thể chốt hai lần.
- `POST /tournaments/:id/start` bắt đầu chạy giải: `ready → running`. Máy chủ
  tự chạy từng vòng, mỗi vòng phải hoàn tất trước khi sang vòng tiếp theo.
- `POST /tournaments/:id/cancel` hủy giải — chỉ chủ giải và chỉ khi còn `draft`
  hoặc `ready`.
- `POST /tournaments/:id/retry-failed` đưa các trận bị lỗi hạ tầng (đã hết số
  lần thử tự động) trở lại hàng chờ để chạy lại — chỉ chủ giải.

Mọi quyền chủ giải đều được kiểm thử ở backend. Client không thể tự quyết định
kết quả, điểm số hay trạng thái hoàn tất của trận.

### Tính điểm và xếp hạng

- Thắng một lượt: 3 điểm. Hòa: 1 điểm mỗi bot. Thua: 0 điểm.
- Điểm tổng = tổng điểm các lượt hợp lệ. Bảng xếp hạng sắp theo: tổng điểm
  giảm dần, sau đó tới thành tích đối đầu trong nhóm bằng điểm, rồi hiệu số
  (thắng − thua), cuối cùng là seed để luôn xác định.
- Hòa được engine hỗ trợ (đạt giới hạn 1.000 lượt). Điểm được tính lại từ các
  lượt đã hoàn tất nên không bao giờ bị cộng hai lần.

## Common errors

Validation errors return HTTP 400 with field-level details. Missing or expired
tokens return 401. Ownership violations return 403 or 404 to avoid exposing
other users' private resources. Known conflicts, such as duplicate usernames
or bot switches during the wrong turn, return 409.
