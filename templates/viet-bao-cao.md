---
name: Viết báo cáo hoặc tài liệu
description: Nhờ công ty đọc code và viết một tài liệu (không sửa code chính).
kind: epic
fields:
  - { key: chu_de, label: Chủ đề, placeholder: "Ví dụ: Cách dữ liệu đi từ API tới giao diện" }
  - { key: doi_tuong, label: Người đọc, required: false, placeholder: "Ví dụ: lập trình viên mới vào dự án" }
title: "Tài liệu: {{chu_de}}"
acceptance: |
  - Tài liệu nêu đúng theo code hiện tại, mọi tên file và hàm được nhắc đều có thật.
  - Có mục lục ngắn và ví dụ cụ thể, không chép lại nguyên mã.
---
Hãy đọc code của dự án và viết một tài liệu ngắn gọn về chủ đề sau. Không sửa code chính.

## Chủ đề
{{chu_de}}

## Người đọc
{{doi_tuong}}

Đặt tài liệu trong thư mục tài liệu của dự án (docs/) nếu có, nếu không thì nêu rõ nơi bạn chọn đặt.
