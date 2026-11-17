# SMART HEALTHCARE — Hệ thống chăm sóc sức khỏe thông minh cho người cao tuổi

Ứng dụng web chăm sóc sức khỏe theo thời gian thực dành cho người cao tuổi và gia đình:
- **Hệ thống đo sức khỏe**: Theo dõi cảm biến **MQ-135** (AQI / nồng độ khí) và **DHT22** (nhiệt độ, độ ẩm) với **máy lọc không khí vận hành tự động** theo mức độ ô nhiễm.
- **4 Khay Thuốc thông minh**: Lịch Sáng – Trưa – Chiều – Tối hỗ trợ nhiều cữ trong cùng buổi, ghi chú lưu ý trước khi uống thuốc, mô phỏng/điều khiển Servo ESP32, đèn LED, âm thanh nhắc và cảm biến hồng ngoại.
- **Hồ sơ sức khỏe & Nhật ký gia đình**: Biểu mẫu Hồ sơ Bệnh án Điện tử (hỗ trợ In / Xuất PDF) và mục Cảm nhận hôm nay kèm cảnh báo web & SMS cho người thân khi sức khỏe không ổn.
- **Mục SOS Khẩn cấp, Bác sĩ AI & Tài liệu y tế**: Nút SOS 1 chạm, tư vấn Bác sĩ AI theo đúng triệu chứng (có lưu ý thông tin chỉ mang tính tham khảo), thư viện tài liệu y tế có trích dẫn nguồn gốc & đường link bài báo và cho phép thêm mới.
- **Tài khoản & Cài đặt**: Đăng nhập/Đăng ký bằng Số điện thoại, Mật khẩu hoặc mã PIN 4 số; cấu hình kết nối mạch **ESP32 (Wi-Fi HTTP / USB Serial)**.

---

## Triển khai trực tiếp lên GitHub Pages

Dự án đã tích hợp sẵn workflow tự động tại `.github/workflows/deploy-pages.yml` và cấu hình đường dẫn tương đối (`base: './'`) để chạy trực tiếp trên **GitHub Pages** (`https://<ten-tai-khoan>.github.io/<ten-repo>/`).

### Các bước kích hoạt trên GitHub:
1. Tải toàn bộ mã nguồn lên repository GitHub (nhánh `main` hoặc `master`).
2. Trên GitHub, mở **Settings** → **Pages**.
3. Ở mục **Build and deployment → Source**, chọn **GitHub Actions**.
4. Chờ workflow **Deploy SMART HEALTHCARE to GitHub Pages** chạy xong (khoảng 1–2 phút) rồi mở link trang web được cấp.

> **Lưu ý khi chạy trên GitHub Pages:** Ứng dụng tự động nhận diện môi trường web tĩnh để lưu bền vững toàn bộ lịch uống thuốc, tài liệu y tế mới thêm, hồ sơ bệnh án, nhật ký gia đình và tài khoản trên trình duyệt (`localStorage`), không bị lỗi mất kết nối API. Nếu bạn có chạy thêm server Node (`npm start`) riêng trên cloud (Render / Railway / Cloud Run) để kết nối mạch ESP32 từ xa, chỉ cần thêm GitHub Repository Variable `VITE_API_BASE_URL` trỏ tới URL server đó.

---

## Chạy cục bộ (Full-stack Node + Vite + ESP32 API)

```bash
npm install
npm run dev
```

Hoặc build & chạy bản Production:

```bash
npm run build
NODE_ENV=production npm start
```
