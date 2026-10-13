# Bot Arena Protocol v2

Bot Arena dùng một hợp đồng thực thi chung cho JavaScript, Python và C++.
Ngôn ngữ chỉ thay đổi cách viết source; game engine luôn nhận cùng một action
đã được runner kiểm tra.

## Input

Mỗi lượt, runner gửi một JSON object qua `stdin` cho Python/C++ và truyền cùng
object đó vào hàm bot JavaScript:

```json
{
  "protocolVersion": 2,
  "playerId": "1",
  "turn": 0,
  "boardSize": 9,
  "home": {"x": 0, "y": 8, "name": "a9"},
  "target": {"x": 8, "y": 0, "name": "i1"},
  "pieces": {"own": [], "opponent": []},
  "rules": {}
}
```

Bot tự phân tích `pieces.own`, `pieces.opponent`, `target`, `home` và `rules` để
chọn quân, sau đó tự tính một ô đích. `rules.movement.allowedDeltas` liệt kê
đúng tám độ lệch hợp lệ; bot không nhận sẵn danh sách nước đi.

## Output

Bot phải ghi đúng một JSON value ra `stdout`:

```json
{"pieceId":"piece1","to":{"x":3,"y":4}}
```

Hoặc `null` khi bot không chọn nước đi. Log/debug phải ghi vào `stderr`.
Runner kiểm tra JSON và schema; game engine là nơi duy nhất xác minh `pieceId`,
tọa độ và toàn bộ luật thực tế, rồi mới tự cập nhật state bàn cờ. Vì vậy bot không
được tự trả về một tọa độ cách xa quân đang đi, bỏ qua quân chặn, ăn một loại
quân không khắc chế được hoặc tự quyết định điều kiện thắng. Những nước như
vậy bị từ chối và không làm thay đổi bàn cờ.

## Protocol v1 legacy

Bot đã lưu với `protocolVersion: 1` tiếp tục nhận thêm `legalMoves` và phải
chọn một phần tử trong danh sách đó. Đây là lớp tương thích ngược; bot mới
được tạo với v2.

## Runtime contract

- JavaScript là function body đồng bộ, dùng biến `input`.
- Python là chương trình hoàn chỉnh đọc JSON từ `stdin` và in JSON ra `stdout`.
- C++ là chương trình hoàn chỉnh, biên dịch bằng C++17, đọc JSON từ `stdin` và
  in JSON ra `stdout`.
- Không có package cài động, mạng, API key, secret hoặc database credential
  trong môi trường bot.
- Lỗi compile, runtime, timeout, sandbox, output rỗng/quá lớn và JSON sai được
  chuẩn hóa thành lỗi runner nội bộ.

## Isolation

Source chạy trong tiến trình con, thư mục tạm riêng, môi trường biến thành phần
tối thiểu và sandbox hệ điều hành. macOS dùng `sandbox-exec`; Linux yêu cầu
`bwrap`. Khi sandbox không khả dụng, runner từ chối thực thi và không chạy
fallback trực tiếp trên host.
