# Bot Arena Protocol v1

Bot Arena dùng một hợp đồng thực thi chung cho JavaScript, Python và C++.
Ngôn ngữ chỉ thay đổi cách viết source; game engine luôn nhận cùng một action
đã được runner kiểm tra.

## Input

Mỗi lượt, runner gửi một JSON object qua `stdin` cho Python/C++ và truyền cùng
object đó vào hàm bot JavaScript:

```json
{
  "protocolVersion": 1,
  "playerId": "1",
  "turn": 0,
  "boardSize": 9,
  "home": {"x": 0, "y": 0, "name": "a1"},
  "target": {"x": 8, "y": 8, "name": "i9"},
  "pieces": {"own": [], "opponent": []},
  "legalMoves": [],
  "rules": {}
}
```

`legalMoves` là nguồn tham khảo chính xác cho các nước bot được phép chọn.
Các field trạng thái khác không cho phép bot thay đổi game state.

## Output

Bot phải ghi đúng một JSON value ra `stdout`:

```json
{"pieceId":"piece1","to":{"x":3,"y":4}}
```

Hoặc `null` khi bot không chọn nước đi. Log/debug phải ghi vào `stderr`.
Runner kiểm tra JSON, schema, `pieceId`, tọa độ và sự tồn tại của nước đi trong
`legalMoves`; game engine vẫn xác minh lại theo luật thực tế.

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
