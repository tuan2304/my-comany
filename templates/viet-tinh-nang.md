---
name: Viết tính năng
description: Giao một tính năng mới cho cả công ty (Giám đốc chia việc cho các team).
kind: epic
fields:
  - { key: ten, label: Tên tính năng, placeholder: "Ví dụ: Lọc đơn hàng theo ngày" }
  - { key: mo_ta, label: Mô tả, multiline: true, placeholder: "Người dùng làm gì, thấy gì, dữ liệu nào" }
  - { key: tieu_chi, label: Tiêu chí hoàn thành, multiline: true, required: false, placeholder: "Mỗi dòng một điều kiện kiểm tra được" }
title: "Tính năng: {{ten}}"
acceptance: |
  {{tieu_chi}}
  - Toàn bộ test hiện có và test mới đều đạt.
---
Cần thêm một tính năng mới.

## Tên
{{ten}}

## Mô tả
{{mo_ta}}

Hãy bám theo cấu trúc và quy ước sẵn có của dự án, không thêm thư viện mới nếu không thật sự cần.
