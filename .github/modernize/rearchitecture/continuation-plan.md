# Kế hoạch tiếp tục phần bot C++ và Python

## Trạng thái đã xác nhận

- Đã có lựa chọn ngôn ngữ trên giao diện tạo/sửa bot và tên file `main.cpp`/`main.py`.
- Validator, Prisma model, submission flow và match engine đã nhận `cpp`/`python`.
- `src/bot-runner/runner.js` đã gửi mã nguồn cùng JSON input tới Judge0, chọn language ID 54/71, giới hạn CPU/wall time/memory và parse JSON stdout.
- Bộ test hiện tại đạt 51/52; lỗi còn lại là assertion cũ trong `tests/validators.test.js` vẫn coi Python là ngôn ngữ không hỗ trợ.
- Smoke test mô phỏng Judge0 xác nhận mapping language ID và JSON stdin/stdout cho cả C++ và Python.

## Thứ tự triển khai đề xuất

1. Đồng bộ test và hợp đồng ngôn ngữ: sửa assertion stale; thêm test validator cho cả ba ngôn ngữ và test update bot.
2. Bổ sung test runner với fake fetch: request URL/body, language IDs, stdin JSON, compile error, runtime error, timeout, empty stdout, stdout không phải JSON, và giới hạn kết quả.
3. Chốt adapter contract cho C++/Python: chương trình đọc một JSON object từ stdin và in đúng một JSON action ra stdout; mọi log phải đi stderr.
4. Bổ sung ví dụ C++ và Python vào `public/bot-guide.html`, `README.md`, `docs/api.md`; mô tả field input, output, timeout và lỗi biên dịch.
5. Kiểm thử tích hợp có Judge0: test `/bots/test`, `/submissions`, một lượt match trực tiếp và một lượt room scheduler bằng bot C++/Python thật.
6. Kiểm tra UI: tạo, lưu nháp, sửa, test, lưu, chọn bot public và chạy match; xác nhận không lộ source code ở public/room responses.
7. Sau khi toàn bộ test đạt, mới cân nhắc tách `runner.js` thành adapter JavaScript/Judge0; không mở rộng sang refactor room/friend trong cùng lượt.

## Điều kiện hoàn thành

- `npm test` đạt 52/52 hoặc cao hơn sau khi bổ sung test.
- C++ và Python đều chạy được trong Judge0 cấu hình thực tế.
- Một action hợp lệ từ hai ngôn ngữ được `gameRules.validateMove` chấp nhận.
- Compile/runtime/timeout/unavailable được ánh xạ nhất quán về `failed` hoặc lỗi lượt theo hợp đồng hiện tại.
- Tài liệu không còn mô tả sản phẩm là chỉ hỗ trợ JavaScript.
- Không đưa giá trị bí mật từ `.env` vào log, tài liệu hoặc commit.

## Blocker cần xử lý trước kiểm thử thật

Judge0 phải đang chạy và `JUDGE0_URL`/language IDs phải trỏ đúng môi trường. Hiện chưa có bằng chứng runtime từ Judge0 thật; chỉ mới có smoke test bằng fake fetch.
