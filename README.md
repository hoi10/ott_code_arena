# OTT Code Arena

OTT Code Arena là nền tảng để người chơi viết bot JavaScript tự chọn nước đi
trong các trận Kéo · Búa · Bao trên bàn cờ.

## Chạy ứng dụng trên máy cá nhân

1. Sao chép `.env.example` thành `.env`, sau đó cấu hình `DATABASE_URL` và
   `JWT_SECRET` có ít nhất 32 ký tự.
2. Áp dụng các migration cho cơ sở dữ liệu bằng `npx prisma migrate deploy`.
3. Khởi động ứng dụng bằng `npm start`.
4. Chạy các bài kiểm thử tự động bằng `npm test`.

## Đưa ứng dụng lên Internet bằng Render và Railway

Kho mã nguồn có cấu hình Render Blueprint trong `render.yaml`. Cấu hình này
chạy ứng dụng Express dưới dạng một dịch vụ web duy nhất, phục vụ cả giao diện
và API, áp dụng migration Prisma khi khởi động, đồng thời kiểm tra trạng thái
qua `/api/health`.

1. Đẩy kho mã nguồn này lên một nhà cung cấp Git và tạo dịch vụ MySQL trên
   Railway.
2. Trên Railway, bật quyền truy cập TCP công khai cho MySQL, sau đó lấy máy chủ,
   cổng, tên cơ sở dữ liệu, tên người dùng và mật khẩu dùng cho kết nối công
   khai. Không dùng tên máy chủ riêng của Railway trong cấu hình Render.
3. Trên Render, tạo Blueprint mới từ kho mã nguồn. Đặt `DATABASE_URL` theo định
   dạng `mysql://USER:PASSWORD@HOST:PORT/DATABASE`, sử dụng thông tin kết nối
   TCP công khai từ Railway. Nếu tên người dùng hoặc mật khẩu có ký tự đặc biệt,
   hãy mã hóa URL các ký tự đó. Render sẽ tự tạo `JWT_SECRET` cho dịch vụ.
4. Triển khai và chờ `/api/health` báo trạng thái khỏe mạnh. Render chạy
   `prisma migrate deploy` trước khi khởi động ứng dụng; cần giữ thư mục
   `prisma/migrations` trong Git.

Blueprint sử dụng gói dịch vụ web miễn phí của Render. Dịch vụ miễn phí có thể
tạm dừng khi không hoạt động; ứng dụng và bộ lập lịch phòng đấu chạy trong tiến
trình đó cũng có thể ngưng cho đến khi có yêu cầu tiếp theo đánh thức dịch vụ.
Chỉ chạy một bản ứng dụng: bộ lập lịch phòng đấu hiện lưu trạng thái trong từng
tiến trình và chưa điều phối giữa nhiều bản sao. Railway có thể tính phí cơ sở
dữ liệu tùy theo gói đã chọn. Không đưa `.env` hoặc thông tin xác thực môi
trường production vào Git; hãy cấu hình các giá trị bí mật trên trang quản lý
của nhà cung cấp dịch vụ.

## Luật chơi

- Bàn cờ có kích thước 9×9. Ô A1 nằm ở góc dưới bên trái, ô I9 nằm ở góc trên
  bên phải.
- Mỗi bên có chín quân được đặt ngẫu nhiên trong vùng 4×4 ở góc quanh nhà của
  mình. Ô nhà luôn để trống. Mỗi bên bắt đầu với ít nhất một quân Búa, một quân
  Kéo và một quân Bao.
- Mỗi lượt, người chơi di chuyển một quân một ô theo một trong tám hướng.
- Búa ăn Kéo, Kéo ăn Bao, Bao ăn Búa. Hai quân cùng loại chặn nhau; quân đang
  thua không thể đi vào ô có quân đối phương. Quân cùng phe luôn chặn đường
  nhau.
- Nước đi không hợp lệ không làm thay đổi bàn cờ và lượt được chuyển cho đối
  phương.
- Người chơi thắng khi đưa một quân vào nhà đối phương hoặc ăn hết toàn bộ quân
  của đối phương. Ăn hết quân của một loại không làm trận đấu kết thúc. Nếu
  chưa có bên thắng sau 1.000 lượt, trận đấu hòa.
- Bộ máy trận đấu thực thi toàn bộ luật. Mã nguồn bot chỉ chọn quân và ô đích,
  không thể thay đổi bàn cờ hoặc cấu hình luật.

## Quy ước viết mã bot

Mã nguồn bot là phần thân của một hàm JavaScript chạy đồng bộ. Bộ máy gọi mã
theo dạng `function(input) { ... }`. Đối tượng `input` gồm:

- `playerId`, `turn` và `boardSize`.
- Tọa độ `home` và `target` của bot.
- `pieces.own` và `pieces.opponent`; mỗi quân có các thuộc tính `id`, `type`,
  `x` và `y`.
- `legalMoves`, danh sách chính xác các nước đi hợp lệ ở lượt hiện tại. Mỗi
  nước đi có `pieceId`, ô đích `to: { x, y, name }` và thông tin ăn quân nếu
  có.
- `rules`, gồm các loại quân, vòng ăn quân, quy tắc di chuyển và cách xử lý
  nước đi không hợp lệ.

Hãy trả về một nước đi trong `legalMoves`:
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

Trả về `null` hoặc một nước đi không hợp lệ sẽ tiêu tốn lượt của bot nhưng
không di chuyển quân. Trước khi lưu, hãy dùng nút **Kiểm tra nước đi** trong
trình soạn thảo bot để chạy thử mã trên một bàn cờ mẫu.

## API về bot và trận đấu

Các API yêu cầu đăng nhập nằm dưới đường dẫn `/api`:

- `POST /bots` tạo bot; `PATCH /bots/:id` cập nhật bot.
- `POST /bots/test` chạy thử mã nguồn chưa lưu trên bàn cờ mẫu.
- `GET /bots` liệt kê bot của người dùng đã đăng nhập; `GET /bots/public` liệt kê
  các bot đối thủ công khai đang hoạt động mà không tiết lộ mã nguồn.
- `POST /matches` tạo trận đấu bằng dữ liệu
  `{ "botIds": [myBotId, opponentBotId] }`.
- `POST /matches/:id/run` chạy đúng một lượt bot và lưu bàn cờ.
- `PATCH /matches/:id/bot` nhận dữ liệu `{ "participantId": 1, "botId": 2 }`
  để đổi bot đang dùng khi lượt hiện tại thuộc về đối phương. Bot mới sẽ được
  dùng trong lượt tiếp theo của người chơi.
- `GET /matches/:id` trả về bàn cờ đã lưu và lịch sử các lượt.
- `GET /users/profile` và `PATCH /users/profile` đọc và cập nhật tên người dùng
  đã đăng nhập; không bao giờ trả về mã băm mật khẩu.
- `GET /users/stats` trả về số lượng bot, lượt gửi kiểm thử, trận đấu và trận
  thắng.
- `PATCH /users/password` đổi mật khẩu sau khi xác minh mật khẩu hiện tại.
- `GET /submissions` trả về lịch sử kiểm thử bot có phân trang của người dùng;
  `POST /submissions` chạy một lần bot đã lưu hoặc mã JavaScript được gửi lên
  trên bàn cờ mẫu mới. Kết quả gồm `accepted` (nước đi hợp lệ), `rejected`
  (nước đi không hợp lệ) hoặc `failed` (lỗi khi chạy). Đây là kiểm tra mã nguồn,
  không phải trận đấu xếp hạng.

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

Chưa thể đổi địa chỉ email cho đến khi ứng dụng hỗ trợ xác minh email. Việc đổi
mật khẩu hiện không thu hồi các phiên JWT trên thiết bị khác.
