# Trái Tim 3D · C-Drama Idol Starlight

Trang web vẽ **Trái Tim 3D tương tác kéo thả** xây dựng bằng **Three.js + Vite**, tối ưu **responsive** cho Mobile, Tablet và Desktop, kèm hiệu ứng vẽ trái tim 3D từ từ khi tải trang, bầu trời sao vũ trụ với ngôi sao highlight và sự kiện click mở bộ sưu tập **14 Idol C-Drama**.

## Tính năng chính
- **Hiệu ứng vẽ trái tim 3D khi mới vào trang**: Hai tia sáng sao băng phác họa viền tim 3D từ đáy lên đỉnh kèm lưới tinh vân, khối ruby pha lê và hạt hào quang hiện dần hoàn chỉnh.
- **Tương tác kéo thả linh hoạt**:
  - `Xoay 360°`: Xoay quanh trái tim, zoom cuộn chuột / chụm hai ngón cảm ứng.
  - `Kéo thả tự do`: Kéo trực tiếp trái tim 3D hoặc các thẻ ảnh idol quanh trái tim đến vị trí bất kỳ.
- **Click trái tim mở ảnh Idol C-Drama**: Bung thẻ ảnh 3D xoay quanh trái tim và mở gallery lọc theo `Tất cả / Nữ thần / Nam thần`, xáo trộn và Lightbox phóng to hỗ trợ vuốt cảm ứng & bàn phím.
- **Responsive toàn diện**: Tự động cân chỉnh góc nhìn camera (`fov`, khoảng cách), `100dvh`, `safe-area-inset-*` và lưới ảnh 2 / 3 / 5 cột.

## Cài đặt & chạy cục bộ

```bash
npm install
npm run dev
```

## Kiểm thử & đóng gói Deploy

```bash
# Chạy toàn bộ unit & integration test (Vitest)
npm test

# Đóng gói sản phẩm cho môi trường production
npm run build

# Xem trước bản build production
npm run preview
```

Thư mục xuất bản sau khi build là `dist/` — có thể deploy trực tiếp lên **Vercel**, **Netlify**, **Cloudflare Pages** hoặc **GitHub Pages** (`base: './'` đã cấu hình sẵn trong `vite.config.js`).

## Bản quyền ảnh chân dung
Toàn bộ ảnh chân dung Idol C-Drama trong `public/idols/` đều được lấy từ **Wikimedia Commons** theo giấy phép Creative Commons (`CC BY` / `CC BY-SA`), ghi rõ tác giả trong thẻ dữ liệu và giao diện Lightbox.
