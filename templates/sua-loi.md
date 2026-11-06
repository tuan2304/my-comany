---
name: Sửa lỗi
description: Báo một lỗi để công ty tìm nguyên nhân, sửa và có test chống lặp lại.
kind: epic
fields:
  - { key: mo_ta, label: Mô tả lỗi, multiline: true, placeholder: "Đang thấy gì, đáng lẽ phải thế nào" }
  - { key: cach_tai_hien, label: Cách tái hiện, multiline: true, required: false, placeholder: "Các bước, dữ liệu vào, thông báo lỗi" }
title: "Sửa lỗi: {{mo_ta}}"
acceptance: |
  - Lỗi không còn xảy ra theo cách tái hiện ở trên.
  - Có một test tự động mô tả lỗi này và đạt sau khi sửa.
  - Toàn bộ test hiện có vẫn đạt.
---
Có một lỗi cần sửa.

## Mô tả lỗi
{{mo_ta}}

## Cách tái hiện
{{cach_tai_hien}}

Hãy tìm nguyên nhân gốc trước khi sửa (không vá triệu chứng), sửa ở đúng chỗ, và thêm test để lỗi này không quay lại.
