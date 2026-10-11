# OTT Code Arena

OTT Code Arena lets players write JavaScript bots that choose moves in a
Kéo-Búa-Bao board match.

## Run locally

1. Copy `.env.example` to `.env` and set `DATABASE_URL` and a `JWT_SECRET` of
   at least 32 characters.
2. Apply database migrations with `npx prisma migrate deploy`.
3. Start the app with `npm start`.
4. Run automated tests with `npm test`.

## Deploy publicly with Render and Railway

The repository includes a Render Blueprint in `render.yaml`. It runs this
Express application as a single web service, serves both the frontend and API,
applies Prisma migrations on startup, and checks `/api/health`.

1. Push this repository to a Git provider and create a Railway MySQL service.
2. In Railway, enable public TCP access for MySQL and copy its public host,
   port, database name, username, and password. Do not use Railway's private
   hostname from Render.
3. In Render, create a new Blueprint from the repository. Set `DATABASE_URL`
   to `mysql://USER:PASSWORD@HOST:PORT/DATABASE` using Railway's public TCP
   connection details. URL-encode special characters in the username or
   password. Render generates `JWT_SECRET` for the service.
4. Deploy and wait for `/api/health` to report healthy. Render runs
   `prisma migrate deploy` before starting the app; keep the `prisma/migrations`
   directory in Git.

The Blueprint uses Render's free web-service plan. Free instances can spin down
when idle, so the app and its in-process room scheduler may pause until the next
request wakes the service. Keep a single application instance: active room
schedulers are process-local and are not coordinated between replicas. Railway
database usage may incur charges according to the selected Railway plan.
Never commit `.env` or production credentials; configure secrets in the hosting
provider dashboards.

## Game rules

- The board is 9×9. A1 is the bottom-left square and I9 is the top-right.
- Each side receives nine pieces placed randomly in the 4×4 corner area around
  its home square. The home square itself remains empty. Each side starts with
  at least one Búa, one Kéo, and one Bao.
- A turn moves one piece by one square in any of the eight directions.
- Búa captures Kéo, Kéo captures Bao, and Bao captures Búa. Pieces of the same
  type block each other; a losing piece cannot enter an enemy-occupied square.
  Friendly pieces always block movement.
- An invalid move leaves the board unchanged and passes the turn.
- A player wins by moving a piece onto the opponent's home square or capturing
  every opposing piece. Capturing all pieces of one type does not win the match.
  A match is a draw after 1,000 turns if neither side has won.
- The match engine enforces all rules. Bot source code only chooses a piece and
  destination; it cannot change the board or rule configuration.

## Bot code contract

Bot source code is a synchronous JavaScript function body. The engine calls it
as `function(input) { ... }`. `input` contains:

- `playerId`, `turn`, and `boardSize`.
- `home` and `target` coordinates for the bot.
- `pieces.own` and `pieces.opponent`, with each piece's `id`, `type`, `x`, and
  `y`.
- `legalMoves`, the exact moves currently allowed by the rules. Each move has
  a `pieceId`, destination `to: { x, y, name }`, and optional capture details.
- `rules`, containing the piece types, capture cycle, movement rule, and
  invalid-move behavior.

Return one move from `legalMoves`:

```js
const moves = input.legalMoves || [];
const bestMove = [...moves].sort((a, b) => {
  const captureDifference =
    Number(Boolean(b.capturePieceId)) - Number(Boolean(a.capturePieceId));
  if (captureDifference) return captureDifference;

  const target = input.target;
  const distanceA =
    Math.abs(a.to.x - target.x) + Math.abs(a.to.y - target.y);
  const distanceB =
    Math.abs(b.to.x - target.x) + Math.abs(b.to.y - target.y);
  return distanceA - distanceB;
})[0];

if (!bestMove) return null;
return { pieceId: bestMove.pieceId, to: bestMove.to };
```

Returning `null` or an invalid move consumes the bot's turn without moving a
piece. Use **Kiểm tra nước đi** in the bot editor to execute the code against a
sample board before saving.

## Bot and match APIs

Authenticated routes are under `/api`:

- `POST /bots` creates a bot; `PATCH /bots/:id` updates one.
- `POST /bots/test` runs unsaved source code on a sample board.
- `GET /bots` lists the signed-in user's bots; `GET /bots/public` lists active,
  public opponents without exposing their source.
- `POST /matches` creates a match using `{ "botIds": [myBotId, opponentBotId] }`.
- `POST /matches/:id/run` runs exactly one bot turn and saves the board.
- `PATCH /matches/:id/bot` accepts
  `{ "participantId": 1, "botId": 2 }` to switch the player's active bot while
  the opponent's turn is current. The replacement bot is used on the player's
  next turn.
- `GET /matches/:id` returns the saved board and turn history.
- `GET /users/profile` and `PATCH /users/profile` read and update the signed-in
  user's username; password hashes are never returned.
- `GET /users/stats` returns bot, submission, match, and win counts.
- `PATCH /users/password` changes the password after checking the current one.
- `GET /submissions` returns the caller's paginated bot-test history, and
  `POST /submissions` runs a saved bot or submitted JavaScript once on a fresh
  sample board. Results are `accepted` (legal move), `rejected` (invalid move),
  or `failed` (execution error); this is a code check, not a ranked match.

## Phòng đấu

Người chơi đăng nhập và có bot đang hoạt động để tạo hoặc tham gia phòng.
Phòng công khai xuất hiện trong danh sách; phòng riêng tư được tìm theo tên.
Mọi người chơi và người xem đều nhập mật khẩu phòng, nhưng người chơi có thể
vào lại phòng bằng tài khoản sau khi mất kết nối mà không cần nhập lại mật khẩu.
Người xem không cần tài khoản; token xem và trạng thái hiện diện được lưu theo
phiên trình duyệt.
Mật khẩu phòng được hiển thị trong trang chi tiết cho người chơi và người xem
đã được cấp quyền; danh sách phòng không tiết lộ mật khẩu.
Mỗi tài khoản chỉ có thể là người chơi trong một phòng tại một thời điểm. Cần
rời phòng hiện tại trước khi tạo phòng mới hoặc tham gia phòng khác; việc chỉ
xem một phòng không tính là tham gia với tư cách người chơi.

Trong phòng chờ, mỗi người chơi chọn bot của mình và xác nhận sẵn sàng; chủ
phòng chỉ bắt đầu khi cả hai đã sẵn sàng. Khi trận bắt đầu, máy chủ tự động
chạy lượt nên việc đóng tab không làm trận dừng hoặc xử người chơi thua. Mỗi
người có 30 giây tạm dừng tích lũy trong trận; trong lúc tạm dừng có thể đổi bot,
và bot mới được dùng từ lượt kế tiếp. Chủ phòng có thể giải tán phòng bất cứ
lúc nào; nếu trận đang chạy thì trận sẽ dừng. Mất kết nối không tự xóa phòng,
ghế người chơi hoặc làm dừng trận; người chơi phải chủ động rời phòng. Sau trận,
một người chơi có thể mời đấu
tiếp; đối thủ có 10 giây để đồng ý hoặc từ chối. Nếu chấp nhận, cả hai trở lại
sảnh chờ để chọn bot và sẵn sàng cho trận tiếp theo; nếu từ chối, người nhận lời
mời rời phòng. Sau mỗi lượt, trận chờ ít nhất 5 giây mới chạy lượt tiếp theo;
thời gian bot suy nghĩ được cộng thêm nếu bot chạy lâu hơn.

Trang [bot-guide.html](./public/bot-guide.html) hướng dẫn dữ liệu đầu vào, định
dạng nước đi và ví dụ JavaScript có thể dùng làm điểm bắt đầu.

Áp dụng schema mới bằng `npx prisma migrate deploy` trước khi chạy phiên bản có
phòng đấu. Bộ lập lịch trận hiện hoạt động trong một tiến trình máy chủ; không
nên chạy nhiều bản sao ứng dụng cùng lúc nếu chưa có cơ chế khóa/điều phối dùng
chung.

## Bạn bè

Trang [friends.html](./public/friends.html) hỗ trợ tìm người theo tên, gửi và
phản hồi lời mời kết bạn, xem trạng thái online/offline, xóa bạn và gửi lời mời
thi đấu. Trong sảnh chờ, chủ phòng cũng có thể mời bạn bè đang trực tuyến vào
phòng. Lời mời thi đấu và lời mời vào phòng chờ hết hạn sau 10 giây; lời mời kết
bạn không tự hết hạn. Áp dụng schema mới bằng `npx prisma migrate deploy`.

Email changes are not available until the application supports email
verification. Password changes do not revoke JWT sessions on other devices.
