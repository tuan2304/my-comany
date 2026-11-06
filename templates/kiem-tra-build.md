---
name: Kiểm tra build và test
description: Chạy test của dự án và báo lại kết quả. Không sửa code. Hợp để đặt lịch mỗi sáng.
kind: job
team: quality
fields: []
title: Kiểm tra build và test
acceptance: |
  - Nêu rõ lệnh đã chạy, số test đạt và số test lỗi.
  - Nếu có lỗi: nêu test nào lỗi, thông báo lỗi và nguyên nhân có thể (đọc code liên quan), không sửa code chính.
---
Chạy bộ test của dự án bằng lệnh khai trong hồ sơ dự án (mục commands.test) và báo cáo kết quả.

Không sửa code chính và không tạo file mới. Báo cáo cuối của bạn là sản phẩm: ngắn gọn, có số liệu, và nếu mọi thứ đạt thì nói thẳng là đạt.
