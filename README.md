# OTT Code Arena

OTT Code Arena là nền tảng để người chơi viết bot JavaScript, C++ hoặc Python tự chọn nước đi
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

- Bàn cờ có kích thước 9×9. Ô A1 nằm ở góc trên bên trái. Nhà chính của bên A
  là A9 ở góc dưới bên trái; nhà chính của bên B là I1 ở góc trên bên phải.
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

JavaScript là phần thân của một hàm chạy đồng bộ theo dạng `function(input) { ... }`.
C++ và Python là chương trình hoàn chỉnh: đọc một JSON object từ `stdin` và in
đúng một JSON action ra `stdout`; không in log vào `stdout`. Đối tượng `input`
tuân theo Bot Arena Protocol v2 và gồm:

- `protocolVersion`, `playerId`, `turn` và `boardSize`.
- Tọa độ `home` và `target` của bot.
- `pieces.own` và `pieces.opponent`; mỗi quân có các thuộc tính `id`, `type`,
  `x` và `y`.
- `rules`, gồm các loại quân, vòng ăn quân, tám độ lệch di chuyển hợp lệ,
  điều kiện thắng và cách xử lý nước đi không hợp lệ.

Bot phải tự đọc `pieces.own`, `pieces.opponent` và `rules` để chọn quân rồi
tính một ô đích. Ví dụ tối giản:
```js
const piece = input.pieces.own[0];
if (!piece) return null;
return { pieceId: piece.id, to: { x: piece.x + 1, y: piece.y } };
```

Trả về `null` sẽ tiêu tốn lượt của bot nhưng không di chuyển quân. Kết quả sai
cấu trúc hoặc vi phạm luật sẽ bị game engine từ chối.
Mỗi lượt chỉ được di chuyển đúng một ô theo một trong tám hướng liền kề, giống
quân Tướng trong cờ tướng. Luật ăn quân, quân bị chặn, điều kiện thắng và các
luật khác luôn do game engine kiểm tra, không do bot tự quyết định. Bot cũ dùng
Protocol v1 vẫn được hỗ trợ; v1 có thêm `legalMoves` để tương thích ngược.
Trước khi lưu, hãy dùng nút **Kiểm tra nước đi** trong trình soạn thảo bot để mở
playground. Tại đó, đặt đúng một quân của mình, thêm các quân đối thủ tùy ý,
xóa quân nếu cần rồi chạy đúng một lượt. Bố cục chỉ là dữ liệu đầu vào; server
tự tạo ID quân, chạy bot trong sandbox và xác minh nước đi theo luật chính thức.

## API về bot và trận đấu

Các API yêu cầu đăng nhập nằm dưới đường dẫn `/api`:

- `POST /bots` tạo bot; `PATCH /bots/:id` cập nhật bot.
- `POST /bots/test` chạy thử mã nguồn chưa lưu trên bàn cờ mẫu với
  `language` là `javascript`, `cpp` hoặc `python`.
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
  `POST /submissions` chạy một lần bot đã lưu hoặc mã JavaScript/C++/Python được gửi lên
  trên bàn cờ mẫu mới. Có thể gửi thêm `testState.pieces` với các quân dạng
  `{ "side": "own" | "opponent", "type": "bua" | "keo" | "bao", "x": 1, "y": 1 }`
  để kiểm tra một thế cờ cụ thể; server luôn kiểm tra lại số lượng, vị trí và
  luật chơi. Kết quả gồm `accepted` (nước đi hợp lệ), `rejected` (nước đi không
  hợp lệ) hoặc `failed` (lỗi khi chạy). Đây là kiểm tra mã nguồn, không phải
  trận đấu xếp hạng.

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
dạng nước đi và ví dụ JavaScript, C++/Python có thể dùng làm điểm bắt đầu. Đặc
tả đầy đủ nằm ở [Bot Arena Protocol v2](./docs/bot-arena-protocol.md); Protocol
v1 vẫn được hỗ trợ cho bot cũ.

## Bot runner và sandbox

Bot được chạy ngoài tiến trình Express bằng adapter tương ứng: Node.js cho
JavaScript, interpreter cấu hình ở `BOT_PYTHON_PATH` cho Python và compiler ở
`BOT_CPP_COMPILER` cho C++. Ba adapter dùng chung stdin/stdout protocol, giới
hạn source/input/output và timeout. C++ được biên dịch trong thư mục tạm rồi
executable và file tạm được xóa sau mỗi lượt.

Runner bắt buộc có sandbox hệ điều hành: macOS dùng `sandbox-exec`, Linux dùng
`bwrap`. Sandbox chặn mạng, chặn đọc thư mục người dùng/secrets và chặn ghi
ngoài thư mục tạm. Nếu sandbox không khả dụng, bot bị từ chối với
`BOT_SANDBOX_UNAVAILABLE`; hệ thống không fallback sang chạy code trực tiếp
trên host. `sandbox-exec` là cơ chế phát triển/triển khai macOS; production nên
dùng worker Linux với sandbox được kiểm định và không chạy privileged.

Các giới hạn runtime được cấu hình qua `BOT_TIMEOUT_MS`,
`BOT_MAX_TIMEOUT_MS`, `BOT_MAX_OUTPUT_BYTES`, `BOT_MAX_SOURCE_LENGTH` và
`BOT_MAX_INPUT_LENGTH`. Không có API key hay secret nào được truyền vào bot.

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
